<?php
declare(strict_types=1);
session_start();
require __DIR__ . '/../api/bootstrap.php';

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

$cfg = app_config();
$error = '';
$flash = '';

if (isset($_GET['logout'])) {
    unset($_SESSION['owner_ok']);
    header('Location: /owner/');
    exit;
}

if (($_POST['form'] ?? '') === 'login') {
    $user = trim((string)($_POST['username'] ?? ''));
    $pass = (string)($_POST['password'] ?? '');
    if ($user === ($cfg['owner_username'] ?? 'owner') && $pass === ($cfg['owner_password'] ?? '')) {
        $_SESSION['owner_ok'] = true;
        header('Location: /owner/');
        exit;
    }
    $error = 'Invalid owner username or password.';
}

$authed = !empty($_SESSION['owner_ok']);
if ($authed) {
    try { migrate_legacy_support_email(); } catch (Throwable $e) {}
}
if ($authed && !empty($_SESSION['owner_flash'])) {
    $flash = (string)$_SESSION['owner_flash'];
    unset($_SESSION['owner_flash']);
}

// Secure KYC document viewer (avoids /uploads 404 on some hosts)
if ($authed && isset($_GET['kyc_doc'])) {
    kyc_stream_owner_doc((int)($_GET['id'] ?? 0), (string)($_GET['type'] ?? 'cac'));
}

if ($authed && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $form = $_POST['form'] ?? '';
    try {
        if ($form === 'settings') {
            setting_set('min_deposit', (string)(float)$_POST['min_deposit']);
            setting_set('min_withdraw', (string)(float)$_POST['min_withdraw']);
            setting_set('withdraw_commission_rate', (string)((float)$_POST['withdraw_commission'] / 100));
            setting_set('sales_commission_rate', (string)((float)$_POST['sales_commission'] / 100));
            setting_set('deposit_fee_rate', (string)((float)$_POST['deposit_fee'] / 100));
            setting_set('referral_reward_amount', (string)(float)($_POST['referral_reward'] ?? 5));
            setting_set('referral_min_deposit', (string)(float)($_POST['referral_min_deposit'] ?? 50));
            setting_set('support_telegram', trim((string)$_POST['support_telegram']));
            setting_set('support_email', trim((string)$_POST['support_email']));
            setting_set('payment_currency', strtoupper(trim((string)($_POST['payment_currency'] ?? 'NGN'))) === 'USD' ? 'USD' : 'NGN');
            setting_set('usd_ngn_rate', (string)max(1, (float)($_POST['usd_ngn_rate'] ?? 1600)));
            $flash = 'Platform settings saved.';
        }
        if ($form === 'plan') {
            $id = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$_POST['plan_id']));
            $stmt = db()->prepare('UPDATE plans SET name = ?, price = ?, daily_uploads = ?, approval_label = ? WHERE id = ?');
            $stmt->execute([
                trim((string)$_POST['name']),
                money_f($_POST['price']),
                (int)$_POST['daily_uploads'],
                trim((string)$_POST['approval_label']),
                $id,
            ]);
            if ($id === 'free') setting_set('free_daily_uploads', (string)(int)$_POST['daily_uploads']);
            $flash = 'Plan updated.';
        }
        if ($form === 'fx_rate') {
            setting_set('payment_currency', strtoupper(trim((string)($_POST['payment_currency'] ?? 'NGN'))) === 'USD' ? 'USD' : 'NGN');
            $ngnRate = max(1, (float)($_POST['usd_ngn_rate'] ?? 1600));
            setting_set('usd_ngn_rate', (string)$ngnRate);
            $wc = wallet_currencies_get();
            foreach ($wc['local'] as &$row) {
                if (strtoupper((string)($row['code'] ?? '')) === 'NGN') $row['rate'] = $ngnRate;
            }
            unset($row);
            wallet_currencies_set($wc);
            $flash = 'Naira rate saved. New deposits & withdraws will use this rate.';
        }
        if ($form === 'gateway') {
            $webhookDefault = rtrim((string)(app_config()['app_url'] ?? 'https://acctventa.com'), '/') . '/api/index.php?action=webhook.flutterwave';
            $depositWebhook = trim((string)($_POST['deposit_webhook'] ?? ''));
            if ($depositWebhook === '' || strpos($depositWebhook, 'webhook.flutterwave') === false) {
                $depositWebhook = $webhookDefault;
            }
            $depositSecret = trim((string)($_POST['deposit_secret_key'] ?? ''));
            $withdrawProvider = strtolower(trim((string)($_POST['withdraw_provider'] ?? 'manual')));
            if (!in_array($withdrawProvider, ['none', 'paystack', 'flutterwave', 'stripe', 'nowpayments', 'manual'], true)) {
                $withdrawProvider = 'manual';
            }
            $stmt = db()->prepare('UPDATE gateway_settings SET
                deposit_provider=?, deposit_enabled=?, deposit_public_key=?, deposit_secret_key=?, deposit_webhook=?, deposit_notes=?,
                withdraw_provider=?, withdraw_enabled=?, withdraw_public_key=?, withdraw_secret_key=?, withdraw_webhook=?, withdraw_notes=?
                WHERE id=1');
            $stmt->execute([
                $_POST['deposit_provider'], isset($_POST['deposit_enabled']) ? 1 : 0, trim((string)$_POST['deposit_public_key']), $depositSecret, $depositWebhook, $_POST['deposit_notes'],
                $withdrawProvider,
                isset($_POST['withdraw_enabled']) ? 1 : 0,
                trim((string)($_POST['withdraw_public_key'] ?? '')),
                trim((string)($_POST['withdraw_secret_key'] ?? '')),
                trim((string)($_POST['withdraw_webhook'] ?? '')),
                (string)($_POST['withdraw_notes'] ?? ''),
            ]);
            $flash = 'Gateway settings saved.';
            if (strtolower((string)$_POST['deposit_provider']) === 'flutterwave' && !empty($_POST['deposit_enabled'])) {
                $ping = flw_ping_secret($depositSecret);
                if (!empty($ping['ok'])) {
                    $flash .= ' Flutterwave secret key verified.';
                } else {
                    $flash .= ' Warning: ' . ($ping['error'] ?? 'Flutterwave key check failed') . ' Deposits will not credit until this is fixed.';
                }
            }
        }
        if ($form === 'ban_user') {
            $uid = (int)$_POST['user_id'];
            db()->prepare('UPDATE users SET is_banned = ? WHERE id = ?')->execute([(int)$_POST['banned'], $uid]);
            $flash = ((int)$_POST['banned'] === 1) ? 'User banned.' : 'User unbanned.';
            $_SESSION['owner_flash'] = $flash;
            header('Location: ?tab=users&id=' . $uid);
            exit;
        }
        if ($form === 'verify_user') {
            $uid = (int)$_POST['user_id'];
            $verified = (int)$_POST['verified'] === 1 ? 1 : 0;
            db()->prepare('UPDATE users SET is_verified = ? WHERE id = ?')->execute([$verified, $uid]);
            if ($verified) {
                notify_user($uid, 'Account verified', 'Your Acctventa profile now shows a verified badge. Buyers will see it on your storefront and listings.', 'kyc');
                $flash = 'User verified — badge will show on their profile and listings.';
            } else {
                notify_user($uid, 'Verification removed', 'Your verified badge was removed by an admin.', 'kyc');
                $flash = 'Verification removed.';
            }
            $_SESSION['owner_flash'] = $flash;
            header('Location: ?tab=users&id=' . $uid);
            exit;
        }
        if ($form === 'kyc_review') {
            ensure_kyc_tables();
            $kid = (int)($_POST['kyc_id'] ?? 0);
            $decision = ($_POST['decision'] ?? '') === 'approve' ? 'approved' : 'rejected';
            $reason = trim((string)($_POST['reject_reason'] ?? ''));
            $stmt = db()->prepare('SELECT * FROM kyc_submissions WHERE id = ? LIMIT 1');
            $stmt->execute([$kid]);
            $kyc = $stmt->fetch();
            if (!$kyc) throw new RuntimeException('KYC submission not found');
            db()->prepare('UPDATE kyc_submissions SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                ->execute([$decision, $decision === 'rejected' ? $reason : '', 'Owner', $kid]);
            if ($decision === 'approve') {
                db()->prepare('UPDATE users SET is_verified = 1 WHERE id = ?')->execute([(int)$kyc['user_id']]);
                notify_user((int)$kyc['user_id'], 'Business verified', 'Your Business KYC was approved. You now have a verified seller badge.', 'kyc');
                $flash = 'KYC approved — user is now verified.';
            } else {
                notify_user((int)$kyc['user_id'], 'KYC needs attention', $reason !== '' ? $reason : 'Your Business KYC was not approved. Please resubmit clearer camera photos of your CAC and ID.', 'kyc');
                $flash = 'KYC rejected and user notified.';
            }
        }
        if ($form === 'login_as_user') {
            $uid = (int)$_POST['user_id'];
            $stmt = db()->prepare('SELECT id, email, name, is_banned FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$uid]);
            $row = $stmt->fetch();
            if (!$row) throw new RuntimeException('User not found');
            if ((int)$row['is_banned'] === 1) throw new RuntimeException('User is banned — unban first');
            $token = create_session($uid);
            header('Location: /owner-login-as.html?token=' . rawurlencode($token) . '&email=' . rawurlencode((string)$row['email']) . '&name=' . rawurlencode((string)$row['name']));
            exit;
        }
        if ($form === 'adjust_balance') {
            ensure_wallet_ledger_columns();
            $uid = (int)$_POST['user_id'];
            $amount = (float)$_POST['amount'];
            $note = trim((string)$_POST['note']);
            $asWithdrawable = !empty($_POST['as_withdrawable']);
            if ($amount >= 0) {
                if ($asWithdrawable) {
                    $pdo = db();
                    $pdo->beginTransaction();
                    try {
                        credit_withdrawable_earnings($pdo, $uid, $amount, 'sale', 'Owner adjust (withdrawable): ' . $note);
                        $pdo->commit();
                    } catch (Throwable $e) {
                        $pdo->rollBack();
                        throw $e;
                    }
                } else {
                    db()->prepare('UPDATE users SET balance = balance + ? WHERE id = ?')->execute([money_f($amount), $uid]);
                    db()->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'deposit\', ?, \'completed\', ?)')
                        ->execute([$uid, money_f($amount), 'Owner adjust: ' . $note]);
                }
            } else {
                $abs = abs($amount);
                db()->prepare('UPDATE users SET balance = balance - ?, withdrawable_balance = GREATEST(0, withdrawable_balance - ?) WHERE id = ?')
                    ->execute([money_f($abs), money_f($abs), $uid]);
                db()->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'withdrawal\', ?, \'completed\', ?)')
                    ->execute([$uid, money_f($abs), 'Owner adjust: ' . $note]);
            }
            $flash = 'Balance adjusted.';
            $_SESSION['owner_flash'] = $flash;
            header('Location: ?tab=users&id=' . $uid);
            exit;
        }
        if ($form === 'ad_status') {
            $status = (string)($_POST['status'] ?? '');
            $reason = trim((string)($_POST['reason'] ?? ''));
            $adId = (int)($_POST['ad_id'] ?? 0);
            $allowed = ['active', 'denied', 'removed', 'pending'];
            if ($adId < 1 || !in_array($status, $allowed, true)) {
                throw new RuntimeException('Invalid ad update');
            }
            $cur = db()->prepare('SELECT * FROM ads WHERE id = ? LIMIT 1');
            $cur->execute([$adId]);
            $adRow = $cur->fetch();
            if (!$adRow) throw new RuntimeException('Ad not found');

            // Approving / restocking must put stock back on the market
            if ($status === 'active') {
                $stock = (int)($adRow['stock'] ?? 0);
                if ($stock < 1) $stock = 1;
                db()->prepare('UPDATE ads SET status = ?, stock = ?, deny_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                    ->execute(['active', $stock, '', 'Owner', $adId]);
                try {
                    if (function_exists('notify_new_listing_launch') && (string)($adRow['status'] ?? '') !== 'active') {
                        notify_new_listing_launch($adId);
                    }
                } catch (Throwable $e) {}
                $flash = 'Ad approved and listed on the marketplace (stock ' . $stock . ').';
            } elseif ($status === 'removed') {
                db()->prepare('UPDATE ads SET status = ?, stock = 0, deny_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                    ->execute(['removed', $reason, 'Owner', $adId]);
                $flash = 'Ad removed from marketplace.';
            } else {
                db()->prepare('UPDATE ads SET status = ?, deny_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                    ->execute([$status, $reason, 'Owner', $adId]);
                $flash = 'Ad status updated.';
            }
            $ad = db()->query('SELECT seller_id, title FROM ads WHERE id=' . $adId)->fetch();
            if ($ad) {
                $msg = $reason !== '' ? $reason : ('Your listing "' . $ad['title'] . '" is now ' . $status);
                if ($status === 'active') $msg = 'Your listing "' . $ad['title'] . '" is live on the marketplace.';
                notify_user((int)$ad['seller_id'], 'Ad ' . $status, $msg, 'ad_review');
            }
            $_SESSION['owner_flash'] = $flash;
            $retFilter = preg_replace('/[^a-z]/', '', strtolower((string)($_POST['return_filter'] ?? 'pending')));
            if (!in_array($retFilter, ['all', 'pending', 'active', 'denied', 'removed'], true)) $retFilter = 'pending';
            header('Location: ?tab=ads&filter=' . rawurlencode($retFilter));
            exit;
        }
        if ($form === 'ad_status_bulk') {
            $status = (string)($_POST['status'] ?? 'active');
            $allowed = ['active', 'denied', 'removed'];
            if (!in_array($status, $allowed, true)) {
                throw new RuntimeException('Invalid bulk ad update');
            }
            $ids = $_POST['ad_ids'] ?? [];
            if (!is_array($ids)) $ids = [];
            $approved = 0;
            $skipped = 0;
            foreach ($ids as $rawId) {
                $adId = (int)$rawId;
                if ($adId < 1) continue;
                $cur = db()->prepare('SELECT * FROM ads WHERE id = ? LIMIT 1');
                $cur->execute([$adId]);
                $adRow = $cur->fetch();
                if (!$adRow) {
                    $skipped++;
                    continue;
                }
                if ($status === 'active') {
                    if ((string)($adRow['status'] ?? '') !== 'pending') {
                        $skipped++;
                        continue;
                    }
                    $stock = (int)($adRow['stock'] ?? 0);
                    if ($stock < 1) $stock = 1;
                    db()->prepare('UPDATE ads SET status = ?, stock = ?, deny_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                        ->execute(['active', $stock, '', 'Owner', $adId]);
                    try {
                        if (function_exists('notify_new_listing_launch')) {
                            notify_new_listing_launch($adId);
                        }
                    } catch (Throwable $e) {}
                    notify_user((int)$adRow['seller_id'], 'Ad active', 'Your listing "' . $adRow['title'] . '" is live on the marketplace.', 'ad_review');
                    $approved++;
                }
            }
            $flash = $approved > 0
                ? ('Approved ' . $approved . ' listing' . ($approved === 1 ? '' : 's') . ' on the marketplace.')
                : 'No pending listings were approved.';
            if ($skipped > 0) $flash .= ' (' . $skipped . ' skipped.)';
            $_SESSION['owner_flash'] = $flash;
            header('Location: ?tab=ads&filter=pending');
            exit;
        }
        if ($form === 'ad_restock') {
            $adId = (int)($_POST['ad_id'] ?? 0);
            $qty = max(1, (int)($_POST['qty'] ?? 1));
            $cur = db()->prepare('SELECT * FROM ads WHERE id = ? LIMIT 1');
            $cur->execute([$adId]);
            $adRow = $cur->fetch();
            if (!$adRow) throw new RuntimeException('Ad not found');
            db()->prepare("UPDATE ads SET stock = ?, status = 'active', deny_reason = '', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?")
                ->execute([$qty, 'Owner', $adId]);
            if ($adRow) {
                notify_user((int)$adRow['seller_id'], 'Ad restocked', 'Your listing "' . $adRow['title'] . '" is live again with stock ' . $qty . '.', 'ad_review');
            }
            $flash = 'Ad restocked and set active (stock ' . $qty . ').';
        }
        if ($form === 'tx_status') {
            $txId = (int)$_POST['tx_id'];
            $newStatus = (string)$_POST['status'];
            $tx = db()->prepare('SELECT * FROM transactions WHERE id = ?');
            $tx->execute([$txId]);
            $row = $tx->fetch();
            if ($row) {
                $old = $row['status'];
                $skipGenericStatus = false;
                // If cancelling/rejecting a pending withdrawal, refund the user
                if ($row['type'] === 'withdrawal' && $old === 'pending' && in_array($newStatus, ['cancelled', 'failed'], true)) {
                    ensure_wallet_ledger_columns();
                    db()->prepare('UPDATE users SET balance = balance + ?, withdrawable_balance = withdrawable_balance + ?, total_withdrawals = GREATEST(0, total_withdrawals - ?) WHERE id = ?')
                        ->execute([money_f($row['amount']), money_f($row['amount']), money_f($row['amount']), (int)$row['user_id']]);
                    notify_user((int)$row['user_id'], 'Withdrawal declined', 'Your withdrawal of $' . money_f($row['amount']) . ' was declined and refunded to your withdrawable balance.', 'wallet');
                }
                if ($row['type'] === 'withdrawal' && $old === 'pending' && $newStatus === 'completed') {
                    $forceManual = !empty($_POST['force_manual']);
                    if (!empty($_POST['note_edit'])) {
                        db()->prepare('UPDATE transactions SET note = ? WHERE id = ?')->execute([trim((string)$_POST['note_edit']), $txId]);
                        $row['note'] = trim((string)$_POST['note_edit']);
                    }
                    $urow = db()->prepare('SELECT payout_bank, payout_account, payout_account_name, payout_bank_code FROM users WHERE id = ?');
                    $urow->execute([(int)$row['user_id']]);
                    $urow = $urow->fetch() ?: [];
                    $merged = array_merge($row, $urow);
                    $pay = approve_withdrawal_payout($merged, 'Owner approved', $forceManual);
                    if (empty($pay['ok'])) {
                        throw new RuntimeException('Payout failed: ' . ($pay['error'] ?? 'unknown error'));
                    }
                    $flash = (!empty($pay['mode']) && $pay['mode'] === 'flutterwave')
                        ? (!empty($pay['awaiting'])
                            ? ('Withdrawal sent to Flutterwave' . (!empty($pay['amountNgn']) ? ' (₦' . number_format((float)$pay['amountNgn']) . ')' : '') . ' — status will update automatically when the bank confirms.')
                            : ('Withdrawal paid via Flutterwave' . (!empty($pay['amountNgn']) ? ' (₦' . number_format((float)$pay['amountNgn']) . ')' : '') . '.'))
                        : 'Withdrawal marked paid manually.';
                    $skipGenericStatus = true;
                }
                // Approving a pending deposit credits the wallet (crypto / manual)
                if (!$skipGenericStatus && $row['type'] === 'deposit' && $old === 'pending' && $newStatus === 'completed') {
                    db()->prepare('UPDATE users SET balance = balance + ?, total_deposits = total_deposits + ? WHERE id = ?')
                        ->execute([money_f($row['amount']), money_f($row['amount']), (int)$row['user_id']]);
                    notify_user((int)$row['user_id'], 'Deposit credited', 'Your deposit of $' . money_f($row['amount']) . ' was credited to your wallet (spendable — not withdrawable).', 'wallet');
                    try {
                        maybe_credit_referral_reward((int)$row['user_id']);
                    } catch (Throwable $e) {}
                }
                if (!$skipGenericStatus) {
                    if (!empty($_POST['note_edit'])) {
                        db()->prepare('UPDATE transactions SET status = ?, note = ? WHERE id = ?')
                            ->execute([$newStatus, trim((string)$_POST['note_edit']), $txId]);
                    } else {
                        db()->prepare('UPDATE transactions SET status = ? WHERE id = ?')->execute([$newStatus, $txId]);
                    }
                    $flash = 'Transaction status updated.';
                }
            } else {
                $flash = 'Transaction not found.';
            }
        }
        if ($form === 'currencies') {
            $localIn = $_POST['local'] ?? [];
            $cryptoIn = $_POST['crypto'] ?? [];
            if (!is_array($localIn) || !is_array($cryptoIn)) {
                throw new RuntimeException('Invalid currency form');
            }
            $local = [];
            foreach ($localIn as $row) {
                if (!is_array($row)) continue;
                $code = strtoupper(trim((string)($row['code'] ?? '')));
                if ($code === '') continue;
                $local[] = [
                    'code' => $code,
                    'name' => trim((string)($row['name'] ?? $code)),
                    'flag' => strtolower(trim((string)($row['flag'] ?? ''))),
                    'rate' => max(0.0001, (float)($row['rate'] ?? 1)),
                    'enabled' => !empty($row['enabled']),
                ];
            }
            $crypto = [];
            foreach ($cryptoIn as $row) {
                if (!is_array($row)) continue;
                $code = strtoupper(trim((string)($row['code'] ?? '')));
                if ($code === '') continue;
                $netsRaw = trim((string)($row['networks'] ?? ''));
                $nets = array_values(array_filter(array_map(static function ($n) {
                    return strtoupper(trim((string)$n));
                }, preg_split('/[,|]+/', $netsRaw) ?: [])));
                $addrIn = $row['addr'] ?? [];
                $addresses = [];
                if (is_array($addrIn)) {
                    foreach ($addrIn as $netKey => $addrVal) {
                        $nk = strtoupper(trim((string)$netKey));
                        if ($nk === '') continue;
                        $addresses[$nk] = trim((string)$addrVal);
                    }
                }
                // Ensure every listed network has an address key
                foreach ($nets as $n) {
                    if (!isset($addresses[$n])) $addresses[$n] = '';
                }
                $crypto[] = [
                    'code' => $code,
                    'name' => trim((string)($row['name'] ?? $code)),
                    'networks' => $nets ?: ['TRC20'],
                    'addresses' => $addresses,
                    'enabled' => !empty($row['enabled']),
                ];
            }
            if (!$local) {
                throw new RuntimeException('Add at least one local currency');
            }
            wallet_currencies_set(['local' => $local, 'crypto' => $crypto]);
            $flash = 'Currency rates saved. Deposit & withdraw will use the new rates.';
        }
        if ($form === 'order_status') {
            $oid = (int)$_POST['order_id'];
            $newStatus = (string)$_POST['status'];
            $order = db()->prepare('SELECT * FROM orders WHERE id = ?');
            $order->execute([$oid]);
            $o = $order->fetch();
            if (!$o) throw new RuntimeException('Order not found');
            if ($newStatus === 'cancelled' && ($o['status'] ?? '') !== 'cancelled') {
                refund_order_with_debt($o, 'Owner admin');
                $flash = 'Order refunded: buyer credited, seller deducted (balance may go negative / owing).';
            } else {
                db()->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$newStatus, $oid]);
                $flash = 'Order status updated.';
            }
        }
        if ($form === 'owner_refund') {
            $oid = (int)$_POST['order_id'];
            $order = db()->prepare('SELECT * FROM orders WHERE id = ?');
            $order->execute([$oid]);
            $o = $order->fetch();
            if (!$o) throw new RuntimeException('Order not found');
            refund_order_with_debt($o, 'Owner refund');
            $flash = 'Refunded via owner. Seller debt allowed if balance was too low.';
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$tab = $_GET['tab'] ?? 'overview';
?>
<!DOCTYPE html>
<html lang="en" id="ownerHtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <title>Owner Admin — Acctventa</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <meta name="robots" content="noindex,nofollow">
  <link rel="stylesheet" href="/css/tailwind.css?v=20260827perf1">
  <script>
    (function(){try{var t=localStorage.getItem('acctventa_owner_theme')||'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"></noscript>
  <link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css?v=6.4.0">
  <link rel="stylesheet" href="/css/admin-app.css?v=20260827adsfold1">
  <link rel="stylesheet" href="/css/ui-toast.css?v=20260821toast2">
  <link rel="stylesheet" href="/css/mobile-fix.css?v=20260822tap1">
  <script src="/js/mobile-fix.js?v=20260822tap1"></script>
  <script src="/js/ui-toast.js?v=20260821toast2"></script>
  <script src="/js/av-confirm.js?v=20260823confirm1"></script>
  <style>
    body.av-app{font-family:"Plus Jakarta Sans",system-ui,sans-serif}
  </style>
</head>
<body class="av-app min-h-screen">
<?php if (!$authed): ?>
  <div class="min-h-screen flex items-center justify-center p-4">
    <form method="post" class="w-full max-w-sm av-card p-6 space-y-4">
      <input type="hidden" name="form" value="login">
      <div class="text-center">
        <div class="w-12 h-12 mx-auto rounded-xl bg-brand text-white flex items-center justify-center font-bold text-xl mb-2">A</div>
        <h1 class="text-xl font-bold">Owner Admin</h1>
        <p class="text-xs text-slate-500">Full website control (users, money, ads, gateways)</p>
      </div>
      <?php if ($error): ?><p class="text-xs text-red-600"><?= h($error) ?></p><?php endif; ?>
      <div>
        <label class="text-xs text-slate-500">Username</label>
        <input name="username" value="owner" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" required>
      </div>
      <div>
        <label class="text-xs text-slate-500">Password</label>
        <input name="password" type="password" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" required>
      </div>
      <button class="w-full bg-brand text-white font-bold py-3 rounded-xl text-sm">Sign in</button>
      <a href="/" class="block text-center text-xs text-brand">← Back to website</a>
    </form>
  </div>
<?php else:
  // Stats
  $stats = [
    'users' => (int)db()->query('SELECT COUNT(*) c FROM users')->fetch()['c'],
    'ads_pending' => (int)db()->query("SELECT COUNT(*) c FROM ads WHERE status='pending'")->fetch()['c'],
    'orders' => (int)db()->query('SELECT COUNT(*) c FROM orders')->fetch()['c'],
    'withdraw_pending' => (int)db()->query("SELECT COUNT(*) c FROM transactions WHERE type='withdrawal' AND status='pending'")->fetch()['c'],
    'deposit_pending' => (int)db()->query("SELECT COUNT(*) c FROM transactions WHERE type='deposit' AND status='pending'")->fetch()['c'],
    'volume' => (float)db()->query("SELECT COALESCE(SUM(price),0) s FROM orders WHERE status='completed'")->fetch()['s'],
    'kyc_pending' => 0,
    'commission_total' => 0.0,
    'deposits_total' => 0.0,
    'withdrawals_total' => 0.0,
    'uploads_total' => 0,
  ];
  try {
    ensure_kyc_tables();
    $stats['kyc_pending'] = (int)db()->query("SELECT COUNT(*) c FROM kyc_submissions WHERE status IN ('needs_review','blurry_review','pending')")->fetch()['c'];
  } catch (Throwable $e) {}
  try {
    ensure_marketplace_extras();
    $stats['commission_total'] = (float)db()->query("SELECT COALESCE(SUM(platform_fee),0) s FROM orders WHERE status='completed' AND platform_fee IS NOT NULL")->fetch()['s'];
  } catch (Throwable $e) {
    try {
      $rate = (float)setting_get('sales_commission_rate', 0.22);
      $stats['commission_total'] = round($stats['volume'] * $rate, 2);
    } catch (Throwable $e2) {}
  }
  try {
    $stats['deposits_total'] = (float)db()->query("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='deposit' AND status='completed'")->fetch()['s'];
  } catch (Throwable $e) {}
  try {
    $stats['withdrawals_total'] = (float)db()->query("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE type='withdrawal' AND status='completed'")->fetch()['s'];
  } catch (Throwable $e) {}
  try {
    $stats['uploads_total'] = (int)db()->query('SELECT COUNT(*) c FROM ads')->fetch()['c'];
  } catch (Throwable $e) {}
  $gw = db()->query('SELECT * FROM gateway_settings WHERE id=1')->fetch() ?: [];
  $tabLabels = [
    'overview'=>'Overview','users'=>'Users','kyc'=>'KYC','ads'=>'Ads','orders'=>'Orders','chats'=>'Order chats',
    'reports'=>'Reports','wallet'=>'Wallet','support'=>'Inbox','currencies'=>'Currencies','gateways'=>'Gateways',
    'settings'=>'Settings','plans'=>'Plans',
  ];
  $viewUserId = ($tab === 'users') ? (int)($_GET['id'] ?? $_GET['user_id'] ?? 0) : 0;
?>
  <header class="av-topbar">
    <div class="av-topbar-inner">
      <div class="av-brand"><span class="av-brand-mark">A</span><span class="title truncate">Owner Admin</span></div>
      <div class="av-top-actions">
        <button type="button" id="ownerThemeBtn" onclick="toggleOwnerTheme()" class="av-icon-btn">Dark</button>
        <a href="/dashboard.html" class="av-link-btn">App</a>
        <a href="?logout=1" class="av-link-btn danger">Log out</a>
      </div>
    </div>
  </header>

  <main class="av-shell space-y-4 py-4<?= in_array($tab, ['support', 'chats', 'wallet'], true) ? ' av-shell-wide' : '' ?>">
    <?php if ($flash): ?><div class="av-ok text-sm px-4 py-3"><?= h($flash) ?></div><?php endif; ?>
    <?php if ($error): ?><div class="av-warn text-sm px-4 py-3"><?= h($error) ?></div><?php endif; ?>

    <?php if ($tab === 'users' && $viewUserId > 0): ?>
      <div class="av-settings-nav">
        <a href="?tab=users" class="av-settings-back"><i class="fa-solid fa-chevron-left"></i> Users</a>
        <span class="av-settings-nav-title">User</span>
      </div>
    <?php elseif ($tab !== 'overview'): ?>
      <div class="av-settings-nav">
        <a href="?tab=overview" class="av-settings-back"><i class="fa-solid fa-chevron-left"></i> Overview</a>
        <span class="av-settings-nav-title"><?= h($tabLabels[$tab] ?? ucfirst($tab)) ?></span>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'overview'): ?>
      <div class="av-page av-settings-page">
        <h2 class="av-settings-title">Overview</h2>

        <div class="av-mini-stats" aria-label="Site totals">
          <div class="av-mini-stat">
            <span class="k">Commission</span>
            <span class="v">$<?= number_format($stats['commission_total'], 2) ?></span>
          </div>
          <div class="av-mini-stat">
            <span class="k">Deposits</span>
            <span class="v">$<?= number_format($stats['deposits_total'], 2) ?></span>
          </div>
          <div class="av-mini-stat">
            <span class="k">Withdrawals</span>
            <span class="v">$<?= number_format($stats['withdrawals_total'], 2) ?></span>
          </div>
          <div class="av-mini-stat">
            <span class="k">Sales (GMV)</span>
            <span class="v">$<?= number_format($stats['volume'], 2) ?></span>
          </div>
          <div class="av-mini-stat">
            <span class="k">Uploads</span>
            <span class="v"><?= (int)$stats['uploads_total'] ?></span>
          </div>
        </div>

        <p class="av-section-label">Needs attention</p>
        <div class="av-settings-group">
          <a class="av-settings-row" href="?tab=wallet">
            <span class="av-settings-icon" style="background:#f59e0b"><i class="fa-solid fa-money-bill-transfer"></i></span>
            <span class="av-settings-label">Withdrawals</span>
            <span class="av-settings-value<?= $stats['withdraw_pending'] ? ' is-hot' : '' ?>"><?= (int)$stats['withdraw_pending'] ?> pending</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=wallet">
            <span class="av-settings-icon" style="background:#10b981"><i class="fa-solid fa-arrow-down"></i></span>
            <span class="av-settings-label">Deposits</span>
            <span class="av-settings-value<?= $stats['deposit_pending'] ? ' is-hot' : '' ?>"><?= (int)$stats['deposit_pending'] ?> pending</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=kyc">
            <span class="av-settings-icon" style="background:#8b5cf6"><i class="fa-solid fa-id-card"></i></span>
            <span class="av-settings-label">KYC review</span>
            <span class="av-settings-value<?= $stats['kyc_pending'] ? ' is-hot' : '' ?>"><?= (int)$stats['kyc_pending'] ?></span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=ads&filter=pending">
            <span class="av-settings-icon" style="background:#ef4444"><i class="fa-solid fa-rectangle-ad"></i></span>
            <span class="av-settings-label">Pending ads</span>
            <span class="av-settings-value<?= $stats['ads_pending'] ? ' is-hot' : '' ?>"><?= (int)$stats['ads_pending'] ?></span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
        </div>

        <p class="av-section-label">Manage</p>
        <div class="av-settings-group">
          <a class="av-settings-row" href="?tab=users">
            <span class="av-settings-icon" style="background:#0ea5e9"><i class="fa-solid fa-users"></i></span>
            <span class="av-settings-label">Users</span>
            <span class="av-settings-value"><?= (int)$stats['users'] ?></span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=orders">
            <span class="av-settings-icon" style="background:#6366f1"><i class="fa-solid fa-bag-shopping"></i></span>
            <span class="av-settings-label">Orders</span>
            <span class="av-settings-value"><?= (int)$stats['orders'] ?></span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=chats">
            <span class="av-settings-icon" style="background:#14b8a6"><i class="fa-solid fa-comments"></i></span>
            <span class="av-settings-label">Order chats</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=support">
            <span class="av-settings-icon" style="background:#ec4899"><i class="fa-solid fa-headset"></i></span>
            <span class="av-settings-label">Support inbox</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=reports">
            <span class="av-settings-icon" style="background:#f97316"><i class="fa-solid fa-flag"></i></span>
            <span class="av-settings-label">Reports</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
        </div>

        <p class="av-section-label">Setup</p>
        <div class="av-settings-group">
          <a class="av-settings-row" href="?tab=currencies">
            <span class="av-settings-icon" style="background:#eab308"><i class="fa-brands fa-bitcoin"></i></span>
            <span class="av-settings-label">Crypto addresses</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=gateways">
            <span class="av-settings-icon" style="background:#06b6d4"><i class="fa-solid fa-credit-card"></i></span>
            <span class="av-settings-label">Payment gateways</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=plans">
            <span class="av-settings-icon" style="background:#a855f7"><i class="fa-solid fa-crown"></i></span>
            <span class="av-settings-label">Plans &amp; pricing</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
          <a class="av-settings-row" href="?tab=settings">
            <span class="av-settings-icon" style="background:#64748b"><i class="fa-solid fa-gear"></i></span>
            <span class="av-settings-label">Settings</span>
            <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
          </a>
        </div>

      </div>
    <?php endif; ?>

    <?php if ($tab === 'support'):
      ensure_support_tables();
      $staffToken = create_staff_session('owner', 'Owner Support');
    ?>
      <div class="av-inbox">
        <div class="av-inbox-toolbar">
          <div>
            <h2 class="av-inbox-title">Support inbox</h2>
            <p class="av-inbox-sub">All customer chats in one place — search, unread badges, mobile-friendly.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div id="ownerInboxStats" class="av-inbox-stats"></div>
            <button type="button" id="staffNotifBtn" onclick="ownerEnableNotif()" class="av-icon-btn">Enable alerts</button>
          </div>
        </div>
        <p id="staffNotifStatus" class="text-[10px] av-muted -mt-1">In-app alerts</p>
        <div id="ownerChatShell" class="av-chat-shell">
          <div class="av-chat-list">
            <div class="av-chat-list-head flex justify-between items-center gap-2">
              <span>Conversations</span>
              <button type="button" onclick="ownerLoadThreads()" class="av-icon-btn">Refresh</button>
            </div>
            <div class="av-chat-search">
              <input id="ownerThreadSearch" type="search" placeholder="Search name, email, message…" oninput="ownerRenderThreads()" autocomplete="off">
            </div>
            <div id="ownerThreadList" class="av-thread-scroll"></div>
          </div>
          <div class="av-chat-pane">
            <div id="ownerChatHeader" class="av-chat-pane-head"></div>
            <div id="ownerChatMsgs" class="av-chat-msgs"></div>
            <p id="ownerTyping" class="px-3 text-[11px] av-muted h-5 shrink-0"></p>
            <div class="av-composer">
              <input type="file" id="ownerSupportFile" class="hidden" accept="image/*,.pdf,.txt,.doc,.docx,.zip" onchange="onOwnerSupportFile(event)">
              <button type="button" class="av-icon-btn" onclick="document.getElementById('ownerSupportFile').click()" title="Attach">📎</button>
              <input id="ownerReply" type="text" placeholder="Type a reply…" oninput="ownerTyping()" onkeydown="if(event.key==='Enter'){ownerSend();}">
              <button type="button" onclick="ownerSend()" class="av-send">Send</button>
            </div>
            <p id="ownerSupportAttachHint" class="hidden px-3 pb-2 text-[10px] av-muted"></p>
          </div>
        </div>
      </div>
      <script src="/js/staff-alerts.js?v=20260821toast2"></script>
      <script src="/js/staff-inbox.js?v=20260821toast2"></script>
      <script>
        const OWNER_STAFF_TOKEN = <?= json_encode($staffToken) ?>;
        localStorage.setItem('acctventa_staff_token', OWNER_STAFF_TOKEN);
        const Inbox = () => window.AcctventaStaffInbox;
        let ownerActive = null;
        let ownerFp = '';
        let ownerAttach = null;
        let ownerThreadsCache = [];
        let ownerActiveThread = null;

        function ownerShell(){ return document.getElementById('ownerChatShell'); }
        function ownerEnableNotif(){
          if (window.AcctventaStaffAlerts) window.AcctventaStaffAlerts.enable({ buttonId: 'staffNotifBtn' });
          else alert('Alert helper failed to load. Hard-refresh and try again.');
        }
        function ownerNotify(t,b){
          if (window.AcctventaStaffAlerts) window.AcctventaStaffAlerts.notify(t, b);
        }
        async function apiStaff(action, opts={}){
          const url = new URL('/api/index.php', location.origin);
          url.searchParams.set('action', action);
          if(opts.query) Object.entries(opts.query).forEach(([k,v])=>url.searchParams.set(k,v));
          const res = await fetch(url, {
            method: opts.method||'GET',
            headers: { 'Authorization':'Bearer '+OWNER_STAFF_TOKEN, 'X-Staff-Token': OWNER_STAFF_TOKEN, ...(opts.body?{'Content-Type':'application/json'}:{}) },
            body: opts.body?JSON.stringify(opts.body):undefined
          });
          const data = await res.json();
          if(!res.ok||data.ok===false) throw new Error(data.error||'Request failed');
          return data;
        }
        function onOwnerSupportFile(ev){
          const file=ev.target.files&&ev.target.files[0]; if(!file)return;
          if(file.size>8*1024*1024){alert('Max 8MB');ev.target.value='';return;}
          const reader=new FileReader();
          reader.onload=()=>{ownerAttach={dataUrl:reader.result,name:file.name}; const h=document.getElementById('ownerSupportAttachHint'); if(h){h.classList.remove('hidden');h.textContent='Attached: '+file.name;}};
          reader.readAsDataURL(file); ev.target.value='';
        }
        function ownerRenderHeader(){
          const head = document.getElementById('ownerChatHeader');
          if (!head || !Inbox()) return;
          head.innerHTML = Inbox().headerHtml(ownerActiveThread, { showBack: true });
          const back = head.querySelector('[data-inbox-back]');
          if (back) back.onclick = () => {
            ownerActive = null;
            ownerActiveThread = null;
            Inbox().setChatOpen(ownerShell(), false);
            ownerRenderHeader();
            document.getElementById('ownerChatMsgs').innerHTML = '<div class="av-empty-chat"><i class="fa-regular fa-comments"></i><p>Select a conversation</p></div>';
            ownerRenderThreads();
          };
        }
        function ownerRenderThreads(){
          if (!Inbox()) return;
          const q = (document.getElementById('ownerThreadSearch')||{}).value || '';
          Inbox().renderStats(document.getElementById('ownerInboxStats'), ownerThreadsCache);
          Inbox().renderThreadList({
            box: document.getElementById('ownerThreadList'),
            threads: ownerThreadsCache,
            query: q,
            activeId: ownerActive,
            onOpen: (id) => ownerOpen(id),
          });
        }
        async function ownerLoadThreads(silent){
          try{
            const res = await apiStaff('support.threads');
            const threads = res.threads||[];
            const fp = threads.map(t=>t.id+':'+(t.lastMessageAt||'')+':'+(t.unreadCount||0)+':'+(t.lastBody||'')).join('|');
            if(fp!==ownerFp && ownerFp){
              const hot = threads.find(t => (Number(t.unreadCount)||0) > 0) || threads[0];
              if (hot) ownerNotify('New support message', (hot.userName||'User')+': '+(hot.lastBody||''));
            }
            ownerFp = fp;
            ownerThreadsCache = threads;
            if (ownerActive) {
              ownerActiveThread = threads.find(t => Number(t.id) === Number(ownerActive)) || ownerActiveThread;
            }
            ownerRenderThreads();
            ownerRenderHeader();
          }catch(e){
            if (!silent) document.getElementById('ownerThreadList').innerHTML='<p class="p-3 text-xs" style="color:#ef4444">'+Inbox().esc(e.message)+'</p>';
          }
        }
        async function ownerOpen(id, silent){
          ownerActive=id;
          Inbox().setChatOpen(ownerShell(), true);
          try{
            const res = await apiStaff('support.messages',{query:{threadId:id}});
            const t=res.thread||{};
            const cached = ownerThreadsCache.find(x => Number(x.id) === Number(id)) || {};
            ownerActiveThread = Object.assign({}, cached, t, {
              userName: cached.userName || t.userName,
              userEmail: cached.userEmail || t.userEmail,
              userPlan: cached.userPlan,
              userOnline: t.userOnline != null ? t.userOnline : cached.userOnline,
            });
            ownerRenderHeader();
            document.getElementById('ownerTyping').textContent=ownerActiveThread.userTyping?'User is typing…':'';
            const msgBox = document.getElementById('ownerChatMsgs');
            Inbox().renderMessages(msgBox, res.messages||[], ownerActiveThread, { preserveScroll: !!silent });
            // clear unread locally after open
            ownerThreadsCache = ownerThreadsCache.map(x => Number(x.id)===Number(id) ? Object.assign({}, x, { unreadCount: 0 }) : x);
            ownerRenderThreads();
          }catch(e){ if(!silent) alert(e.message); }
        }
        let ot;
        function ownerTyping(){ if(!ownerActive)return; clearTimeout(ot); apiStaff('support.typing',{method:'POST',body:{threadId:ownerActive,typing:true}}).catch(()=>{}); ot=setTimeout(()=>apiStaff('support.typing',{method:'POST',body:{threadId:ownerActive,typing:false}}).catch(()=>{}),1500); }
        async function ownerSend(){
          const input=document.getElementById('ownerReply');
          const text=(input.value||'').trim();
          if((!text&&!ownerAttach)||!ownerActive)return;
          try{
            const body={threadId:ownerActive,text:text||''};
            if(ownerAttach){body.attachment=ownerAttach.dataUrl;body.fileName=ownerAttach.name;}
            await apiStaff('support.send',{method:'POST',body});
            input.value=''; ownerAttach=null;
            const h=document.getElementById('ownerSupportAttachHint'); if(h){h.classList.add('hidden');h.textContent='';}
            ownerOpen(ownerActive);
          }catch(e){alert(e.message);}
        }
        ownerRenderHeader();
        ownerLoadThreads();
        setInterval(()=>{ ownerLoadThreads(true); if(ownerActive) ownerOpen(ownerActive, true); }, 5000);
        if (window.AcctventaStaffAlerts) {
          window.AcctventaStaffAlerts.enable({ silent: true, buttonId: 'staffNotifBtn' });
          window.AcctventaStaffAlerts.updateButton('staffNotifBtn');
        }
      </script>
    <?php endif; ?>

    <?php if ($tab === 'kyc'):
      ensure_kyc_tables();
      $kycRows = db()->query("SELECT k.*, u.name AS user_name, u.email AS user_email, u.is_verified FROM kyc_submissions k JOIN users u ON u.id = k.user_id ORDER BY FIELD(k.status,'blurry_review','needs_review','pending','rejected','approved'), k.created_at DESC LIMIT 100")->fetchAll();
      $pendingCount = 0;
      foreach ($kycRows as $kr) {
        if (in_array($kr['status'], ['needs_review', 'blurry_review', 'pending'], true)) $pendingCount++;
      }
      $openId = (int)($_GET['open'] ?? 0);
    ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Business KYC</h2>
            <p class="av-page-sub">Tap a user line to review CAC + ID (front &amp; back). DocScan flags screenshots; blurry docs need your decision.</p>
          </div>
          <div class="av-page-meta">
            <span class="av-chip <?= $pendingCount ? 'is-hot' : '' ?>"><strong><?= (int)$pendingCount ?></strong> pending</span>
            <span class="av-chip"><strong><?= count($kycRows) ?></strong> total</span>
          </div>
        </div>

        <?php if (!$kycRows): ?>
          <div class="av-panel"><div class="av-empty">No KYC submissions yet.</div></div>
        <?php else: ?>
          <div class="av-panel av-kyc-list">
            <div class="av-panel-head"><span>Applications</span></div>
            <?php foreach ($kycRows as $k):
              $kid = (int)$k['id'];
              $isOpen = $openId === $kid;
              $aiText = kyc_filter_ai_summary((string)($k['ai_summary'] ?? ''));
              $cacUrl = trim((string)($k['doc_cac_url'] ?? ''));
              $idFrontUrl = trim((string)($k['doc_id_url'] ?? ''));
              $idBackUrl = trim((string)($k['doc_id_back_url'] ?? ''));
              $cacProxy = $cacUrl !== '' ? kyc_owner_doc_url($kid, 'cac') : '';
              $idFrontProxy = $idFrontUrl !== '' ? kyc_owner_doc_url($kid, 'id_front') : '';
              $idBackProxy = $idBackUrl !== '' ? kyc_owner_doc_url($kid, 'id_back') : '';
              $badgeClass = 'av-badge';
              if ($k['status'] === 'approved') $badgeClass .= ' av-badge-ok';
              elseif ($k['status'] === 'rejected') $badgeClass .= ' av-badge-danger';
              elseif ($k['status'] === 'blurry_review') $badgeClass .= ' av-badge-warn';
              $parts = preg_split('/\s+/', trim((string)$k['user_name']));
              $initials = '';
              foreach ($parts as $p) { if ($p !== '') $initials .= strtoupper($p[0]); if (strlen($initials) >= 2) break; }
              if ($initials === '') $initials = '?';
            ?>
              <div class="av-kyc-line<?= $isOpen ? ' is-open' : '' ?>" data-kyc-line="<?= $kid ?>">
                <button type="button" class="av-kyc-line-btn" onclick="toggleKycLine(<?= $kid ?>)" aria-expanded="<?= $isOpen ? 'true' : 'false' ?>">
                  <span class="av-avatar"><?= h($initials) ?></span>
                  <span class="av-kyc-line-main min-w-0">
                    <span class="av-kyc-line-title"><?= h($k['user_name']) ?> <span class="av-muted" style="font-weight:500">· <?= h($k['business_name']) ?></span></span>
                    <span class="av-kyc-line-sub"><?= h($k['user_email']) ?> · #<?= $kid ?> · <?= h($k['created_at']) ?></span>
                  </span>
                  <span class="<?= $badgeClass ?>"><?= h(str_replace('_', ' ', $k['status'])) ?></span>
                  <i class="av-kyc-chevron" aria-hidden="true">›</i>
                </button>
                <div class="av-kyc-line-body"<?= $isOpen ? '' : ' hidden' ?>>
                  <div class="av-soft-box">
                    <p><span class="lbl">Business</span><?= h($k['business_name']) ?> · <?= h($k['business_type']) ?></p>
                    <p><span class="lbl">Reg / CAC No.</span><?= h($k['registration_number']) ?></p>
                    <p><span class="lbl">Contact</span><?= h($k['contact_person']) ?><?= $k['contact_title'] !== '' ? ' (' . h($k['contact_title']) . ')' : '' ?> · <?= h($k['contact_email']) ?> · <?= h($k['contact_phone']) ?></p>
                    <p><span class="lbl">Owner</span><?= h($k['owner_name']) ?> · <?= h($k['ownership_pct']) ?>%</p>
                    <p><span class="lbl">Address</span><?= h($k['business_address']) ?></p>
                  </div>
                  <?php if ($aiText !== ''): ?>
                    <div class="av-soft-box" style="margin-top:0.55rem">
                      <p style="font-weight:800;margin:0 0 0.35rem">DocScan AI</p>
                      <pre class="whitespace-pre-wrap text-[11px] leading-relaxed" style="color:var(--av-muted);margin:0;font-family:inherit"><?= h($aiText) ?></pre>
                    </div>
                  <?php endif; ?>
                  <div class="av-doc-thumbs" style="margin-top:0.65rem">
                    <?php if ($cacProxy): ?>
                      <a href="<?= h($cacProxy) ?>" target="_blank" rel="noopener" class="av-doc-thumb">
                        <img src="<?= h($cacProxy) ?>" alt="CAC" loading="lazy">
                        CAC
                      </a>
                    <?php endif; ?>
                    <?php if ($idFrontProxy): ?>
                      <a href="<?= h($idFrontProxy) ?>" target="_blank" rel="noopener" class="av-doc-thumb">
                        <img src="<?= h($idFrontProxy) ?>" alt="ID front" loading="lazy">
                        ID front
                      </a>
                    <?php endif; ?>
                    <?php if ($idBackProxy): ?>
                      <a href="<?= h($idBackProxy) ?>" target="_blank" rel="noopener" class="av-doc-thumb">
                        <img src="<?= h($idBackProxy) ?>" alt="ID back" loading="lazy">
                        ID back
                      </a>
                    <?php endif; ?>
                    <?php if (!$cacProxy && !$idFrontProxy && !$idBackProxy): ?>
                      <p class="av-muted text-xs">No documents on file.</p>
                    <?php endif; ?>
                  </div>
                  <?php if (in_array($k['status'], ['needs_review', 'blurry_review', 'pending'], true)): ?>
                    <div class="av-actions" style="margin-top:0.75rem">
                      <form method="post">
                        <input type="hidden" name="form" value="kyc_review">
                        <input type="hidden" name="kyc_id" value="<?= $kid ?>">
                        <input type="hidden" name="decision" value="approve">
                        <button class="av-btn av-btn-success">Approve &amp; verify</button>
                      </form>
                      <form method="post" class="grow" style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
                        <input type="hidden" name="form" value="kyc_review">
                        <input type="hidden" name="kyc_id" value="<?= $kid ?>">
                        <input type="hidden" name="decision" value="reject">
                        <input name="reject_reason" placeholder="Rejection reason (shown to user)" class="grow text-xs px-3 py-2 rounded-xl">
                        <button class="av-btn av-btn-danger">Reject</button>
                      </form>
                    </div>
                  <?php elseif ($k['status'] === 'rejected' && ($k['reject_reason'] ?? '') !== ''): ?>
                    <p class="text-xs" style="color:#e11d48;margin-top:0.65rem">Rejected: <?= h($k['reject_reason']) ?></p>
                  <?php endif; ?>
                </div>
              </div>
            <?php endforeach; ?>
          </div>
          <script>
            function toggleKycLine(id) {
              var rows = document.querySelectorAll('[data-kyc-line]');
              rows.forEach(function (row) {
                var open = String(row.getAttribute('data-kyc-line')) === String(id) && !row.classList.contains('is-open');
                var body = row.querySelector('.av-kyc-line-body');
                var btn = row.querySelector('.av-kyc-line-btn');
                row.classList.toggle('is-open', open);
                if (body) body.hidden = !open;
                if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
              });
              try {
                var url = new URL(window.location.href);
                if (document.querySelector('[data-kyc-line].is-open')) url.searchParams.set('open', String(id));
                else url.searchParams.delete('open');
                history.replaceState({}, '', url.toString());
              } catch (e) {}
            }
          </script>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'users'):
      ensure_wallet_ledger_columns();
      $viewUserId = (int)($_GET['id'] ?? $_GET['user_id'] ?? 0);

      if ($viewUserId > 0):
        $ustmt = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $ustmt->execute([$viewUserId]);
        $u = $ustmt->fetch();
        if (!$u): ?>
          <div class="av-page"><div class="av-panel"><div class="av-empty">User not found. <a href="?tab=users" class="text-brand underline">Back to Users</a></div></div></div>
        <?php else:
          $banned = (int)$u['is_banned'] === 1;
          $verified = (int)$u['is_verified'] === 1;
          $parts = preg_split('/\s+/', trim((string)$u['name']));
          $initials = '';
          foreach ($parts as $p) { if ($p !== '') $initials .= strtoupper($p[0]); if (strlen($initials) >= 2) break; }
          if ($initials === '') $initials = '?';
          $recentTx = [];
          try {
            $txq = db()->prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 12');
            $txq->execute([$viewUserId]);
            $recentTx = $txq->fetchAll();
          } catch (Throwable $e) {}
        ?>
      <div class="av-page av-settings-page">
        <div class="av-user-detail-hero">
          <div class="av-avatar av-avatar-lg"><?= h($initials) ?></div>
          <div class="min-w-0">
            <h2 class="av-settings-title" style="margin:0;display:inline-flex;align-items:center;gap:0.35rem;flex-wrap:wrap">
              <?= h($u['name']) ?>
              <?php if ($verified): ?><span class="av-verify-badge av-verify-badge-lg" title="Verified" aria-label="Verified"><img src="/img/brand/verified.svg" alt="" width="40" height="40" decoding="async"></span><?php endif; ?>
            </h2>
            <p class="av-row-sub"><?= h($u['email']) ?> · #<?= (int)$u['id'] ?></p>
          </div>
        </div>

        <p class="av-section-label">Account</p>
        <div class="av-settings-group">
          <div class="av-settings-row is-static">
            <span class="av-settings-icon" style="background:#0ea5e9"><i class="fa-solid fa-wallet"></i></span>
            <span class="av-settings-label">Spendable balance</span>
            <span class="av-settings-value">$<?= number_format((float)$u['balance'], 2) ?></span>
          </div>
          <div class="av-settings-row is-static">
            <span class="av-settings-icon" style="background:#10b981"><i class="fa-solid fa-money-bill-transfer"></i></span>
            <span class="av-settings-label">Withdrawable balance</span>
            <span class="av-settings-value">$<?= number_format((float)($u['withdrawable_balance'] ?? 0), 2) ?></span>
          </div>
          <div class="av-settings-row is-static">
            <span class="av-settings-icon" style="background:#a855f7"><i class="fa-solid fa-crown"></i></span>
            <span class="av-settings-label">Plan</span>
            <span class="av-settings-value"><?= h($u['plan'] ?: 'free') ?></span>
          </div>
          <div class="av-settings-row is-static">
            <span class="av-settings-icon" style="background:#64748b"><i class="fa-solid fa-calendar"></i></span>
            <span class="av-settings-label">Joined</span>
            <span class="av-settings-value"><?= h($u['created_at'] ?? '—') ?></span>
          </div>
        </div>

        <p class="av-section-label">Actions</p>
        <div class="av-settings-group">
          <form method="post" action="?tab=users&amp;id=<?= (int)$u['id'] ?>" class="av-settings-row-form">
            <input type="hidden" name="form" value="ban_user">
            <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
            <input type="hidden" name="banned" value="<?= $banned ? 0 : 1 ?>">
            <button type="submit" class="av-settings-row av-settings-row-btn">
              <span class="av-settings-icon" style="background:<?= $banned ? '#10b981' : '#ef4444' ?>"><i class="fa-solid <?= $banned ? 'fa-lock-open' : 'fa-ban' ?>"></i></span>
              <span class="av-settings-label"><?= $banned ? 'Unban this user' : 'Ban this user' ?></span>
              <span class="av-settings-value"><?= $banned ? 'Banned' : 'Active' ?></span>
              <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
            </button>
          </form>
          <form method="post" action="?tab=users&amp;id=<?= (int)$u['id'] ?>" class="av-settings-row-form">
            <input type="hidden" name="form" value="verify_user">
            <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
            <input type="hidden" name="verified" value="<?= $verified ? 0 : 1 ?>">
            <button type="submit" class="av-settings-row av-settings-row-btn">
              <span class="av-settings-icon" style="background:<?= $verified ? '#64748b' : '#22c55e' ?>"><i class="fa-solid fa-certificate"></i></span>
              <span class="av-settings-label"><?= $verified ? 'Remove verified badge' : 'Add verified badge' ?></span>
              <span class="av-settings-value<?= $verified ? ' is-hot' : '' ?>" style="<?= $verified ? 'color:#22c55e' : '' ?>"><?= $verified ? 'Verified' : 'Not verified' ?></span>
              <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
            </button>
          </form>
          <form method="post" action="?tab=users&amp;id=<?= (int)$u['id'] ?>" target="_blank" class="av-settings-row-form">
            <input type="hidden" name="form" value="login_as_user">
            <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
            <button type="submit" class="av-settings-row av-settings-row-btn" <?= $banned ? 'disabled' : '' ?>>
              <span class="av-settings-icon" style="background:#0ea5e9"><i class="fa-solid fa-right-to-bracket"></i></span>
              <span class="av-settings-label">Login as this user</span>
              <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
            </button>
          </form>
        </div>

        <p class="av-section-label">Adjust balance</p>
        <form method="post" action="?tab=users&amp;id=<?= (int)$u['id'] ?>" class="av-settings-group av-balance-form">
          <input type="hidden" name="form" value="adjust_balance">
          <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
          <div class="av-balance-fields">
            <div class="av-field-block">
              <label for="adjAmount">Amount (USD)</label>
              <input id="adjAmount" name="amount" type="number" step="0.01" required placeholder="e.g. 10 or -5" inputmode="decimal">
              <p class="av-field-hint">Use a positive number to add funds, or a negative number to remove funds.</p>
            </div>
            <div class="av-field-block">
              <label for="adjNote">Note (optional)</label>
              <input id="adjNote" name="note" type="text" placeholder="Reason for this adjustment">
            </div>
            <label class="av-check-row">
              <input type="checkbox" name="as_withdrawable" value="1">
              <span>
                <strong>Count as withdrawable earnings</strong>
                <small>Only for positive amounts. Lets the user withdraw this credit (sales-style), not just spend it.</small>
              </span>
            </label>
            <button type="submit" class="av-btn av-btn-primary" style="width:100%">Save balance change</button>
          </div>
        </form>

        <?php if ($recentTx): ?>
        <p class="av-section-label">Recent transactions</p>
        <div class="av-settings-group">
          <?php foreach ($recentTx as $t): ?>
            <div class="av-settings-row is-static">
              <span class="av-settings-icon" style="background:#475569"><i class="fa-solid fa-receipt"></i></span>
              <span class="av-settings-label">
                <?= h($t['type']) ?>
                <span class="av-row-sub" style="display:block;font-weight:500"><?= h($t['note'] ?: $t['created_at']) ?></span>
              </span>
              <span class="av-settings-value">$<?= number_format((float)$t['amount'], 2) ?> · <?= h($t['status']) ?></span>
            </div>
          <?php endforeach; ?>
        </div>
        <?php endif; ?>
      </div>
        <?php endif; ?>

      <?php else:
        $users = db()->query('SELECT * FROM users ORDER BY created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="av-page av-settings-page">
        <h2 class="av-settings-title">Users</h2>
        <p class="av-page-sub" style="margin:-0.35rem 0 0.85rem">Tap a user to ban, verify, adjust balance, or login as them.</p>
        <div class="av-settings-group">
          <?php if (!$users): ?>
            <div class="av-empty">No users yet.</div>
          <?php endif; ?>
          <?php foreach ($users as $u):
            $parts = preg_split('/\s+/', trim((string)$u['name']));
            $initials = '';
            foreach ($parts as $p) { if ($p !== '') $initials .= strtoupper($p[0]); if (strlen($initials) >= 2) break; }
            if ($initials === '') $initials = '?';
            $banned = (int)$u['is_banned'] === 1;
            $verified = (int)$u['is_verified'] === 1;
          ?>
            <a class="av-settings-row" href="?tab=users&amp;id=<?= (int)$u['id'] ?>">
              <span class="av-avatar av-avatar-sm"><?= h($initials) ?></span>
              <span class="av-settings-label">
                <span class="inline-flex items-center gap-1">
                  <?= h($u['name']) ?>
                  <?php if ($verified): ?><span class="av-verify-badge" title="Verified" aria-label="Verified"><img src="/img/brand/verified.svg" alt="" width="40" height="40" decoding="async"></span><?php endif; ?>
                </span>
                <span class="av-row-sub" style="display:block;font-weight:500"><?= h($u['email']) ?></span>
              </span>
              <span class="av-settings-value">
                $<?= number_format((float)$u['balance'], 2) ?>
                <?php if ($banned): ?> · banned<?php endif; ?>
              </span>
              <i class="fa-solid fa-chevron-right av-settings-chevron"></i>
            </a>
          <?php endforeach; ?>
        </div>
      </div>
      <?php endif; ?>
    <?php endif; ?>

    <?php if ($tab === 'ads'):
      $adsFilter = strtolower(trim((string)($_GET['filter'] ?? 'pending')));
      if (!in_array($adsFilter, ['all', 'pending', 'active', 'denied', 'removed'], true)) $adsFilter = 'pending';
      $adsSql = 'SELECT a.*, u.name seller_name, u.email seller_email FROM ads a JOIN users u ON u.id=a.seller_id';
      if ($adsFilter !== 'all') {
        $adsSql .= ' WHERE a.status = ' . db()->quote($adsFilter);
      }
      $adsSql .= " ORDER BY FIELD(a.status,'pending','denied','active','removed'), a.created_at DESC LIMIT 200";
      $ads = db()->query($adsSql)->fetchAll();
      $pendingAdsCount = (int)db()->query("SELECT COUNT(*) c FROM ads WHERE status='pending'")->fetch()['c'];
    ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Ads</h2>
            <p class="av-page-sub">Approve, deny, or remove marketplace listings. New uploads wait here as Pending until you approve.</p>
          </div>
          <div class="av-page-meta av-page-meta-static">
            <span class="av-stat-pill<?= $pendingAdsCount ? ' is-hot' : '' ?>"><strong><?= $pendingAdsCount ?></strong> pending</span>
            <span class="av-stat-pill"><strong><?= count($ads) ?></strong> shown</span>
          </div>
        </div>
        <div class="av-panel mb-3">
          <div class="av-admin-card-actions" style="padding:0.75rem">
            <?php foreach (['pending' => 'Pending', 'active' => 'Active', 'denied' => 'Denied', 'removed' => 'Removed', 'all' => 'All'] as $fk => $fl): ?>
              <a class="av-btn<?= $adsFilter === $fk ? ' av-btn-success' : '' ?>" href="?tab=ads&filter=<?= h($fk) ?>"><?= h($fl) ?></a>
            <?php endforeach; ?>
          </div>
        </div>
        <?php if (!$ads): ?>
          <div class="av-panel"><div class="av-empty"><?= $adsFilter === 'pending' ? 'No pending listings.' : 'No ads in this filter.' ?></div></div>
        <?php else: ?>
          <div class="av-panel av-ad-panel">
            <div class="av-panel-head av-ad-panel-head">
              <span>Listings</span>
              <?php if ($adsFilter === 'pending' && count($ads) > 0): ?>
                <span class="av-muted text-xs">Tap a row to expand · use checkboxes to approve many at once</span>
              <?php endif; ?>
            </div>
            <?php if ($adsFilter === 'pending'): ?>
              <form method="post" id="ownerAdsBulkForm" class="av-ad-bulk-bar" onsubmit="return ownerAdsBulkConfirm(event)">
                <input type="hidden" name="form" value="ad_status_bulk">
                <input type="hidden" name="status" value="active">
                <label class="av-ad-bulk-select-all">
                  <input type="checkbox" id="ownerAdSelectAll" onchange="ownerAdSelectAll(this.checked)">
                  <span>Select all</span>
                </label>
                <span id="ownerAdSelectedCount" class="av-ad-bulk-count">0 selected</span>
                <button type="submit" class="av-btn av-btn-success" id="ownerAdBulkApproveBtn" disabled>Approve selected</button>
              </form>
            <?php endif; ?>
            <div class="av-ad-list" id="ownerAdsList">
            <?php foreach ($ads as $a):
              $st = (string)$a['status'];
              $stock = (int)($a['stock'] ?? 0);
              $live = ($st === 'active' && $stock > 0);
              $soldOut = ($st === 'active' && $stock <= 0) || ($st === 'removed' && $stock <= 0);
              $badge = 'av-badge-muted';
              if ($live) $badge = 'av-badge-ok';
              elseif ($st === 'pending') $badge = 'av-badge-warn';
              elseif ($st === 'denied') $badge = 'av-badge-danger';
              elseif ($soldOut) $badge = 'av-badge-muted';
              $statusLabel = $live ? 'LIVE' : ($soldOut && $st === 'active' ? 'SOLD OUT' : strtoupper($st));
              $adId = (int)$a['id'];
              $preview = trim((string)($a['preview_link'] ?? ''));
              $loginPayload = [
                'title' => (string)$a['title'],
                'username' => (string)($a['username'] ?? ''),
                'password' => (string)($a['password_plain'] ?? ''),
                'attached_email' => (string)($a['attached_email'] ?? ''),
                'attached_email_password' => (string)($a['attached_email_password'] ?? ''),
                'two_fa' => (string)($a['two_fa'] ?? ''),
                'extra_info' => (string)($a['extra_info'] ?? ''),
                'preview_link' => $preview,
              ];
            ?>
              <div class="av-ad-line" data-ad-line="<?= $adId ?>" data-ad-login="<?= h(json_encode($loginPayload, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP)) ?>">
                <div class="av-ad-line-row">
                  <?php if ($st === 'pending'): ?>
                    <label class="av-ad-check" onclick="event.stopPropagation()" title="Select for bulk approve">
                      <input type="checkbox" form="ownerAdsBulkForm" name="ad_ids[]" value="<?= $adId ?>" class="owner-ad-cb" onchange="ownerAdSelectionChanged()">
                    </label>
                  <?php endif; ?>
                  <button type="button" class="av-ad-line-btn" onclick="toggleAdLine(<?= $adId ?>)" aria-expanded="false">
                    <div class="av-ad-line-main">
                      <span class="av-ad-line-title"><?= h($a['title']) ?> <span class="av-muted">#<?= $adId ?></span></span>
                      <span class="av-ad-line-sub"><?= h($a['seller_name']) ?> · <?= h($a['category']) ?> · $<?= number_format((float)$a['price'], 2) ?></span>
                    </div>
                    <span class="av-badge <?= $badge ?> av-ad-line-badge"><?= h($statusLabel) ?></span>
                    <i class="av-kyc-chevron" aria-hidden="true">›</i>
                  </button>
                  <div class="av-ad-quick-icons">
                    <?php if ($preview !== ''): ?>
                      <a href="<?= h($preview) ?>" target="_blank" rel="noopener noreferrer" class="av-ad-icon-btn" title="View account link" onclick="event.stopPropagation()"><i class="fa-solid fa-eye"></i></a>
                    <?php else: ?>
                      <span class="av-ad-icon-btn is-disabled" title="No preview link"><i class="fa-solid fa-eye"></i></span>
                    <?php endif; ?>
                    <button type="button" class="av-ad-icon-btn" title="View login details" onclick="event.stopPropagation(); ownerAdShowLogin(<?= $adId ?>)"><i class="fa-solid fa-key"></i></button>
                  </div>
                </div>
                <div class="av-ad-line-body" hidden>
                  <div class="av-ad-detail-grid">
                    <div><span class="av-ad-detail-k">Seller</span><span><?= h($a['seller_name']) ?> · <?= h($a['seller_email']) ?></span></div>
                    <div><span class="av-ad-detail-k">Category</span><span><?= h($a['category']) ?></span></div>
                    <div><span class="av-ad-detail-k">Price</span><span class="av-ad-detail-price">$<?= number_format((float)$a['price'], 2) ?></span></div>
                    <div><span class="av-ad-detail-k">Stock</span><span><?= $stock ?></span></div>
                    <?php if ($preview !== ''): ?>
                      <div class="av-ad-detail-span2"><span class="av-ad-detail-k">Preview link</span><a href="<?= h($preview) ?>" target="_blank" rel="noopener" class="av-ad-link"><?= h($preview) ?></a></div>
                    <?php endif; ?>
                    <div><span class="av-ad-detail-k">Username</span><span class="font-mono text-xs"><?= h($a['username'] ?? '') ?></span></div>
                    <div><span class="av-ad-detail-k">Password</span><span class="font-mono text-xs"><?= h($a['password_plain'] ?? '') ?></span></div>
                    <?php if (trim((string)($a['attached_email'] ?? '')) !== ''): ?>
                      <div><span class="av-ad-detail-k">Email</span><span class="font-mono text-xs"><?= h($a['attached_email']) ?></span></div>
                    <?php endif; ?>
                    <?php if (trim((string)($a['attached_email_password'] ?? '')) !== ''): ?>
                      <div><span class="av-ad-detail-k">Email pass</span><span class="font-mono text-xs"><?= h($a['attached_email_password']) ?></span></div>
                    <?php endif; ?>
                    <?php if (trim((string)($a['two_fa'] ?? '')) !== ''): ?>
                      <div><span class="av-ad-detail-k">2FA</span><span class="font-mono text-xs"><?= h($a['two_fa']) ?></span></div>
                    <?php endif; ?>
                    <?php if (trim((string)($a['extra_info'] ?? '')) !== ''): ?>
                      <div class="av-ad-detail-span2"><span class="av-ad-detail-k">Extra</span><span class="text-xs"><?= nl2br(h($a['extra_info'])) ?></span></div>
                    <?php endif; ?>
                    <?php if ($a['deny_reason']): ?><div class="av-ad-detail-span2" style="color:#e11d48"><span class="av-ad-detail-k">Denied</span><span><?= h($a['deny_reason']) ?></span></div><?php endif; ?>
                    <?php if ($soldOut && $st === 'active'): ?>
                      <div class="av-ad-detail-span2" style="color:#f59e0b">Sold out — not shown on Home/Market until restocked.</div>
                    <?php endif; ?>
                  </div>
                  <div class="av-admin-card-actions av-ad-line-actions">
                    <?php if ($st === 'pending'): ?>
                      <form method="post"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="return_filter" value="<?= h($adsFilter) ?>"><input type="hidden" name="ad_id" value="<?= $adId ?>"><input type="hidden" name="status" value="active"><button class="av-btn av-btn-success">Approve</button></form>
                      <form method="post" class="av-ad-deny-form"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="return_filter" value="<?= h($adsFilter) ?>"><input type="hidden" name="ad_id" value="<?= $adId ?>"><input type="hidden" name="status" value="denied"><input name="reason" placeholder="Deny reason" class="av-field"><button class="av-btn av-btn-danger">Deny</button></form>
                    <?php elseif ($st === 'denied' || $st === 'removed'): ?>
                      <form method="post"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="return_filter" value="<?= h($adsFilter) ?>"><input type="hidden" name="ad_id" value="<?= $adId ?>"><input type="hidden" name="status" value="active"><button class="av-btn av-btn-success">Re-approve &amp; list</button></form>
                    <?php elseif ($soldOut): ?>
                      <form method="post" class="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="form" value="ad_restock">
                        <input type="hidden" name="ad_id" value="<?= $adId ?>">
                        <input type="number" name="qty" value="1" min="1" max="99" class="av-field" style="width:4.5rem" title="Stock qty">
                        <button class="av-btn av-btn-success">Restock &amp; go live</button>
                      </form>
                    <?php endif; ?>
                    <?php if ($st !== 'removed'): ?>
                      <form method="post"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="return_filter" value="<?= h($adsFilter) ?>"><input type="hidden" name="ad_id" value="<?= $adId ?>"><input type="hidden" name="status" value="removed"><button class="av-btn">Remove</button></form>
                    <?php endif; ?>
                  </div>
                </div>
              </div>
            <?php endforeach; ?>
            </div>
          </div>
          <div id="ownerAdLoginModal" class="av-ad-modal hidden" role="dialog" aria-modal="true" aria-labelledby="ownerAdLoginTitle">
            <div class="av-ad-modal-backdrop" onclick="ownerAdCloseLogin()"></div>
            <div class="av-ad-modal-card">
              <div class="av-ad-modal-head">
                <h3 id="ownerAdLoginTitle" class="av-ad-modal-title">Login details</h3>
                <button type="button" class="av-ad-modal-close" onclick="ownerAdCloseLogin()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <div id="ownerAdLoginBody" class="av-ad-modal-body"></div>
              <div class="av-ad-modal-foot">
                <button type="button" class="av-btn av-btn-primary" id="ownerAdLoginOpenLink" style="display:none"><i class="fa-solid fa-eye mr-1"></i> Open account link</button>
                <button type="button" class="av-btn" onclick="ownerAdCloseLogin()">Close</button>
              </div>
            </div>
          </div>
          <script>
            function toggleAdLine(id) {
              var row = document.querySelector('[data-ad-line="' + id + '"]');
              if (!row) return;
              var open = !row.classList.contains('is-open');
              document.querySelectorAll('[data-ad-line].is-open').forEach(function (other) {
                if (other !== row) {
                  other.classList.remove('is-open');
                  var ob = other.querySelector('.av-ad-line-body');
                  var obtn = other.querySelector('.av-ad-line-btn');
                  if (ob) ob.hidden = true;
                  if (obtn) obtn.setAttribute('aria-expanded', 'false');
                }
              });
              row.classList.toggle('is-open', open);
              var body = row.querySelector('.av-ad-line-body');
              var btn = row.querySelector('.av-ad-line-btn');
              if (body) body.hidden = !open;
              if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            function ownerAdSelectAll(on) {
              document.querySelectorAll('.owner-ad-cb').forEach(function (cb) { cb.checked = !!on; });
              ownerAdSelectionChanged();
            }
            function ownerAdSelectionChanged() {
              var boxes = Array.prototype.slice.call(document.querySelectorAll('.owner-ad-cb'));
              var n = boxes.filter(function (b) { return b.checked; }).length;
              var countEl = document.getElementById('ownerAdSelectedCount');
              var btn = document.getElementById('ownerAdBulkApproveBtn');
              var all = document.getElementById('ownerAdSelectAll');
              if (countEl) countEl.textContent = n + ' selected';
              if (btn) btn.disabled = n < 1;
              if (all && boxes.length) all.checked = n > 0 && n === boxes.length;
            }
            function ownerAdsBulkConfirm(ev) {
              var n = document.querySelectorAll('.owner-ad-cb:checked').length;
              if (n < 1) {
                ev.preventDefault();
                return false;
              }
              return confirm('Approve ' + n + ' selected listing' + (n === 1 ? '' : 's') + ' and publish on Market?');
            }
            function ownerAdShowLogin(id) {
              var row = document.querySelector('[data-ad-line="' + id + '"]');
              if (!row) return;
              var raw = row.getAttribute('data-ad-login') || '{}';
              var data;
              try { data = JSON.parse(raw); } catch (e) { data = {}; }
              var modal = document.getElementById('ownerAdLoginModal');
              var body = document.getElementById('ownerAdLoginBody');
              var title = document.getElementById('ownerAdLoginTitle');
              var linkBtn = document.getElementById('ownerAdLoginOpenLink');
              if (!modal || !body) return;
              if (title) title.textContent = data.title ? ('Login · ' + data.title) : 'Login details';
              function rowHtml(label, val) {
                if (!val) return '';
                return '<div class="av-ad-login-row"><span class="av-ad-detail-k">' + label + '</span><span class="font-mono text-xs break-all">' + String(val).replace(/</g, '&lt;') + '</span></div>';
              }
              body.innerHTML =
                rowHtml('Username', data.username) +
                rowHtml('Password', data.password) +
                rowHtml('Email', data.attached_email) +
                rowHtml('Email password', data.attached_email_password) +
                rowHtml('2FA', data.two_fa) +
                (data.extra_info ? '<div class="av-ad-login-row"><span class="av-ad-detail-k">Extra</span><span class="text-xs">' + String(data.extra_info).replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</span></div>' : '') +
                (data.preview_link ? '<div class="av-ad-login-row"><span class="av-ad-detail-k">Link</span><a href="' + String(data.preview_link).replace(/"/g, '&quot;') + '" target="_blank" rel="noopener" class="av-ad-link break-all">' + String(data.preview_link).replace(/</g, '&lt;') + '</a></div>' : '');
              if (linkBtn) {
                if (data.preview_link) {
                  linkBtn.style.display = '';
                  linkBtn.onclick = function () { window.open(data.preview_link, '_blank', 'noopener,noreferrer'); };
                } else {
                  linkBtn.style.display = 'none';
                  linkBtn.onclick = null;
                }
              }
              modal.classList.remove('hidden');
              document.body.classList.add('overflow-hidden');
            }
            function ownerAdCloseLogin() {
              var modal = document.getElementById('ownerAdLoginModal');
              if (modal) modal.classList.add('hidden');
              document.body.classList.remove('overflow-hidden');
            }
            document.addEventListener('keydown', function (e) {
              if (e.key === 'Escape') ownerAdCloseLogin();
            });
          </script>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'orders'): $orders = db()->query('SELECT o.*, b.name buyer_name, s.name seller_name, s.balance seller_balance FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id ORDER BY o.created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Orders</h2>
            <p class="av-page-sub">Search by TXID, update status, or refund.</p>
          </div>
          <div class="av-page-meta av-page-meta-static">
            <span class="av-stat-pill"><strong><?= count($orders) ?></strong> shown</span>
          </div>
        </div>

        <div class="av-panel mb-3">
          <div class="av-panel-head"><span>Find sale</span></div>
          <div class="av-panel-body space-y-2">
            <p class="text-xs av-muted">Search TXID / email / name, then open chat or refund.</p>
            <div class="av-admin-card-actions" style="margin-top:0">
              <input id="ownerTxSearch" type="text" placeholder="TXID or email…" class="av-field" style="flex:1 1 12rem">
              <button type="button" onclick="ownerSearchOrder()" class="av-btn av-btn-primary">Search</button>
            </div>
            <div id="ownerTxResult" class="text-xs space-y-2"></div>
          </div>
        </div>

        <div class="av-panel">
          <div class="av-panel-head"><span>Recent orders</span></div>
          <?php if (!$orders): ?>
            <div class="av-empty">No orders yet.</div>
          <?php endif; ?>
          <?php foreach ($orders as $o): ?>
            <article class="av-user-card">
              <div class="av-admin-card-top">
                <div class="min-w-0 flex-1">
                  <p class="av-row-title"><?= h($o['title']) ?></p>
                  <p class="av-row-sub font-mono"><?= h($o['public_id']) ?></p>
                  <p class="av-row-sub">Buyer <?= h($o['buyer_name']) ?> · Seller <?= h($o['seller_name']) ?></p>
                  <?php if ((float)$o['seller_balance'] < 0): ?>
                    <p class="av-row-sub" style="color:#e11d48">Seller bal -$<?= number_format(abs((float)$o['seller_balance']), 2) ?></p>
                  <?php endif; ?>
                </div>
                <div style="text-align:right;flex-shrink:0">
                  <span class="av-status-badge av-status-<?= h($o['status']) ?>"><?= h($o['status']) ?></span>
                  <p class="av-row-title" style="margin-top:0.4rem;color:var(--av-brand)">$<?= number_format((float)$o['price'], 2) ?></p>
                </div>
              </div>
              <div class="av-admin-card-actions">
                <form method="post">
                  <input type="hidden" name="form" value="order_status">
                  <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
                  <select name="status" class="av-field" style="flex:0 1 7.5rem">
                    <?php foreach (['pending','completed','cancelled','disputed'] as $st): ?>
                      <option <?= $o['status']===$st?'selected':'' ?>><?= $st ?></option>
                    <?php endforeach; ?>
                  </select>
                  <button class="av-btn av-btn-primary">Save</button>
                </form>
                <?php if ($o['status'] !== 'cancelled'): ?>
                <form method="post" onsubmit="return avConfirmSubmit(event, 'Refund buyer and deduct seller (allows negative / owing)?', { title: 'Refund order', okText: 'Refund buyer', icon: 'fa-rotate-left', danger: true })">
                  <input type="hidden" name="form" value="owner_refund">
                  <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
                  <button class="av-btn av-btn-danger">Refund</button>
                </form>
                <?php endif; ?>
                <a class="av-btn" href="?tab=chats&order_id=<?= (int)$o['id'] ?>">Chat</a>
              </div>
            </article>
          <?php endforeach; ?>
        </div>
      </div>
      <script>
        async function ownerSearchOrder(){
          const q=(document.getElementById('ownerTxSearch').value||'').trim();
          const box=document.getElementById('ownerTxResult');
          if(!q){box.innerHTML='';return;}
          try{
            const url=new URL('/api/index.php',location.origin);
            url.searchParams.set('action','staff.orders.search');
            url.searchParams.set('q',q);
            const res=await fetch(url,{headers:{'Authorization':'Bearer '+(localStorage.getItem('acctventa_staff_token')||''),'X-Staff-Token':(localStorage.getItem('acctventa_staff_token')||'')}});
            const data=await res.json();
            if(!res.ok||data.ok===false) throw new Error(data.error||'Search failed — open Support tab once to mint staff token, then retry');
            const rows=data.orders||[];
            if(!rows.length){box.innerHTML='<p class="av-muted">No matches.</p>';return;}
            box.innerHTML=rows.map(o=>`<div class="av-admin-card">
              <p class="font-mono font-bold">${esc(o.public_id)}</p>
              <p>${esc(o.title)} · ${esc(o.status)} · $${Number(o.price).toFixed(2)}</p>
              <p class="av-muted">Buyer: ${esc(o.buyer_name)} · Seller: ${esc(o.seller_name)}</p>
              <a class="av-btn av-btn-primary" style="margin-top:0.45rem;display:inline-flex" href="?tab=chats&order_id=${o.id}">Open chat</a>
            </div>`).join('');
          }catch(e){box.innerHTML='<p style="color:#e11d48">'+esc(e.message)+'</p>';}
        }
        function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
      </script>
    <?php endif; ?>

    <?php if ($tab === 'chats'):
      ensure_marketplace_extras();
      $staffToken = create_staff_session('owner', 'Owner Support');
      $focusOrder = (int)($_GET['order_id'] ?? 0);
    ?>
      <div class="av-inbox">
        <div class="av-inbox-toolbar">
          <div>
            <h2 class="av-inbox-title">Order chats</h2>
            <p class="av-inbox-sub">Buyer ↔ seller threads — search by TXID, title, or name.</p>
          </div>
          <div id="ownerOrderStats" class="av-inbox-stats"></div>
        </div>
        <div id="ownerOrderShell" class="av-chat-shell">
          <div class="av-chat-list">
            <div class="av-chat-list-head flex justify-between items-center gap-2">
              <span>Threads</span>
              <button type="button" onclick="loadOrderChats()" class="av-icon-btn">Refresh</button>
            </div>
            <div class="av-chat-search">
              <input id="ownerOrderSearch" type="search" placeholder="Search TXID, title, buyer, seller…" oninput="renderOrderChats()" autocomplete="off">
            </div>
            <div id="orderChatList" class="av-thread-scroll"></div>
          </div>
          <div class="av-chat-pane">
            <div id="orderChatHeader" class="av-chat-pane-head"></div>
            <div id="orderChatMsgs" class="av-chat-msgs"></div>
            <div id="orderChatActions" class="p-3 border-t space-y-2 hidden" style="border-color:var(--av-border)">
              <div id="orderDisputeBox" class="hidden rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] space-y-2">
                <p class="font-bold text-amber-200">Dispute review</p>
                <p id="orderDisputeMeta" class="text-slate-300"></p>
                <textarea id="orderDisputeNote" rows="2" class="w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs" placeholder="Admin note (optional)"></textarea>
                <div class="flex flex-wrap gap-2">
                  <button type="button" id="orderDisputeRefundBtn" class="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">Refund buyer (resolve)</button>
                  <button type="button" id="orderDisputeDenyBtn" class="px-3 py-2 rounded-lg bg-slate-700 text-white text-[11px] font-bold">Deny dispute</button>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" id="orderChatRefundBtn" class="px-3 py-2 rounded-lg bg-red-500 text-white text-[11px] font-bold">Refund buyer (seller debt OK)</button>
                <button type="button" id="orderWarrantyRefundBtn" class="px-3 py-2 rounded-lg bg-orange-600 text-white text-[11px] font-bold">24h warranty · deduct seller + refund</button>
              </div>
              <p class="text-[10px] text-slate-500">Use warranty deduct when a buyer proves the account was banned within 24h without their edits. Commission is also clawed back from the seller settlement.</p>
            </div>
          </div>
        </div>
      </div>
      <script src="/js/staff-inbox.js?v=20260821toast2"></script>
      <script>
        localStorage.setItem('acctventa_staff_token', <?= json_encode($staffToken) ?>);
        const FOCUS_ORDER = <?= (int)$focusOrder ?>;
        const Inbox = () => window.AcctventaStaffInbox;
        let activeOrderChat = null;
        let orderChatsCache = [];
        function esc(s){return Inbox() ? Inbox().esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
        function orderShell(){ return document.getElementById('ownerOrderShell'); }
        async function apiStaff(action, opts={}){
          const url=new URL('/api/index.php',location.origin);
          url.searchParams.set('action',action);
          if(opts.query) Object.entries(opts.query).forEach(([k,v])=>url.searchParams.set(k,v));
          const tok=localStorage.getItem('acctventa_staff_token')||'';
          const res=await fetch(url,{method:opts.method||'GET',headers:{'Authorization':'Bearer '+tok,'X-Staff-Token':tok,...(opts.body?{'Content-Type':'application/json'}:{})},body:opts.body?JSON.stringify(opts.body):undefined});
          const data=await res.json();
          if(!res.ok||data.ok===false) throw new Error(data.error||'Failed');
          return data;
        }
        function renderOrderHeader(o){
          const head=document.getElementById('orderChatHeader');
          if(!head) return;
          if(!o){
            head.innerHTML=(Inbox()?Inbox().headerHtml(null,{showBack:true}):'Select a chat');
          } else {
            head.innerHTML =
              '<button type="button" class="av-back-chat" data-inbox-back aria-label="Back">←</button>' +
              '<span class="av-avatar">' + esc((o.public_id||'OR').slice(0,2).toUpperCase()) + '</span>' +
              '<div class="head-main"><div class="head-title truncate font-mono">' + esc(o.public_id) + ' · ' + esc(o.status) + '</div>' +
              '<div class="head-sub truncate">' + esc(o.title) + ' · ' + esc(o.buyer_name) + ' ↔ ' + esc(o.seller_name) +
              ' · seller $' + Number(o.seller_balance||0).toFixed(2) + '</div></div>';
          }
          const back=head.querySelector('[data-inbox-back]');
          if(back) back.onclick=()=>{
            activeOrderChat=null;
            if(Inbox()) Inbox().setChatOpen(orderShell(), false);
            renderOrderHeader(null);
            document.getElementById('orderChatMsgs').innerHTML='<div class="av-empty-chat"><i class="fa-regular fa-comments"></i><p>Select a conversation</p></div>';
            document.getElementById('orderChatActions').classList.add('hidden');
            renderOrderChats();
          };
        }
        function renderOrderChats(){
          const box=document.getElementById('orderChatList');
          const q=(document.getElementById('ownerOrderSearch')||{}).value||'';
          const stats=document.getElementById('ownerOrderStats');
          if(stats) stats.innerHTML='<span class="av-chip"><strong>'+orderChatsCache.length+'</strong> threads</span>';
          if(!Inbox()) return;
          const filtered=Inbox().filterThreads(orderChatsCache, q);
          if(!filtered.length){
            box.innerHTML='<div class="av-empty-chat"><i class="fa-regular fa-comments"></i><p>No order chats match.</p></div>';
            return;
          }
          box.innerHTML=filtered.map(c=>{
            const label=(c.public_id||'OR').toString();
            return '<button type="button" class="av-thread '+(activeOrderChat===c.id?'is-active':'')+'" data-order-id="'+esc(c.id)+'">' +
              '<span class="av-avatar">'+esc(label.slice(0,2).toUpperCase())+'</span>' +
              '<span class="mid min-w-0"><p class="name truncate font-mono">'+esc(c.public_id)+'</p>' +
              '<p class="meta truncate">'+esc(c.title)+' · '+esc(c.status)+'</p>' +
              '<p class="preview">'+esc(c.buyer_name)+' ↔ '+esc(c.seller_name)+' · '+(c.message_count||0)+' msgs'+(c.last_body?' · '+esc(c.last_body):'')+'</p></span>' +
              '<span class="side"><span class="time">'+esc(Inbox().relativeTime(c.last_message_at||c.updated_at||c.created_at))+'</span></span></button>';
          }).join('');
          box.querySelectorAll('[data-order-id]').forEach(btn=>{
            btn.addEventListener('click',()=>openOrderChat(Number(btn.getAttribute('data-order-id'))));
          });
        }
        async function loadOrderChats(){
          const res=await apiStaff('staff.orders.chats');
          orderChatsCache=res.chats||[];
          renderOrderChats();
        }
        async function openOrderChat(id){
          activeOrderChat=id;
          if(Inbox()) Inbox().setChatOpen(orderShell(), true);
          const res=await apiStaff('staff.orders.get',{query:{orderId:id}});
          const o=res.order||{};
          renderOrderHeader(o);
          const msgs=res.messages||[];
          const box=document.getElementById('orderChatMsgs');
          box.className='av-chat-msgs';
          box.innerHTML=msgs.length?msgs.map(m=>{
            const mime=String(m.attachmentMime||'');
            const isImg=m.attachmentUrl&&(mime.startsWith('image/')||/\.(png|jpe?g|gif|webp)$/i.test(m.attachmentUrl));
            const att=m.attachmentUrl?(isImg?'<a href="'+esc(m.attachmentUrl)+'" target="_blank" rel="noopener"><img class="av-attach" src="'+esc(m.attachmentUrl)+'" alt=""></a>':'<a class="av-file" href="'+esc(m.attachmentUrl)+'" target="_blank" rel="noopener">📎 '+esc(m.attachmentName||'file')+'</a>'):'';
            return '<div class="av-bubble av-bubble-in"><p class="who">'+esc(m.fromName)+' · '+esc(m.fromEmail)+'</p><p class="body">'+esc(m.text||m.body||'')+'</p>'+att+'</div>';
          }).join(''):'<div class="av-empty-chat"><i class="fa-regular fa-comment-dots"></i><p>No messages</p></div>';
          box.scrollTop=box.scrollHeight;
          const actions=document.getElementById('orderChatActions');
          actions.classList.toggle('hidden', o.status==='cancelled');
          document.getElementById('orderChatRefundBtn').onclick=async()=>{
            if(!(await AcctventaConfirm({title:'Refund order',message:'Refund buyer and deduct seller (negative OK)?',okText:'Refund buyer',icon:'fa-rotate-left',danger:true})))return;
            try{const r=await apiStaff('staff.orders.refund',{method:'POST',body:{orderId:id}});alert('Refunded. Seller balance: $'+Number(r.sellerBalance).toFixed(2)+(r.owing?' (owing $'+Number(r.owing).toFixed(2)+')':''));openOrderChat(id);}catch(e){alert(e.message);}
          };
          document.getElementById('orderWarrantyRefundBtn').onclick=async()=>{
            if(!(await AcctventaConfirm({title:'Warranty refund',message:'24h warranty refund: deduct seller (incl. commission clawback) and refund buyer full price?',okText:'Process refund',icon:'fa-shield-halved',danger:true})))return;
            try{
              await apiStaff('staff.orders.deduct_refund',{method:'POST',body:{orderId:id,note:'Owner warranty replacement'}});
              alert('Warranty refund completed.');
              openOrderChat(id);
            }catch(e){alert(e.message);}
          };
          // Load open dispute for this order (if any)
          (async()=>{
            const box=document.getElementById('orderDisputeBox');
            const meta=document.getElementById('orderDisputeMeta');
            try{
              const dres=await apiStaff('staff.disputes.list',{query:{status:'open'}});
              const under=await apiStaff('staff.disputes.list',{query:{status:'under_review'}});
              const all=[...(dres.disputes||[]),...(under.disputes||[])];
              const d=all.find(x=>Number(x.order_id||x.orderId)===Number(id));
              if(!d){ box.classList.add('hidden'); return; }
              box.classList.remove('hidden');
              meta.textContent='#'+(d.id)+' · '+ (d.status||'') +' · '+(d.reason||'No reason')+' · buyer '+(d.buyer_name||d.buyerName||'');
              const noteEl=document.getElementById('orderDisputeNote');
              document.getElementById('orderDisputeRefundBtn').onclick=async()=>{
                if(!(await AcctventaConfirm({title:'Resolve dispute',message:'Resolve dispute with refund to buyer?',okText:'Refund buyer',icon:'fa-gavel',danger:true})))return;
                try{
                  await apiStaff('staff.disputes.resolve',{method:'POST',body:{disputeId:d.id,decision:'refund_buyer',note:noteEl.value||''}});
                  alert('Dispute resolved — buyer refunded.');
                  openOrderChat(id);
                }catch(e){alert(e.message);}
              };
              document.getElementById('orderDisputeDenyBtn').onclick=async()=>{
                if(!(await AcctventaConfirm({title:'Deny dispute',message:'Deny this dispute?',okText:'Deny dispute',icon:'fa-ban',danger:true})))return;
                try{
                  await apiStaff('staff.disputes.resolve',{method:'POST',body:{disputeId:d.id,decision:'deny',note:noteEl.value||''}});
                  alert('Dispute denied.');
                  openOrderChat(id);
                }catch(e){alert(e.message);}
              };
            }catch(e){ box.classList.add('hidden'); }
          })();
          renderOrderChats();
        }
        renderOrderHeader(null);
        loadOrderChats().then(()=>{ if(FOCUS_ORDER) openOrderChat(FOCUS_ORDER); }).catch(e=>alert(e.message));
      </script>
    <?php endif; ?>

    <?php if ($tab === 'reports'):
      ensure_marketplace_extras();
      $reports = [];
      try {
        $reports = db()->query("SELECT r.*, o.public_id, o.title, b.name AS buyer_name, s.name AS seller_name
          FROM seller_reports r
          JOIN orders o ON o.id = r.order_id
          JOIN users b ON b.id = r.reporter_id
          JOIN users s ON s.id = r.seller_id
          ORDER BY r.created_at DESC LIMIT 100")->fetchAll();
      } catch (Throwable $e) {}
    ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Reports</h2>
            <p class="av-page-sub">Seller reports from buyers after purchase.</p>
          </div>
          <div class="av-page-meta av-page-meta-static">
            <span class="av-stat-pill"><strong><?= count($reports) ?></strong> shown</span>
          </div>
        </div>
        <div class="av-panel">
          <div class="av-panel-head"><span>Recent reports</span></div>
          <?php if (!$reports): ?>
            <div class="av-empty">No seller reports yet.</div>
          <?php endif; ?>
          <?php foreach ($reports as $r): ?>
            <article class="av-user-card">
              <div class="av-admin-card-top">
                <div class="min-w-0 flex-1">
                  <p class="av-row-title"><?= h($r['title'] ?? 'Order') ?></p>
                  <p class="av-row-sub font-mono"><?= h($r['public_id']) ?></p>
                  <p class="av-row-sub">Buyer <?= h($r['buyer_name']) ?> · Seller <?= h($r['seller_name']) ?></p>
                  <p class="av-row-sub"><?= h($r['reason']) ?></p>
                  <p class="av-row-sub av-muted"><?= h($r['created_at']) ?></p>
                </div>
              </div>
              <div class="av-admin-card-actions">
                <a class="av-btn av-btn-primary" href="?tab=chats&order_id=<?= (int)$r['order_id'] ?>">Open chat</a>
              </div>
            </article>
          <?php endforeach; ?>
        </div>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'wallet'):
      // Auto-sync Flutterwave deposit/plan/payout statuses so the table doesn't need manual Save
      $flwSync = ['ok' => true, 'skipped' => true];
      try {
        $flwSync = flw_reconcile_pending(false, 60);
      } catch (Throwable $e) {
        $flwSync = ['ok' => false, 'error' => $e->getMessage()];
      }
      $pendingWdAll = db()->query("SELECT t.*, u.email, u.name FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.type='withdrawal' AND t.status='pending' ORDER BY t.created_at ASC")->fetchAll();
      $pendingWd = array_values(array_filter($pendingWdAll, static function ($t) {
        return !tx_is_flutterwave_payout_inflight($t);
      }));
      $sendingWd = array_values(array_filter($pendingWdAll, static function ($t) {
        return tx_is_flutterwave_payout_inflight($t);
      }));
      $pendingDep = db()->query("SELECT t.*, u.email, u.name FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.type='deposit' AND t.status='pending' ORDER BY t.created_at ASC")->fetchAll();
      $txs = db()->query('SELECT t.*, u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 200')->fetchAll();
    ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Wallet</h2>
            <p class="av-page-sub">Approve withdrawals (Flutterwave auto-pay or mark paid manually). Stuck deposits can be credited here if auto-confirm fails.</p>
          </div>
          <div class="av-page-meta av-page-meta-static" aria-label="Pending counts">
            <span class="av-stat-pill"><strong><?= count($pendingWd) ?></strong> need approval</span>
            <span class="av-stat-pill"><strong><?= count($sendingWd) ?></strong> sending</span>
            <span class="av-stat-pill"><strong><?= count($pendingDep) ?></strong> deposits</span>
          </div>
        </div>
        <?php if (empty($flwSync['skipped'])): ?>
          <p class="text-[11px] av-muted mb-2 px-1">Synced with Flutterwave<?= !empty($flwSync['charges']['completed']) || !empty($flwSync['payouts']['completed']) ? ' — statuses updated' : '' ?>.</p>
        <?php endif; ?>
      <div class="av-panel mb-3">
        <div class="av-panel-head">Pending withdrawals</div>
        <div class="av-panel-body">
        <p class="text-xs av-muted mb-3">With Withdraw provider = flutterwave, <strong>Approve &amp; pay</strong> sends the bank transfer from Flutterwave. Check <strong>Mark paid manually</strong> to skip Flutterwave (pay from your bank yourself). Rejecting refunds the user’s wallet.</p>
        <?php if (!$pendingWd): ?>
          <p class="text-sm">No pending withdrawals.</p>
        <?php else: ?>
          <div class="space-y-2">
          <?php foreach ($pendingWd as $t): ?>
            <div class="av-card  p-3 space-y-2">
              <div class="text-xs">
                <p class="font-bold text-sm"><?= h($t['name']) ?> · <?= h($t['email']) ?></p>
                <p>$<?= number_format((float)$t['amount'], 2) ?> · fee $<?= number_format((float)$t['fee'], 2) ?> · payout $<?= number_format((float)($t['payout'] ?? 0), 2) ?></p>
                <p class="text-slate-500 mt-1"><?= h($t['method']) ?></p>
                <p class="break-all text-slate-600 dark:text-slate-300"><?= h($t['note']) ?></p>
                <p class="font-mono text-[10px] text-slate-400"><?= h($t['reference'] ?? '') ?></p>
              </div>
              <form method="post" class="space-y-2">
                <input type="hidden" name="form" value="tx_status">
                <input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>">
                <textarea name="note_edit" rows="2" class="w-full border rounded-lg px-2 py-1.5 text-xs" placeholder="Payout note / bank details (include bankCode=044 if needed)"><?= h($t['note']) ?></textarea>
                <label class="flex items-center gap-2 text-[11px] text-slate-500"><input type="checkbox" name="force_manual" value="1"> Mark paid manually (skip Flutterwave)</label>
                <div class="flex flex-wrap gap-2">
                  <button name="status" value="completed" class="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg">Approve &amp; pay</button>
                  <button name="status" value="cancelled" class="bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-lg">Reject + refund</button>
                </div>
              </form>
            </div>
          <?php endforeach; ?>
          </div>
        <?php endif; ?>
        <?php if ($sendingWd): ?>
          <div class="mt-4 space-y-2">
            <p class="text-xs font-semibold av-muted">Sending via Flutterwave (auto-updates)</p>
            <?php foreach ($sendingWd as $t): ?>
              <div class="av-card p-3 text-xs space-y-1 opacity-90">
                <p class="font-bold text-sm"><?= h($t['name']) ?> · $<?= number_format((float)$t['amount'], 2) ?></p>
                <p class="break-all text-slate-500"><?= h($t['note']) ?></p>
                <p class="text-[10px] text-amber-600 font-semibold">Waiting on Flutterwave — status updates automatically</p>
              </div>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
        </div>
      </div>
      <div class="av-panel mb-3">
        <div class="av-panel-head">Pending deposits</div>
        <div class="av-panel-body">
        <p class="text-xs av-muted mb-3">Flutterwave deposits usually credit themselves. If a payment is stuck after you changed API keys, use <strong>Credit wallet</strong> here. Crypto always needs your confirmation.</p>
        <?php if (!$pendingDep): ?>
          <p class="text-sm">No pending deposits.</p>
        <?php else: ?>
          <div class="space-y-2">
          <?php foreach ($pendingDep as $t):
            $isCrypto = strtolower((string)($t['method'] ?? '')) === 'crypto';
            $isFlw = !$isCrypto && (strtolower((string)($t['method'] ?? '')) === 'flutterwave' || stripos((string)($t['note'] ?? ''), 'Flutterwave') !== false);
          ?>
            <div class="av-card p-3 space-y-2 <?= $isCrypto ? 'border border-amber-400/50' : '' ?>">
              <div class="text-xs space-y-1">
                <p class="font-bold text-sm"><?= h($t['name']) ?> · <a class="text-brand underline" href="mailto:<?= h($t['email']) ?>"><?= h($t['email']) ?></a></p>
                <p class="text-base font-extrabold text-brand">$<?= number_format((float)$t['amount'], 2) ?> <span class="text-[10px] font-semibold uppercase tracking-wide <?= $isCrypto ? 'text-amber-600' : 'text-slate-500' ?>"><?= h($t['method'] ?: 'deposit') ?></span></p>
                <p class="text-slate-600 dark:text-slate-300 break-all"><?= h($t['note']) ?></p>
                <p class="font-mono text-[10px] text-slate-400">Ref <?= h($t['reference'] ?? '') ?> · <?= h($t['created_at'] ?? '') ?></p>
                <?php if ($isFlw): ?>
                  <p class="text-[10px] text-sky-500 font-semibold">Flutterwave — auto-confirm preferred. Use Credit wallet if it stays pending after payment.</p>
                <?php endif; ?>
              </div>
              <div class="flex flex-wrap gap-2">
                <form method="post"><input type="hidden" name="form" value="tx_status"><input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>"><input type="hidden" name="status" value="completed"><button class="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg">Credit wallet</button></form>
                <form method="post"><input type="hidden" name="form" value="tx_status"><input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>"><input type="hidden" name="status" value="cancelled"><button class="bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-lg">Reject</button></form>
                <form method="post" target="_blank" class="inline">
                  <input type="hidden" name="form" value="login_as_user">
                  <input type="hidden" name="user_id" value="<?= (int)$t['user_id'] ?>">
                  <button class="bg-sky-600 text-white text-xs font-bold px-3 py-2 rounded-lg">Open user account</button>
                </form>
              </div>
            </div>
          <?php endforeach; ?>
          </div>
        <?php endif; ?>
        </div>
      </div>
      <div class="av-table-wrap">
        <table class="w-full text-left text-xs">
          <thead><tr><th class="p-3">ID</th><th class="p-3">User</th><th class="p-3">Type</th><th class="p-3">Amount</th><th class="p-3">Fee</th><th class="p-3">Status</th><th class="p-3">Note</th><th class="p-3">Update</th></tr></thead>
          <tbody>
          <?php foreach ($txs as $t):
            $autoFlw = (
              in_array(($t['type'] ?? ''), ['deposit', 'plan', 'withdrawal'], true)
              && (
                strtolower((string)($t['method'] ?? '')) === 'flutterwave'
                || stripos((string)($t['note'] ?? ''), 'Flutterwave') !== false
                || stripos((string)($t['note'] ?? ''), 'flw_payout=') !== false
                || stripos((string)($t['note'] ?? ''), 'Awaiting Flutterwave') !== false
              )
            );
            // Never lock pending rows behind "Auto" — owner must be able to credit stuck deposits after key changes
            $lockAuto = $autoFlw && in_array(($t['status'] ?? ''), ['completed', 'failed'], true);
          ?>
            <tr class="border-t">
              <td class="p-3"><?= (int)$t['id'] ?></td>
              <td class="p-3"><?= h($t['email']) ?></td>
              <td class="p-3"><?= h($t['type']) ?></td>
              <td class="p-3">$<?= number_format((float)$t['amount'], 2) ?></td>
              <td class="p-3">$<?= number_format((float)$t['fee'], 2) ?></td>
              <td class="p-3">
                <span class="av-status-badge av-status-<?= h($t['status']) ?>"><?= h($t['status']) ?></span>
              </td>
              <td class="p-3 max-w-[180px] truncate" title="<?= h($t['note']) ?>"><?= h($t['note']) ?></td>
              <td class="p-3">
                <?php if ($lockAuto): ?>
                  <span class="text-[10px] av-muted font-semibold">Auto · Flutterwave</span>
                <?php else: ?>
                <form method="post" class="flex gap-1">
                  <input type="hidden" name="form" value="tx_status">
                  <input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>">
                  <select name="status" class="border rounded px-1">
                    <?php foreach (['pending','completed','failed','cancelled'] as $st): ?>
                      <option <?= $t['status']===$st?'selected':'' ?>><?= $st ?></option>
                    <?php endforeach; ?>
                  </select>
                  <button class="bg-brand text-white px-2 rounded">Save</button>
                </form>
                <?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'currencies'): $wc = wallet_currencies_get(); ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Currencies</h2>
            <p class="av-page-sub">Local rates and crypto deposit addresses.</p>
          </div>
        </div>
      <form method="post" class="space-y-3">
        <input type="hidden" name="form" value="currencies">
        <div class="av-panel">
          <div class="av-panel-head"><span>Local rates</span></div>
          <div class="av-panel-body">
          <p class="text-xs av-muted mb-3">Units per $1 — shown on Deposit and Withdraw screens.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-xs av-muted border-b" style="border-color:var(--av-border)">
                <tr>
                  <th class="py-2 pr-2">Country</th>
                  <th class="py-2 pr-2">Code</th>
                  <th class="py-2 pr-2">1 USD =</th>
                  <th class="py-2 pr-2 text-center">On</th>
                </tr>
              </thead>
              <tbody>
              <?php foreach (($wc['local'] ?? []) as $i => $c): ?>
                <tr class="border-b" style="border-color:var(--av-border)">
                  <td class="py-3 pr-2">
                    <div class="flex items-center gap-2">
                      <?php if (!empty($c['flag'])): ?>
                        <img src="https://flagcdn.com/w40/<?= h($c['flag']) ?>.png" alt="" class="w-6 h-6 rounded-full object-cover">
                      <?php endif; ?>
                      <input type="hidden" name="local[<?= $i ?>][flag]" value="<?= h($c['flag'] ?? '') ?>">
                      <input type="hidden" name="local[<?= $i ?>][code]" value="<?= h($c['code'] ?? '') ?>">
                      <input name="local[<?= $i ?>][name]" value="<?= h($c['name'] ?? '') ?>" class="av-field" style="width:9rem">
                    </div>
                  </td>
                  <td class="py-3 pr-2 font-mono font-bold text-xs"><?= h($c['code'] ?? '') ?></td>
                  <td class="py-3 pr-2">
                    <input name="local[<?= $i ?>][rate]" type="number" step="0.01" min="0.01" value="<?= h((string)($c['rate'] ?? 1)) ?>" class="av-field" style="width:6.5rem" required>
                  </td>
                  <td class="py-3 pr-2 text-center">
                    <input type="checkbox" name="local[<?= $i ?>][enabled]" value="1" class="accent-sky-500 w-4 h-4" <?= !empty($c['enabled']) ? 'checked' : '' ?>>
                  </td>
                </tr>
              <?php endforeach; ?>
              </tbody>
            </table>
          </div>
          </div>
        </div>

        <div class="av-panel">
          <div class="av-panel-head"><span>Crypto addresses</span></div>
          <div class="av-panel-body space-y-3">
          <p class="text-xs av-muted">Users only see coins/networks with an address filled in. Networks are comma-separated (e.g. TRC20, BEP20).</p>
              <?php foreach (($wc['crypto'] ?? []) as $i => $c):
                $nets = $c['networks'] ?? [];
                if (!is_array($nets)) $nets = [];
                $addrs = is_array($c['addresses'] ?? null) ? $c['addresses'] : [];
              ?>
                <div class="av-admin-card space-y-3">
                  <div class="av-form-grid cols-3">
                    <div>
                      <p class="text-[10px] uppercase av-muted font-semibold">Coin</p>
                      <p class="font-mono font-bold text-sm"><?= h($c['code'] ?? '') ?></p>
                      <input type="hidden" name="crypto[<?= $i ?>][code]" value="<?= h($c['code'] ?? '') ?>">
                    </div>
                    <div class="av-field-block">
                      <label>Name</label>
                      <input name="crypto[<?= $i ?>][name]" value="<?= h($c['name'] ?? '') ?>">
                    </div>
                    <div class="av-field-block">
                      <label>Networks</label>
                      <input name="crypto[<?= $i ?>][networks]" value="<?= h(implode(', ', $nets)) ?>" placeholder="TRC20, BEP20, ERC20">
                    </div>
                  </div>
                  <label class="av-wd-toggle" style="padding-left:0">
                    <input type="checkbox" name="crypto[<?= $i ?>][enabled]" value="1" <?= !empty($c['enabled']) ? 'checked' : '' ?>>
                    Enabled
                  </label>
                  <div class="av-form-grid cols-2">
                    <?php if (!$nets): ?>
                      <p class="text-[11px]" style="color:#d97706">Add at least one network, then Save to enter addresses.</p>
                    <?php endif; ?>
                    <?php foreach ($nets as $net):
                      $nk = strtoupper(trim((string)$net));
                      if ($nk === '') continue;
                      $addrVal = (string)($addrs[$nk] ?? '');
                    ?>
                      <div class="av-field-block">
                        <label><?= h($nk) ?> deposit address</label>
                        <input name="crypto[<?= $i ?>][addr][<?= h($nk) ?>]" value="<?= h($addrVal) ?>" placeholder="Paste <?= h($nk) ?> wallet address" class="font-mono text-xs" style="<?= $addrVal === '' ? 'border-color:#f59e0b' : '' ?>">
                        <?php if ($addrVal === ''): ?>
                          <p class="text-[10px] mt-0.5" style="color:#d97706">Empty — users cannot deposit this network yet.</p>
                        <?php endif; ?>
                      </div>
                    <?php endforeach; ?>
                  </div>
                </div>
              <?php endforeach; ?>
          </div>
        </div>

        <button class="av-btn av-btn-primary">Save rates</button>
      </form>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'gateways'): ?>
      <?php
        $fxRate = (float)setting_get('usd_ngn_rate', '1600');
        $fxCur = setting_get('payment_currency', 'NGN');
      ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Payment gateways</h2>
            <p class="av-page-sub">Flutterwave keys, webhooks, and Naira rate.</p>
          </div>
        </div>

        <form method="post" class="av-panel mb-3">
          <input type="hidden" name="form" value="fx_rate">
          <div class="av-panel-head"><span>Quick Naira rate</span></div>
          <div class="av-panel-body space-y-3">
            <p class="text-xs av-muted">Wallet stays in USD. For all country rates use <a href="?tab=currencies" class="text-brand font-semibold underline">Currencies</a>.</p>
            <div class="av-form-grid cols-3">
              <div class="av-field-block">
                <label>Charge currency</label>
                <select name="payment_currency">
                  <option value="NGN" <?= $fxCur==='NGN'?'selected':'' ?>>NGN (Naira)</option>
                  <option value="USD" <?= $fxCur==='USD'?'selected':'' ?>>USD (no convert)</option>
                </select>
              </div>
              <div class="av-field-block">
                <label>1 USD = how many ₦?</label>
                <input name="usd_ngn_rate" type="number" min="1" step="1" value="<?= h((string)$fxRate) ?>" required>
              </div>
              <div class="av-field-block" style="display:flex;align-items:end">
                <button class="av-btn av-btn-primary" style="width:100%">Save Naira rate</button>
              </div>
            </div>
            <p class="text-[11px] av-muted">Example at ₦<?= number_format($fxRate) ?>: deposit <strong>$3.00</strong> → about <strong>₦<?= number_format(3 * $fxRate) ?></strong>.</p>
          </div>
        </form>

        <form method="post" class="av-panel">
          <input type="hidden" name="form" value="gateway">
          <div class="av-panel-head"><span>Providers</span></div>
          <div class="av-panel-body space-y-4">
            <div class="av-admin-card">
              <h3 class="av-row-title" style="margin-bottom:0.55rem">Deposit</h3>
              <p class="text-[11px] av-muted mb-2">Business account: paste <strong>LIVE</strong> keys from Flutterwave → Settings → API Keys. Secret must start with <code>FLWSECK_LIVE-</code> (full key, not truncated). Webhook must end with <code>action=webhook.flutterwave</code>.</p>
              <div class="av-form-grid space-y-2">
                <div class="av-field-block">
                  <label>Provider</label>
                  <select name="deposit_provider">
                    <?php foreach (['none','paystack','flutterwave','stripe','nowpayments'] as $p): ?>
                      <option value="<?= $p ?>" <?= ($gw['deposit_provider']??'')===$p?'selected':'' ?>><?= $p ?></option>
                    <?php endforeach; ?>
                  </select>
                </div>
                <label class="av-wd-toggle" style="padding-left:0"><input type="checkbox" name="deposit_enabled" <?= !empty($gw['deposit_enabled'])?'checked':'' ?>> Enabled</label>
                <div class="av-field-block"><label>Public key</label><input name="deposit_public_key" value="<?= h($gw['deposit_public_key']??'') ?>" placeholder="FLWPUBK_LIVE-..." autocomplete="off"></div>
                <div class="av-field-block"><label>Secret key</label><input name="deposit_secret_key" value="<?= h($gw['deposit_secret_key']??'') ?>" placeholder="FLWSECK_LIVE-..." autocomplete="off"></div>
                <div class="av-field-block"><label>Webhook</label><input name="deposit_webhook" value="<?= h(($gw['deposit_webhook']??'') !== '' ? $gw['deposit_webhook'] : 'https://acctventa.com/api/index.php?action=webhook.flutterwave') ?>" placeholder="https://acctventa.com/api/index.php?action=webhook.flutterwave"></div>
                <div class="av-field-block"><label>Notes</label><textarea name="deposit_notes" rows="2" placeholder="Optional notes (not the encryption key)"><?= h($gw['deposit_notes']??'') ?></textarea></div>
              </div>
            </div>
            <div class="av-admin-card">
              <h3 class="av-row-title" style="margin-bottom:0.55rem">Withdraw / payout</h3>
              <p class="text-[11px] av-muted mb-2">Set provider to <strong>flutterwave</strong> and enable — Approve pays via Flutterwave. Or set <strong>manual</strong> and tick “Mark paid manually” when you pay from your bank. Leave secret blank to reuse the Deposit secret key.</p>
              <div class="av-form-grid space-y-2">
                <div class="av-field-block">
                  <label>Provider</label>
                  <select name="withdraw_provider">
                    <?php foreach (['none','paystack','flutterwave','stripe','nowpayments','manual'] as $p): ?>
                      <option value="<?= $p ?>" <?= ($gw['withdraw_provider']??'')===$p?'selected':'' ?>><?= $p ?></option>
                    <?php endforeach; ?>
                  </select>
                </div>
                <label class="av-wd-toggle" style="padding-left:0"><input type="checkbox" name="withdraw_enabled" <?= !empty($gw['withdraw_enabled'])?'checked':'' ?>> Enabled</label>
                <div class="av-field-block"><label>Public key</label><input name="withdraw_public_key" value="<?= h($gw['withdraw_public_key']??'') ?>" placeholder="Optional — usually same as deposit" autocomplete="off"></div>
                <div class="av-field-block"><label>Secret key</label><input name="withdraw_secret_key" value="<?= h($gw['withdraw_secret_key']??'') ?>" placeholder="Optional — blank uses deposit secret" autocomplete="off"></div>
                <div class="av-field-block"><label>Webhook</label><input name="withdraw_webhook" value="<?= h($gw['withdraw_webhook']??'') ?>" placeholder="Same webhook URL is fine"></div>
                <div class="av-field-block"><label>Notes</label><textarea name="withdraw_notes" rows="2" placeholder="Notes"><?= h($gw['withdraw_notes']??'') ?></textarea></div>
              </div>
            </div>
            <button class="av-btn av-btn-primary">Save gateways</button>
          </div>
        </form>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'settings'): ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Settings</h2>
            <p class="av-page-sub">Fees, referral rewards, and support contacts.</p>
          </div>
        </div>
        <form method="post" class="av-panel">
          <input type="hidden" name="form" value="settings">
          <div class="av-panel-head"><span>Platform</span></div>
          <div class="av-panel-body space-y-4">
            <div class="av-admin-card">
              <h3 class="av-row-title" style="margin-bottom:0.45rem">₦ Naira rate</h3>
              <p class="text-[11px] av-muted mb-2">Same control as Gateways. Applies to the next Flutterwave deposit.</p>
              <div class="av-form-grid cols-2">
                <div class="av-field-block">
                  <label>Charge currency</label>
                  <select name="payment_currency">
                    <?php $pc = setting_get('payment_currency', 'NGN'); ?>
                    <option value="NGN" <?= $pc==='NGN'?'selected':'' ?>>NGN (Naira)</option>
                    <option value="USD" <?= $pc==='USD'?'selected':'' ?>>USD</option>
                  </select>
                </div>
                <div class="av-field-block">
                  <label>USD → NGN rate</label>
                  <input name="usd_ngn_rate" type="number" step="1" min="1" value="<?= h(setting_get('usd_ngn_rate','1600')) ?>">
                </div>
              </div>
            </div>
            <div class="av-form-grid cols-2">
              <div class="av-field-block"><label>Min deposit ($)</label><input name="min_deposit" type="number" step="0.01" value="<?= h(setting_get('min_deposit',3)) ?>"></div>
              <div class="av-field-block"><label>Min withdraw ($)</label><input name="min_withdraw" type="number" step="0.01" value="<?= h(setting_get('min_withdraw',5)) ?>"></div>
              <div class="av-field-block"><label>Sales commission (%)</label><input name="sales_commission" type="number" step="0.1" value="<?= h(((float)setting_get('sales_commission_rate',0.22))*100) ?>"></div>
              <div class="av-field-block"><label>Withdraw commission (%)</label><input name="withdraw_commission" type="number" step="0.1" value="<?= h(((float)setting_get('withdraw_commission_rate',0.1))*100) ?>"></div>
              <div class="av-field-block"><label>Deposit fee (%)</label><input name="deposit_fee" type="number" step="0.1" value="<?= h(((float)setting_get('deposit_fee_rate',0))*100) ?>"></div>
              <div class="av-field-block"><label>Referral reward ($)</label><input name="referral_reward" type="number" step="0.01" value="<?= h(setting_get('referral_reward_amount',5)) ?>"></div>
              <div class="av-field-block"><label>Referral min deposit ($)</label><input name="referral_min_deposit" type="number" step="0.01" value="<?= h(setting_get('referral_min_deposit',50)) ?>"></div>
<<<<<<< HEAD
              <div class="av-field-block"><label>Support Telegram</label><input name="support_telegram" value="<?= h(setting_get('support_telegram','https://t.me/acctventa_support')) ?>" placeholder="https://t.me/acctventa_support"></div>
=======
              <div class="av-field-block"><label>Support Telegram</label><input name="support_telegram" value="<?= h(setting_get('support_telegram','https://t.me/acctventa')) ?>"></div>
>>>>>>> 3af3153 (Restore iOS-style Owner Admin UI accidentally overwritten by deploy)
              <div class="av-field-block" style="grid-column:1/-1"><label>Support email</label><input name="support_email" value="<?= h(setting_get('support_email','support@acctventa.com')) ?>"></div>
            </div>
            <button class="av-btn av-btn-primary">Save settings</button>
          </div>
        </form>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'plans'): $plans = db()->query('SELECT * FROM plans ORDER BY price ASC')->fetchAll(); ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Plans &amp; pricing</h2>
            <p class="av-page-sub">Daily upload limits shown on Packages &amp; Pricing. Paid upgrades use Flutterwave or wallet.</p>
          </div>
        </div>
        <div class="av-panel">
          <div class="av-panel-head"><span>Plans</span></div>
          <div class="av-panel-body space-y-3">
            <?php foreach ($plans as $p): ?>
              <form method="post" class="av-admin-card av-plan-card">
                <input type="hidden" name="form" value="plan">
                <input type="hidden" name="plan_id" value="<?= h($p['id']) ?>">
                <div>
                  <p class="av-row-title"><?= h($p['id']) ?></p>
                </div>
                <div class="av-field-block"><label>Name</label><input name="name" value="<?= h($p['name']) ?>"></div>
                <div class="av-field-block"><label>Price</label><input name="price" type="number" step="0.01" value="<?= h($p['price']) ?>"></div>
                <div class="av-field-block"><label>Daily uploads</label><input name="daily_uploads" type="number" value="<?= h($p['daily_uploads']) ?>"></div>
                <div class="av-field-block">
                  <label>Approval label</label>
                  <input name="approval_label" value="<?= h($p['approval_label']) ?>">
                  <button class="av-btn av-btn-primary" style="width:100%;margin-top:0.45rem">Save</button>
                </div>
              </form>
            <?php endforeach; ?>
          </div>
        </div>
      </div>
    <?php endif; ?>
  </main>
<?php endif; ?>
<script>
function toggleOwnerTheme(){
  const html=document.documentElement;
  const dark=html.classList.toggle('dark');
  try{localStorage.setItem('acctventa_owner_theme', dark?'dark':'light');}catch(e){}
  const btn=document.getElementById('ownerThemeBtn');
  if(btn) btn.textContent=dark?'Light':'Dark';
}
(function(){
  const dark=document.documentElement.classList.contains('dark');
  const btn=document.getElementById('ownerThemeBtn');
  if(btn) btn.textContent=dark?'Light':'Dark';
})();
</script>
</body>
</html>
