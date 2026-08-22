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
    $pass = trim((string)($_POST['password'] ?? ''));
    if (owner_password_verify($user, $pass)) {
        $_SESSION['owner_ok'] = true;
        header('Location: /owner/');
        exit;
    }
    $error = 'Invalid owner username or password. If you changed it in Website Admin before, upload the latest owner login fix — or use Reset below with your api/config.php password.';
}

if (($_POST['form'] ?? '') === 'owner_recover') {
    $master = trim((string)($_POST['master_password'] ?? ''));
    $next = trim((string)($_POST['new_password'] ?? ''));
    $confirm = trim((string)($_POST['confirm_password'] ?? ''));
    $configPass = config_owner_password();
    if ($configPass === '' || !hash_equals($configPass, $master)) {
        $error = 'Recovery code does not match owner_password in api/config.php on the server.';
    } elseif (strlen($next) < 6) {
        $error = 'New password must be at least 6 characters.';
    } elseif ($next !== $confirm) {
        $error = 'New password and confirmation do not match.';
    } else {
        owner_password_set($next);
        admin_password_set($next);
        $_SESSION['owner_ok'] = true;
        header('Location: /owner/?tab=settings&recovered=1');
        exit;
    }
}

$authed = !empty($_SESSION['owner_ok']);
if ($authed) {
    try { migrate_legacy_support_email(); } catch (Throwable $e) {}
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
        if ($form === 'owner_password') {
            $current = (string)($_POST['current_password'] ?? '');
            $next = (string)($_POST['new_password'] ?? '');
            $confirm = (string)($_POST['confirm_password'] ?? '');
            if (!owner_password_verify(owner_username(), $current)) {
                throw new RuntimeException('Current password is wrong.');
            }
            if (strlen($next) < 6) {
                throw new RuntimeException('New password must be at least 6 characters.');
            }
            if ($next !== $confirm) {
                throw new RuntimeException('New password and confirmation do not match.');
            }
            owner_password_set($next);
            admin_password_set($next);
            $flash = 'Owner password updated. Use it for Owner Admin and Website Admin sign-in.';
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
            $stmt = db()->prepare('UPDATE gateway_settings SET
                deposit_provider=?, deposit_enabled=?, deposit_public_key=?, deposit_secret_key=?, deposit_webhook=?, deposit_notes=?,
                withdraw_provider=?, withdraw_enabled=?, withdraw_public_key=?, withdraw_secret_key=?, withdraw_webhook=?, withdraw_notes=?
                WHERE id=1');
            $stmt->execute([
                $_POST['deposit_provider'], isset($_POST['deposit_enabled']) ? 1 : 0, $_POST['deposit_public_key'], $_POST['deposit_secret_key'], $_POST['deposit_webhook'], $_POST['deposit_notes'],
                $_POST['withdraw_provider'], isset($_POST['withdraw_enabled']) ? 1 : 0, $_POST['withdraw_public_key'], $_POST['withdraw_secret_key'], $_POST['withdraw_webhook'], $_POST['withdraw_notes'],
            ]);
            $flash = 'Gateway settings saved.';
        }
        if ($form === 'ban_user') {
            db()->prepare('UPDATE users SET is_banned = ? WHERE id = ?')->execute([(int)$_POST['banned'], (int)$_POST['user_id']]);
            $flash = 'User ban status updated.';
        }
        if ($form === 'verify_user') {
            db()->prepare('UPDATE users SET is_verified = ? WHERE id = ?')->execute([(int)$_POST['verified'], (int)$_POST['user_id']]);
            $flash = 'Verification updated.';
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
        }
        if ($form === 'ad_status') {
            $status = $_POST['status'];
            $reason = trim((string)($_POST['reason'] ?? ''));
            db()->prepare('UPDATE ads SET status = ?, deny_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                ->execute([$status, $reason, 'Owner', (int)$_POST['ad_id']]);
            $ad = db()->query('SELECT seller_id, title FROM ads WHERE id=' . (int)$_POST['ad_id'])->fetch();
            if ($ad) notify_user((int)$ad['seller_id'], 'Ad ' . $status, $reason !== '' ? $reason : ('Your listing "' . $ad['title'] . '" is now ' . $status), 'ad_review');
            $flash = 'Ad status updated.';
        }
        if ($form === 'tx_status') {
            $txId = (int)$_POST['tx_id'];
            $newStatus = (string)$_POST['status'];
            $tx = db()->prepare('SELECT * FROM transactions WHERE id = ?');
            $tx->execute([$txId]);
            $row = $tx->fetch();
            if ($row) {
                $old = $row['status'];
                // If cancelling/rejecting a pending withdrawal, refund the user
                if ($row['type'] === 'withdrawal' && $old === 'pending' && in_array($newStatus, ['cancelled', 'failed'], true)) {
                    ensure_wallet_ledger_columns();
                    db()->prepare('UPDATE users SET balance = balance + ?, withdrawable_balance = withdrawable_balance + ?, total_withdrawals = GREATEST(0, total_withdrawals - ?) WHERE id = ?')
                        ->execute([money_f($row['amount']), money_f($row['amount']), money_f($row['amount']), (int)$row['user_id']]);
                    notify_user((int)$row['user_id'], 'Withdrawal declined', 'Your withdrawal of $' . money_f($row['amount']) . ' was declined and refunded to your withdrawable balance.', 'wallet');
                }
                if ($row['type'] === 'withdrawal' && $old === 'pending' && $newStatus === 'completed') {
                    notify_user((int)$row['user_id'], 'Withdrawal paid', 'Your withdrawal of $' . money_f($row['payout'] ?? $row['amount']) . ' was marked completed.', 'wallet');
                    // Lock bank details after first successful bank payout
                    if (strtolower((string)($row['method'] ?? '')) === 'bank') {
                        ensure_user_payout_columns();
                        db()->prepare('UPDATE users SET payout_bank_locked = 1 WHERE id = ? AND payout_account != \'\'')
                            ->execute([(int)$row['user_id']]);
                    }
                }
                // Approving a pending deposit credits the wallet (crypto / manual)
                if ($row['type'] === 'deposit' && $old === 'pending' && $newStatus === 'completed') {
                    db()->prepare('UPDATE users SET balance = balance + ?, total_deposits = total_deposits + ? WHERE id = ?')
                        ->execute([money_f($row['amount']), money_f($row['amount']), (int)$row['user_id']]);
                    notify_user((int)$row['user_id'], 'Deposit credited', 'Your deposit of $' . money_f($row['amount']) . ' was credited to your wallet (spendable — not withdrawable).', 'wallet');
                    try {
                        maybe_credit_referral_reward((int)$row['user_id']);
                    } catch (Throwable $e) {}
                }
                if (!empty($_POST['note_edit'])) {
                    db()->prepare('UPDATE transactions SET status = ?, note = ? WHERE id = ?')
                        ->execute([$newStatus, trim((string)$_POST['note_edit']), $txId]);
                } else {
                    db()->prepare('UPDATE transactions SET status = ? WHERE id = ?')->execute([$newStatus, $txId]);
                }
            }
            $flash = 'Transaction status updated.';
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
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config={darkMode:'class',theme:{extend:{colors:{brand:'#0ea5e9'}}}};
    (function(){try{var t=localStorage.getItem('acctventa_owner_theme')||'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/admin-app.css?v=20260822kyc3">
  <link rel="stylesheet" href="/css/ui-toast.css?v=20260821toast2">
  <link rel="stylesheet" href="/css/mobile-fix.css?v=20260822tap1">
  <script src="/js/mobile-fix.js?v=20260822tap1"></script>
  <script src="/js/ui-toast.js?v=20260821toast2"></script>
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
        <input name="username" autocomplete="username" value="<?= h($cfg['owner_username'] ?? 'owner') ?>" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" required>
      </div>
      <div>
        <label class="text-xs text-slate-500">Password</label>
        <input name="password" type="password" autocomplete="current-password" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" required>
      </div>
      <button class="w-full bg-brand text-white font-bold py-3 rounded-xl text-sm">Sign in</button>
      <details class="text-left border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        <summary class="text-xs font-semibold text-brand cursor-pointer">Reset password (uses api/config.php)</summary>
        <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">If a past password change only saved on one phone, reset here with the <code class="text-[10px]">owner_password</code> from Hostinger → <code class="text-[10px]">public_html/api/config.php</code>. This updates Owner Admin and Website Admin on the server.</p>
        <div class="space-y-2 mt-3">
          <div>
            <label class="text-xs text-slate-500">Config password (owner_password)</label>
            <input name="master_password" type="password" autocomplete="off" form="ownerRecoverForm" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base">
          </div>
          <div>
            <label class="text-xs text-slate-500">New password</label>
            <input name="new_password" type="password" autocomplete="new-password" form="ownerRecoverForm" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" minlength="6">
          </div>
          <div>
            <label class="text-xs text-slate-500">Confirm new password</label>
            <input name="confirm_password" type="password" autocomplete="new-password" form="ownerRecoverForm" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" minlength="6">
          </div>
          <button type="submit" form="ownerRecoverForm" class="w-full border-2 border-brand text-brand font-semibold py-2.5 rounded-xl text-sm">Reset &amp; sign in</button>
        </div>
      </details>
      <form id="ownerRecoverForm" method="post" class="hidden">
        <input type="hidden" name="form" value="owner_recover">
      </form>
      <p class="text-[11px] text-slate-400 text-center leading-relaxed">Website Admin password changes only apply here after the latest server files are uploaded. Until then, use <code class="text-[10px]">owner_password</code> from config.php or Reset above.</p>
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
  ];
  try {
    ensure_kyc_tables();
    $stats['kyc_pending'] = (int)db()->query("SELECT COUNT(*) c FROM kyc_submissions WHERE status IN ('needs_review','blurry_review','pending')")->fetch()['c'];
  } catch (Throwable $e) {}
  $gw = db()->query('SELECT * FROM gateway_settings WHERE id=1')->fetch() ?: [];
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

    <div class="av-tabs">
      <?php foreach (['overview'=>'Overview','users'=>'Users','kyc'=>'KYC','ads'=>'Ads','orders'=>'Orders','chats'=>'Order chats','reports'=>'Reports','wallet'=>'Wallet','support'=>'Inbox','currencies'=>'Currencies','gateways'=>'Gateways','settings'=>'Settings','plans'=>'Plans'] as $k=>$label): ?>
        <a href="?tab=<?= $k ?>" class="av-tab <?= $tab===$k?'av-tab-active':'' ?>"><?= $label ?></a>
      <?php endforeach; ?>
    </div>

    <?php if ($tab === 'overview'): ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Overview</h2>
            <p class="av-page-sub">Live snapshot of users, KYC, ads, wallet, and sales volume.</p>
          </div>
          <div class="av-page-meta">
            <span class="av-chip"><strong><?= (int)$stats['kyc_pending'] ?></strong> KYC queue</span>
            <span class="av-chip <?= $stats['ads_pending'] ? 'is-hot' : '' ?>"><strong><?= (int)$stats['ads_pending'] ?></strong> ads</span>
            <span class="av-chip"><strong><?= (int)$stats['withdraw_pending'] ?></strong> withdrawals</span>
          </div>
        </div>
        <div class="av-stat-grid">
          <div class="av-stat"><p class="label">Users</p><p class="value"><?= $stats['users'] ?></p></div>
          <div class="av-stat"><p class="label">Pending ads</p><p class="value"><?= $stats['ads_pending'] ?></p></div>
          <div class="av-stat"><p class="label">KYC review</p><p class="value"><?= $stats['kyc_pending'] ?></p></div>
          <div class="av-stat"><p class="label">Orders</p><p class="value"><?= $stats['orders'] ?></p></div>
          <div class="av-stat"><p class="label">Pending withdrawals</p><p class="value"><?= $stats['withdraw_pending'] ?></p></div>
          <div class="av-stat"><p class="label">Pending deposits</p><p class="value"><?= $stats['deposit_pending'] ?></p></div>
          <div class="av-stat"><p class="label">Completed volume</p><p class="value">$<?= number_format($stats['volume'], 2) ?></p></div>
        </div>
        <div class="av-panel">
          <div class="av-panel-head">Quick links</div>
          <div class="av-panel-body flex flex-wrap gap-2">
            <a class="av-btn av-btn-primary" href="?tab=kyc">Review KYC</a>
            <a class="av-btn" href="?tab=wallet">Wallet queue</a>
            <a class="av-btn" href="?tab=ads">Ads</a>
            <a class="av-btn" href="?tab=support">Inbox</a>
            <a class="av-btn" href="?tab=currencies">Crypto addresses</a>
            <a class="av-btn" href="?tab=users">Users</a>
          </div>
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
      $users = db()->query('SELECT * FROM users ORDER BY created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Users</h2>
            <p class="av-page-sub">Ban, verify, or login as a user.</p>
          </div>
          <div class="av-page-meta">
            <span class="av-chip"><strong><?= count($users) ?></strong> shown</span>
          </div>
        </div>
        <div class="av-panel">
          <div class="av-panel-head"><span>Directory</span></div>
          <?php if (!$users): ?>
            <div class="av-empty">No users yet.</div>
          <?php endif; ?>
          <?php foreach ($users as $u):
            $parts = preg_split('/\s+/', trim((string)$u['name']));
            $initials = '';
            foreach ($parts as $p) { if ($p !== '') $initials .= strtoupper($p[0]); if (strlen($initials) >= 2) break; }
            if ($initials === '') $initials = '?';
          ?>
            <div class="av-user-card">
              <div class="av-user-main">
                <div class="av-avatar"><?= h($initials) ?></div>
                <div class="min-w-0 flex-1">
                  <p class="av-row-title"><?= h($u['name']) ?> <span class="av-muted" style="font-weight:500;font-size:0.7rem">#<?= (int)$u['id'] ?></span></p>
                  <p class="av-row-sub"><?= h($u['email']) ?></p>
                  <p class="av-row-sub">
                    Balance $<?= number_format((float)$u['balance'], 2) ?>
                    · WD $<?= number_format((float)($u['withdrawable_balance'] ?? 0), 2) ?>
                    · <?= h($u['plan']) ?>
                    <?= (int)$u['is_banned'] ? ' · Banned' : '' ?>
                    <?= (int)$u['is_verified'] ? ' · Verified' : '' ?>
                  </p>
                </div>
              </div>
              <div class="av-user-actions">
                <form method="post">
                  <input type="hidden" name="form" value="ban_user">
                  <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
                  <input type="hidden" name="banned" value="<?= (int)$u['is_banned']?0:1 ?>">
                  <button class="av-btn"><?= (int)$u['is_banned']?'Unban':'Ban' ?></button>
                </form>
                <form method="post">
                  <input type="hidden" name="form" value="verify_user">
                  <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
                  <input type="hidden" name="verified" value="<?= (int)$u['is_verified']?0:1 ?>">
                  <button class="av-btn av-btn-success"><?= (int)$u['is_verified']?'Unverify':'Verify' ?></button>
                </form>
                <form method="post" target="_blank">
                  <input type="hidden" name="form" value="login_as_user">
                  <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
                  <button class="av-btn av-btn-primary">Login as user</button>
                </form>
                <form method="post" class="av-user-actions" style="width:100%;margin-top:0.15rem">
                  <input type="hidden" name="form" value="adjust_balance">
                  <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
                  <input name="amount" type="number" step="0.01" placeholder="+/- amount" class="text-xs px-3 py-2 rounded-xl" style="width:7rem">
                  <input name="note" placeholder="note" class="text-xs px-3 py-2 rounded-xl" style="width:7rem">
                  <label class="av-chip" style="cursor:pointer"><input type="checkbox" name="as_withdrawable" value="1"> WD</label>
                  <button class="av-btn av-btn-primary">Adjust</button>
                </form>
              </div>
            </div>
          <?php endforeach; ?>
        </div>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'ads'): $ads = db()->query('SELECT a.*, u.name seller_name, u.email seller_email FROM ads a JOIN users u ON u.id=a.seller_id ORDER BY a.created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Ads</h2>
            <p class="av-page-sub">Approve, deny, or remove marketplace listings.</p>
          </div>
          <div class="av-page-meta">
            <span class="av-chip"><strong><?= count($ads) ?></strong> listings</span>
          </div>
        </div>
        <?php if (!$ads): ?>
          <div class="av-panel"><div class="av-empty">No ads yet.</div></div>
        <?php endif; ?>
        <?php foreach ($ads as $a):
          $st = (string)$a['status'];
          $badge = 'av-badge-muted';
          if ($st === 'active') $badge = 'av-badge-ok';
          elseif ($st === 'pending') $badge = 'av-badge-warn';
          elseif ($st === 'denied') $badge = 'av-badge-danger';
        ?>
          <article class="av-row-card">
            <div class="av-row-top">
              <div class="min-w-0">
                <h3 class="av-row-title"><?= h($a['title']) ?> <span class="av-muted" style="font-weight:500;font-size:0.7rem">#<?= (int)$a['id'] ?></span></h3>
                <p class="av-row-sub"><?= h($a['seller_name']) ?> · <?= h($a['seller_email']) ?> · <?= h($a['category']) ?></p>
                <p class="av-row-sub" style="word-break:break-all"><?= h($a['preview_link']) ?></p>
                <?php if ($a['deny_reason']): ?><p class="av-row-sub" style="color:#e11d48"><?= h($a['deny_reason']) ?></p><?php endif; ?>
              </div>
              <div style="text-align:right">
                <span class="av-badge <?= $badge ?>"><?= h($st) ?></span>
                <p class="av-row-title" style="margin-top:0.45rem;color:var(--av-brand)">$<?= number_format((float)$a['price'], 2) ?></p>
              </div>
            </div>
            <div class="av-actions">
              <form method="post"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="ad_id" value="<?= (int)$a['id'] ?>"><input type="hidden" name="status" value="active"><button class="av-btn av-btn-success">Approve</button></form>
              <form method="post" class="grow" style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="ad_id" value="<?= (int)$a['id'] ?>"><input type="hidden" name="status" value="denied"><input name="reason" placeholder="deny reason" class="grow text-xs px-3 py-2 rounded-xl"><button class="av-btn av-btn-danger">Deny</button></form>
              <form method="post"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="ad_id" value="<?= (int)$a['id'] ?>"><input type="hidden" name="status" value="removed"><button class="av-btn">Remove</button></form>
            </div>
          </article>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'orders'): $orders = db()->query('SELECT o.*, b.name buyer_name, s.name seller_name, s.balance seller_balance FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id ORDER BY o.created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="av-card  p-4 mb-3 space-y-2">
        <h2 class="font-bold">Find sale by Transaction ID</h2>
        <p class="text-xs text-slate-500">Search TXID / email / name, open buyer↔seller chat, then refund if needed (seller can go negative).</p>
        <div class="flex flex-wrap gap-2">
          <input id="ownerTxSearch" type="text" placeholder="TXID or email…" class="border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2 text-base flex-1 min-w-[200px]">
          <button type="button" onclick="ownerSearchOrder()" class="bg-brand text-white font-bold px-4 py-2 rounded-xl text-sm">Search</button>
        </div>
        <div id="ownerTxResult" class="text-xs space-y-2"></div>
      </div>
      <div class="av-table-wrap">
        <table class="w-full text-left text-xs">
          <thead><tr><th class="p-3">TXID</th><th class="p-3">Item</th><th class="p-3">Buyer</th><th class="p-3">Seller</th><th class="p-3">Price</th><th class="p-3">Status</th><th class="p-3">Actions</th></tr></thead>
          <tbody>
          <?php foreach ($orders as $o): ?>
            <tr class="border-t dark:border-slate-800">
              <td class="p-3 font-mono"><?= h($o['public_id']) ?></td>
              <td class="p-3"><?= h($o['title']) ?></td>
              <td class="p-3"><?= h($o['buyer_name']) ?></td>
              <td class="p-3"><?= h($o['seller_name']) ?><?php if ((float)$o['seller_balance'] < 0): ?><br><span class="text-red-500">bal -$<?= number_format(abs((float)$o['seller_balance']), 2) ?></span><?php endif; ?></td>
              <td class="p-3">$<?= number_format((float)$o['price'], 2) ?></td>
              <td class="p-3"><?= h($o['status']) ?></td>
              <td class="p-3 space-y-1 min-w-[200px]">
                <form method="post" class="flex gap-1">
                  <input type="hidden" name="form" value="order_status">
                  <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
                  <select name="status" class="border dark:border-slate-700 dark:bg-slate-950 rounded px-1">
                    <?php foreach (['pending','completed','cancelled','disputed'] as $st): ?>
                      <option <?= $o['status']===$st?'selected':'' ?>><?= $st ?></option>
                    <?php endforeach; ?>
                  </select>
                  <button class="bg-brand text-white px-2 rounded">Save</button>
                </form>
                <?php if ($o['status'] !== 'cancelled'): ?>
                <form method="post" onsubmit="return confirm('Refund buyer and deduct seller (allows negative / owing)?')">
                  <input type="hidden" name="form" value="owner_refund">
                  <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
                  <button class="bg-red-500 text-white px-2 py-1 rounded text-[10px] font-bold">Refund buyer</button>
                </form>
                <?php endif; ?>
                <a class="text-brand underline text-[10px]" href="?tab=chats&order_id=<?= (int)$o['id'] ?>">View chat</a>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <script>
        async function ownerSearchOrder(){
          const q=(document.getElementById('ownerTxSearch').value||'').trim();
          const box=document.getElementById('ownerTxResult');
          if(!q){box.innerHTML='';return;}
          try{
            const token=localStorage.getItem('acctventa_staff_token')||'';
            if(!token){
              // create via support tab once — fallback fetch staff login not needed; use server-rendered link hint
            }
            const url=new URL('/api/index.php',location.origin);
            url.searchParams.set('action','staff.orders.search');
            url.searchParams.set('q',q);
            const res=await fetch(url,{headers:{'Authorization':'Bearer '+(localStorage.getItem('acctventa_staff_token')||''),'X-Staff-Token':(localStorage.getItem('acctventa_staff_token')||'')}});
            const data=await res.json();
            if(!res.ok||data.ok===false) throw new Error(data.error||'Search failed — open Support tab once to mint staff token, then retry');
            const rows=data.orders||[];
            if(!rows.length){box.innerHTML='<p class="text-slate-500">No matches.</p>';return;}
            box.innerHTML=rows.map(o=>`<div class="border dark:border-slate-700 rounded-lg p-2">
              <p class="font-mono font-bold">${esc(o.public_id)}</p>
              <p>${esc(o.title)} · ${esc(o.status)} · $${Number(o.price).toFixed(2)}</p>
              <p>Buyer: ${esc(o.buyer_name)} (${esc(o.buyer_email)}) · bal $${Number(o.buyer_balance).toFixed(2)}</p>
              <p>Seller: ${esc(o.seller_name)} (${esc(o.seller_email)}) · bal <span class="${Number(o.seller_balance)<0?'text-red-500 font-bold':''}">$${Number(o.seller_balance).toFixed(2)}</span></p>
              <a class="text-brand underline" href="?tab=chats&order_id=${o.id}">Open buyer/seller chat</a>
            </div>`).join('');
          }catch(e){box.innerHTML='<p class="text-red-500">'+esc(e.message)+'</p>';}
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
            <div id="orderChatActions" class="p-2 border-t hidden" style="border-color:var(--av-border)">
              <button type="button" id="orderChatRefundBtn" class="av-send" style="background:#ef4444">Refund buyer (allows seller debt)</button>
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
            if(!confirm('Refund buyer and deduct seller (negative OK)?'))return;
            try{const r=await apiStaff('staff.orders.refund',{method:'POST',body:{orderId:id}});alert('Refunded. Seller balance: $'+Number(r.sellerBalance).toFixed(2)+(r.owing?' (owing $'+Number(r.owing).toFixed(2)+')':''));openOrderChat(id);}catch(e){alert(e.message);}
          };
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
      <div class="av-table-wrap">
        <table class="w-full text-left text-xs">
          <thead><tr><th class="p-3">When</th><th class="p-3">TXID</th><th class="p-3">Buyer</th><th class="p-3">Seller</th><th class="p-3">Reason</th><th class="p-3">Open</th></tr></thead>
          <tbody>
          <?php if (!$reports): ?>
            <tr><td colspan="6" class="p-4 text-slate-400">No seller reports yet.</td></tr>
          <?php endif; ?>
          <?php foreach ($reports as $r): ?>
            <tr class="border-t dark:border-slate-800">
              <td class="p-3"><?= h($r['created_at']) ?></td>
              <td class="p-3 font-mono"><?= h($r['public_id']) ?></td>
              <td class="p-3"><?= h($r['buyer_name']) ?></td>
              <td class="p-3"><?= h($r['seller_name']) ?></td>
              <td class="p-3"><?= h($r['reason']) ?></td>
              <td class="p-3"><a class="text-brand underline" href="?tab=chats&order_id=<?= (int)$r['order_id'] ?>">Chat</a></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'wallet'):
      $pendingWd = db()->query("SELECT t.*, u.email, u.name FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.type='withdrawal' AND t.status='pending' ORDER BY t.created_at ASC")->fetchAll();
      $pendingDep = db()->query("SELECT t.*, u.email, u.name FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.type='deposit' AND t.status='pending' ORDER BY t.created_at ASC")->fetchAll();
      $txs = db()->query('SELECT t.*, u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 200')->fetchAll();
    ?>
      <div class="av-page">
        <div class="av-page-head">
          <div>
            <h2 class="av-page-title">Wallet</h2>
            <p class="av-page-sub">Approve withdrawals, credit crypto deposits, and browse recent transactions.</p>
          </div>
          <div class="av-page-meta">
            <span class="av-chip <?= $pendingWd ? 'is-hot' : '' ?>"><strong><?= count($pendingWd) ?></strong> withdrawals</span>
            <span class="av-chip <?= $pendingDep ? 'is-hot' : '' ?>"><strong><?= count($pendingDep) ?></strong> deposits</span>
          </div>
        </div>
      <div class="av-panel mb-3">
        <div class="av-panel-head">Pending withdrawals</div>
        <div class="av-panel-body">
        <p class="text-xs av-muted mb-3">Rejecting refunds the user’s wallet. Completing marks payout as paid.</p>
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
                <p class="font-mono text-[10px] text-slate-400"><?= h($t['reference'] ?? '') ?></p>
              </div>
              <form method="post" class="space-y-2">
                <input type="hidden" name="form" value="tx_status">
                <input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>">
                <textarea name="note_edit" rows="2" class="w-full border rounded-lg px-2 py-1.5 text-xs" placeholder="Payout note / bank details"><?= h($t['note']) ?></textarea>
                <div class="flex flex-wrap gap-2">
                  <button name="status" value="completed" class="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg">Approve / Paid</button>
                  <button name="status" value="cancelled" class="bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-lg">Reject + refund</button>
                </div>
              </form>
            </div>
          <?php endforeach; ?>
          </div>
        <?php endif; ?>
        </div>
      </div>
      <div class="av-panel mb-3">
        <div class="av-panel-head">Pending deposits</div>
        <div class="av-panel-body">
        <p class="text-xs av-muted mb-3">Crypto deposits show coin, network, and address. Approve only after on-chain confirmation.</p>
        <?php if (!$pendingDep): ?>
          <p class="text-sm">No pending deposits.</p>
        <?php else: ?>
          <div class="space-y-2">
          <?php foreach ($pendingDep as $t):
            $isCrypto = strtolower((string)($t['method'] ?? '')) === 'crypto';
          ?>
            <div class="av-card p-3 space-y-2 <?= $isCrypto ? 'border border-amber-400/50' : '' ?>">
              <div class="text-xs space-y-1">
                <p class="font-bold text-sm"><?= h($t['name']) ?> · <a class="text-brand underline" href="mailto:<?= h($t['email']) ?>"><?= h($t['email']) ?></a></p>
                <p class="text-base font-extrabold text-brand">$<?= number_format((float)$t['amount'], 2) ?> <span class="text-[10px] font-semibold uppercase tracking-wide <?= $isCrypto ? 'text-amber-600' : 'text-slate-500' ?>"><?= h($t['method'] ?: 'deposit') ?></span></p>
                <p class="text-slate-600 dark:text-slate-300 break-all"><?= h($t['note']) ?></p>
                <p class="font-mono text-[10px] text-slate-400">Ref <?= h($t['reference'] ?? '') ?> · <?= h($t['created_at'] ?? '') ?></p>
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
          <?php foreach ($txs as $t): ?>
            <tr class="border-t">
              <td class="p-3"><?= (int)$t['id'] ?></td>
              <td class="p-3"><?= h($t['email']) ?></td>
              <td class="p-3"><?= h($t['type']) ?></td>
              <td class="p-3">$<?= number_format((float)$t['amount'], 2) ?></td>
              <td class="p-3">$<?= number_format((float)$t['fee'], 2) ?></td>
              <td class="p-3"><?= h($t['status']) ?></td>
              <td class="p-3 max-w-[180px] truncate"><?= h($t['note']) ?></td>
              <td class="p-3">
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
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'currencies'): $wc = wallet_currencies_get(); ?>
      <form method="post" class="space-y-4">
        <input type="hidden" name="form" value="currencies">
        <div class="av-card  p-5 space-y-3">
          <h2 class="font-bold text-lg">Deposit & withdraw rates</h2>
          <p class="text-xs text-slate-500">Edit the rate for each country (units per $1). These rates show on user Deposit and Withdraw screens.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-xs text-slate-500 border-b">
                <tr>
                  <th class="py-2 pr-2">Country</th>
                  <th class="py-2 pr-2">Code</th>
                  <th class="py-2 pr-2">1 USD =</th>
                  <th class="py-2 pr-2 text-center">On</th>
                </tr>
              </thead>
              <tbody>
              <?php foreach (($wc['local'] ?? []) as $i => $c): ?>
                <tr class="border-b border-slate-100">
                  <td class="py-3 pr-2">
                    <div class="flex items-center gap-2">
                      <?php if (!empty($c['flag'])): ?>
                        <img src="https://flagcdn.com/w40/<?= h($c['flag']) ?>.png" alt="" class="w-6 h-6 rounded-full object-cover">
                      <?php endif; ?>
                      <input type="hidden" name="local[<?= $i ?>][flag]" value="<?= h($c['flag'] ?? '') ?>">
                      <input type="hidden" name="local[<?= $i ?>][code]" value="<?= h($c['code'] ?? '') ?>">
                      <input name="local[<?= $i ?>][name]" value="<?= h($c['name'] ?? '') ?>" class="border rounded-lg px-2 py-1.5 text-sm w-36 sm:w-44">
                    </div>
                  </td>
                  <td class="py-3 pr-2 font-mono font-bold text-xs"><?= h($c['code'] ?? '') ?></td>
                  <td class="py-3 pr-2">
                    <input name="local[<?= $i ?>][rate]" type="number" step="0.01" min="0.01" value="<?= h((string)($c['rate'] ?? 1)) ?>" class="border rounded-lg px-2 py-1.5 text-sm w-28 font-semibold" required>
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

        <div class="av-card  p-5 space-y-3">
          <h2 class="font-bold text-lg">Crypto options + deposit addresses</h2>
          <p class="text-xs text-slate-500">Add your receiving wallet address for each network. Users only see coins/networks that have an address filled in. Networks are comma-separated (e.g. TRC20, BEP20, ERC20) — save once to refresh address fields for new networks.</p>
          <div class="space-y-4">
              <?php foreach (($wc['crypto'] ?? []) as $i => $c):
                $nets = $c['networks'] ?? [];
                if (!is_array($nets)) $nets = [];
                $addrs = is_array($c['addresses'] ?? null) ? $c['addresses'] : [];
              ?>
                <div class="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3">
                  <div class="flex flex-wrap gap-3 items-end">
                    <div>
                      <p class="text-[10px] uppercase text-slate-500 font-semibold">Coin</p>
                      <p class="font-mono font-bold text-sm"><?= h($c['code'] ?? '') ?></p>
                      <input type="hidden" name="crypto[<?= $i ?>][code]" value="<?= h($c['code'] ?? '') ?>">
                    </div>
                    <div>
                      <label class="text-[10px] uppercase text-slate-500 font-semibold">Name</label>
                      <input name="crypto[<?= $i ?>][name]" value="<?= h($c['name'] ?? '') ?>" class="block border rounded-lg px-2 py-1.5 text-sm w-32">
                    </div>
                    <div class="flex-1 min-w-[180px]">
                      <label class="text-[10px] uppercase text-slate-500 font-semibold">Networks</label>
                      <input name="crypto[<?= $i ?>][networks]" value="<?= h(implode(', ', $nets)) ?>" class="block border rounded-lg px-2 py-1.5 text-sm w-full" placeholder="TRC20, BEP20, ERC20">
                    </div>
                    <label class="text-xs flex items-center gap-1 pb-2">
                      <input type="checkbox" name="crypto[<?= $i ?>][enabled]" value="1" class="accent-sky-500 w-4 h-4" <?= !empty($c['enabled']) ? 'checked' : '' ?>>
                      Enabled
                    </label>
                  </div>
                  <div class="grid sm:grid-cols-2 gap-2">
                    <?php if (!$nets): ?>
                      <p class="text-[11px] text-amber-600">Add at least one network, then Save rates to enter addresses.</p>
                    <?php endif; ?>
                    <?php foreach ($nets as $net):
                      $nk = strtoupper(trim((string)$net));
                      if ($nk === '') continue;
                      $addrVal = (string)($addrs[$nk] ?? '');
                    ?>
                      <div>
                        <label class="text-[10px] font-semibold text-slate-500"><?= h($nk) ?> deposit address</label>
                        <input name="crypto[<?= $i ?>][addr][<?= h($nk) ?>]" value="<?= h($addrVal) ?>" placeholder="Paste your <?= h($nk) ?> wallet address" class="mt-0.5 w-full border rounded-lg px-2 py-1.5 text-xs font-mono <?= $addrVal === '' ? 'border-amber-400' : '' ?>">
                        <?php if ($addrVal === ''): ?>
                          <p class="text-[10px] text-amber-600 mt-0.5">Empty — users cannot deposit this network until you add an address.</p>
                        <?php endif; ?>
                      </div>
                    <?php endforeach; ?>
                  </div>
                </div>
              <?php endforeach; ?>
          </div>
        </div>

        <button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save rates</button>
      </form>
    <?php endif; ?>

    <?php if ($tab === 'gateways'): ?>
      <?php
        $fxRate = (float)setting_get('usd_ngn_rate', '1600');
        $fxCur = setting_get('payment_currency', 'NGN');
      ?>
      <form method="post" class="av-info p-5 space-y-3 mb-4">
        <input type="hidden" name="form" value="fx_rate">
        <h2 class="font-bold text-lg text-slate-900">Quick Naira rate</h2>
        <p class="text-xs text-slate-600">Wallet stays in <strong>USD ($)</strong>. For all country rates use <a href="?tab=currencies" class="text-brand font-semibold underline">Currencies</a>.</p>
        <div class="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label class="text-xs text-slate-500 font-medium">Charge currency</label>
            <select name="payment_currency" class="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">
              <option value="NGN" <?= $fxCur==='NGN'?'selected':'' ?>>NGN (Naira)</option>
              <option value="USD" <?= $fxCur==='USD'?'selected':'' ?>>USD (no convert)</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-500 font-medium">1 USD = how many ₦?</label>
            <input name="usd_ngn_rate" type="number" min="1" step="1" value="<?= h((string)$fxRate) ?>" class="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white font-semibold" required>
          </div>
          <button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save Naira rate</button>
        </div>
        <p class="text-[11px] text-slate-500">Example at ₦<?= number_format($fxRate) ?>: deposit <strong>$3.00</strong> → customer pays about <strong>₦<?= number_format(3 * $fxRate) ?></strong>.</p>
      </form>

      <form method="post" class="av-card  p-5 space-y-4">
        <input type="hidden" name="form" value="gateway">
        <h2 class="font-bold text-lg">Payment gateways</h2>
        <div class="grid md:grid-cols-2 gap-4">
          <div class="border rounded-xl p-4 space-y-2">
            <h3 class="font-semibold">Deposit</h3>
            <select name="deposit_provider" class="w-full border rounded-xl px-3 py-2 text-sm">
              <?php foreach (['none','paystack','flutterwave','stripe','nowpayments'] as $p): ?>
                <option value="<?= $p ?>" <?= ($gw['deposit_provider']??'')===$p?'selected':'' ?>><?= $p ?></option>
              <?php endforeach; ?>
            </select>
            <label class="text-sm flex gap-2 items-center"><input type="checkbox" name="deposit_enabled" <?= !empty($gw['deposit_enabled'])?'checked':'' ?>> Enabled</label>
            <input name="deposit_public_key" value="<?= h($gw['deposit_public_key']??'') ?>" placeholder="Flutterwave Public Key (FLWPUBK_...)" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="deposit_secret_key" value="<?= h($gw['deposit_secret_key']??'') ?>" placeholder="Flutterwave Secret Key (FLWSECK_...) — required" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="deposit_webhook" value="<?= h($gw['deposit_webhook']??'') ?>" placeholder="https://acctventa.com/api/index.php?action=webhook.flutterwave" class="w-full border rounded-xl px-3 py-2 text-sm">
            <textarea name="deposit_notes" class="w-full border rounded-xl px-3 py-2 text-sm" rows="2" placeholder="Optional notes / encryption key"><?= h($gw['deposit_notes']??'') ?></textarea>
            <p class="text-[11px] text-slate-500">Use <strong>Settings → API Keys</strong> in Flutterwave (keys starting with FLWPUBK_ / FLWSECK_), not only V4 Client ID. Set webhook URL in Flutterwave to the same webhook above.</p>
          </div>
          <div class="border rounded-xl p-4 space-y-2">
            <h3 class="font-semibold">Withdraw / payout</h3>
            <select name="withdraw_provider" class="w-full border rounded-xl px-3 py-2 text-sm">
              <?php foreach (['none','paystack','flutterwave','stripe','nowpayments','manual'] as $p): ?>
                <option value="<?= $p ?>" <?= ($gw['withdraw_provider']??'')===$p?'selected':'' ?>><?= $p ?></option>
              <?php endforeach; ?>
            </select>
            <label class="text-sm flex gap-2 items-center"><input type="checkbox" name="withdraw_enabled" <?= !empty($gw['withdraw_enabled'])?'checked':'' ?>> Enabled</label>
            <input name="withdraw_public_key" value="<?= h($gw['withdraw_public_key']??'') ?>" placeholder="Public key" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="withdraw_secret_key" value="<?= h($gw['withdraw_secret_key']??'') ?>" placeholder="Secret key" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="withdraw_webhook" value="<?= h($gw['withdraw_webhook']??'') ?>" placeholder="Webhook URL" class="w-full border rounded-xl px-3 py-2 text-sm">
            <textarea name="withdraw_notes" class="w-full border rounded-xl px-3 py-2 text-sm" rows="2" placeholder="Notes"><?= h($gw['withdraw_notes']??'') ?></textarea>
          </div>
        </div>
        <button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save gateways</button>
      </form>
    <?php endif; ?>

    <?php if ($tab === 'settings'): ?>
      <form method="post" class="av-card  p-5 grid sm:grid-cols-2 gap-4">
        <input type="hidden" name="form" value="settings">
        <h2 class="font-bold text-lg sm:col-span-2">Platform fees & support</h2>
        <div class="sm:col-span-2 av-info p-4 grid sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <h3 class="font-bold text-sm text-slate-800">₦ Naira rate</h3>
            <p class="text-[11px] text-slate-500">Same control as Gateways tab. Changes apply to the next Flutterwave deposit.</p>
          </div>
          <div>
            <label class="text-xs text-slate-500">Flutterwave charge currency</label>
            <select name="payment_currency" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm bg-white">
              <?php $pc = setting_get('payment_currency', 'NGN'); ?>
              <option value="NGN" <?= $pc==='NGN'?'selected':'' ?>>NGN (Naira) — recommended</option>
              <option value="USD" <?= $pc==='USD'?'selected':'' ?>>USD</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-500">USD → NGN rate (e.g. 1600)</label>
            <input name="usd_ngn_rate" type="number" step="1" min="1" value="<?= h(setting_get('usd_ngn_rate','1600')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm bg-white">
            <p class="text-[11px] text-slate-400 mt-1">$3 deposit → ₦(3 × rate) on Flutterwave.</p>
          </div>
        </div>
        <div><label class="text-xs text-slate-500">Min deposit ($)</label><input name="min_deposit" type="number" step="0.01" value="<?= h(setting_get('min_deposit',3)) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Min withdraw ($)</label><input name="min_withdraw" type="number" step="0.01" value="<?= h(setting_get('min_withdraw',5)) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Sales commission (%)</label><input name="sales_commission" type="number" step="0.1" value="<?= h(((float)setting_get('sales_commission_rate',0.22))*100) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm" title="Deducted from every successful sale; seller receives the remainder as withdrawable balance"></div>
        <div><label class="text-xs text-slate-500">Withdraw commission (%)</label><input name="withdraw_commission" type="number" step="0.1" value="<?= h(((float)setting_get('withdraw_commission_rate',0.1))*100) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Deposit fee (%)</label><input name="deposit_fee" type="number" step="0.1" value="<?= h(((float)setting_get('deposit_fee_rate',0))*100) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Referral reward ($)</label><input name="referral_reward" type="number" step="0.01" value="<?= h(setting_get('referral_reward_amount',5)) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Referral min deposit ($)</label><input name="referral_min_deposit" type="number" step="0.01" value="<?= h(setting_get('referral_min_deposit',50)) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Support Telegram</label><input name="support_telegram" value="<?= h(setting_get('support_telegram','https://t.me/acctventa')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Support email</label><input name="support_email" value="<?= h(setting_get('support_email','support@acctventa.com')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div class="sm:col-span-2"><button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save settings</button></div>
      </form>
      <form method="post" class="av-card p-5 mt-4 space-y-4 max-w-xl">
        <input type="hidden" name="form" value="owner_password">
        <h2 class="font-bold text-lg">Owner password</h2>
        <p class="text-xs av-muted">Saved on the server — works for Owner Admin and Website Admin on any device.</p>
        <div>
          <label class="text-xs text-slate-500">Current password</label>
          <input name="current_password" type="password" autocomplete="current-password" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-sm" required>
        </div>
        <div>
          <label class="text-xs text-slate-500">New password</label>
          <input name="new_password" type="password" autocomplete="new-password" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-sm" required minlength="6">
        </div>
        <div>
          <label class="text-xs text-slate-500">Confirm new password</label>
          <input name="confirm_password" type="password" autocomplete="new-password" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-sm" required minlength="6">
        </div>
        <button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Update password</button>
      </form>
    <?php endif; ?>

    <?php if ($tab === 'plans'): $plans = db()->query('SELECT * FROM plans ORDER BY price ASC')->fetchAll(); ?>
      <p class="text-xs av-muted mb-3">Daily upload limits shown on Packages &amp; Pricing come from here. Paid plan upgrades charge via <strong>Flutterwave</strong> (same keys as Gateways → deposits) or from the user’s wallet balance.</p>
      <div class="space-y-3">
        <?php foreach ($plans as $p): ?>
          <form method="post" class="bg-white border rounded-xl p-4 grid sm:grid-cols-5 gap-3 items-end">
            <input type="hidden" name="form" value="plan">
            <input type="hidden" name="plan_id" value="<?= h($p['id']) ?>">
            <div class="sm:col-span-1"><p class="font-semibold"><?= h($p['id']) ?></p></div>
            <div><label class="text-xs">Name</label><input name="name" value="<?= h($p['name']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"></div>
            <div><label class="text-xs">Price</label><input name="price" type="number" step="0.01" value="<?= h($p['price']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"></div>
            <div><label class="text-xs">Daily uploads</label><input name="daily_uploads" type="number" value="<?= h($p['daily_uploads']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"></div>
            <div><label class="text-xs">Approval label</label><input name="approval_label" value="<?= h($p['approval_label']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"><button class="mt-2 w-full bg-brand text-white rounded-lg py-2 text-xs font-bold">Save</button></div>
          </form>
        <?php endforeach; ?>
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
