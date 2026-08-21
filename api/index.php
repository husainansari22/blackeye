<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$body = read_json_body();
if (!$action && isset($body['action'])) $action = (string)$body['action'];

try {
    switch ($action) {
        case 'health':
            json_out(['ok' => true, 'installed' => setting_get('installed') === '1', 'app' => app_config()['app_name'] ?? 'Acctventa']);

        case 'config.public':
            migrate_legacy_support_email();
            json_out([
                'ok' => true,
                'config' => [
                    'minDeposit' => (float)setting_get('min_deposit', app_config()['min_deposit']),
                    'minWithdraw' => (float)setting_get('min_withdraw', app_config()['min_withdraw']),
                    'withdrawCommissionRate' => (float)setting_get('withdraw_commission_rate', app_config()['withdraw_commission_rate']),
                    'depositFeeRate' => (float)setting_get('deposit_fee_rate', app_config()['deposit_fee_rate']),
                    'supportTelegram' => setting_get('support_telegram', app_config()['support_telegram']),
                    'supportEmail' => setting_get('support_email', app_config()['support_email'] ?? 'support@acctventa.com'),
                    'paymentCurrency' => setting_get('payment_currency', app_config()['payment_currency'] ?? 'NGN'),
                    'usdNgnRate' => (float)setting_get('usd_ngn_rate', app_config()['usd_ngn_rate'] ?? 1600),
                    'walletCurrencies' => wallet_currencies_get(),
                ],
                'plans' => db()->query('SELECT id, name, price, daily_uploads AS dailyUploads, approval_label AS approval FROM plans WHERE is_active = 1')->fetchAll(),
            ]);

        case 'auth.register': {
            $name = trim((string)($body['name'] ?? ''));
            $email = strtolower(trim((string)($body['email'] ?? '')));
            $phone = trim((string)($body['phone'] ?? ''));
            $password = (string)($body['password'] ?? '');
            $ref = trim((string)($body['referredBy'] ?? $body['ref'] ?? ''));
            $countryCode = strtolower(trim((string)($body['countryCode'] ?? $body['country_code'] ?? '')));
            if (strlen($countryCode) > 8) $countryCode = substr($countryCode, 0, 8);
            if ($name === '' || $email === '' || $password === '') json_out(['ok' => false, 'error' => 'Name, email and password required'], 422);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['ok' => false, 'error' => 'Invalid email'], 422);
            $exists = db()->prepare('SELECT id FROM users WHERE email = ?');
            $exists->execute([$email]);
            if ($exists->fetch()) json_out(['ok' => false, 'error' => 'Email already registered'], 409);
            ensure_user_payout_columns();
            $code = strtolower(preg_replace('/[^a-z0-9]/', '', explode(' ', $name)[0] ?? 'user')) ?: ('user' . substr(uid_token(3), 0, 6));
            $stmt = db()->prepare('INSERT INTO users (name, email, phone, country_code, password_hash, referral_code, referred_by, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$name, $email, $phone, $countryCode, password_hash($password, PASSWORD_DEFAULT), $code, $ref, 'free']);
            $id = (int)db()->lastInsertId();
            $token = create_session($id);
            $u = db()->query('SELECT * FROM users WHERE id = ' . $id)->fetch();
            try {
                $mail = email_welcome($name);
                send_app_mail($email, $mail['subject'], $mail['html'], $mail['text']);
            } catch (Throwable $e) {
                // registration still succeeds if mail fails
            }
            json_out(['ok' => true, 'token' => $token, 'user' => public_user($u)]);
        }

        case 'auth.forgot': {
            $email = strtolower(trim((string)($body['email'] ?? '')));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                json_out(['ok' => false, 'error' => 'Enter a valid email address', 'code' => 'invalid_email'], 422);
            }
            $stmt = db()->prepare('SELECT * FROM users WHERE email = ? AND is_banned = 0 LIMIT 1');
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) {
                json_out([
                    'ok' => false,
                    'error' => 'User does not exist',
                    'code' => 'user_not_found',
                    'message' => 'No account found with that email. Create an account to continue.',
                ], 404);
            }
            ensure_password_resets_table();
            $raw = uid_token(24);
            $hash = hash('sha256', $raw);
            db()->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')->execute([(int)$u['id']]);
            db()->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))')
                ->execute([(int)$u['id'], $hash]);
            $resetUrl = rtrim(app_config()['app_url'] ?? 'https://acctventa.com', '/') . '/reset.html?token=' . urlencode($raw);
            $mail = email_password_reset($u['name'], $resetUrl);
            $sent = send_app_mail($email, $mail['subject'], $mail['html'], $mail['text']);
            if (!$sent) {
                json_out(['ok' => false, 'error' => 'Could not send email right now. Create mailbox support@acctventa.com in Hostinger and try again.'], 500);
            }
            json_out([
                'ok' => true,
                'message' => 'Reset link sent. Check your inbox and spam folder.',
            ]);
        }

        case 'auth.reset': {
            $token = trim((string)($body['token'] ?? ''));
            $password = (string)($body['password'] ?? '');
            if ($token === '' || strlen($password) < 6) {
                json_out(['ok' => false, 'error' => 'Password must be at least 6 characters'], 422);
            }
            ensure_password_resets_table();
            $hash = hash('sha256', $token);
            $stmt = db()->prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1');
            $stmt->execute([$hash]);
            $row = $stmt->fetch();
            if (!$row) json_out(['ok' => false, 'error' => 'This reset link is invalid or has expired. Request a new one.'], 400);
            $pdo = db();
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), (int)$row['user_id']]);
            $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?')->execute([(int)$row['id']]);
            $u = $pdo->query('SELECT * FROM users WHERE id = ' . (int)$row['user_id'])->fetch();
            try {
                $mail = email_password_changed($u['name'] ?? '');
                send_app_mail($u['email'], $mail['subject'], $mail['html'], $mail['text']);
            } catch (Throwable $e) {}
            json_out(['ok' => true, 'message' => 'Password updated. You can sign in now.']);
        }

        case 'auth.profile': {
            $u = require_user();
            $name = trim((string)($body['name'] ?? $u['name']));
            $phone = trim((string)($body['phone'] ?? $u['phone']));
            if ($name === '') json_out(['ok' => false, 'error' => 'Name is required'], 422);
            db()->prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')->execute([$name, $phone, (int)$u['id']]);
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out(['ok' => true, 'user' => public_user($fresh)]);
        }

        case 'auth.changePassword': {
            $u = require_user();
            $current = (string)($body['currentPassword'] ?? '');
            $next = (string)($body['newPassword'] ?? '');
            if (!password_verify($current, $u['password_hash'])) json_out(['ok' => false, 'error' => 'Current password is incorrect'], 400);
            if (strlen($next) < 6) json_out(['ok' => false, 'error' => 'New password must be at least 6 characters'], 422);
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($next, PASSWORD_DEFAULT), (int)$u['id']]);
            try {
                $mail = email_password_changed($u['name']);
                send_app_mail($u['email'], $mail['subject'], $mail['html'], $mail['text']);
            } catch (Throwable $e) {}
            json_out(['ok' => true]);
        }

        case 'auth.login': {
            $email = strtolower(trim((string)($body['email'] ?? '')));
            $password = (string)($body['password'] ?? '');
            $stmt = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) {
                json_out(['ok' => false, 'error' => 'User does not exist', 'code' => 'user_not_found'], 404);
            }
            if (!password_verify($password, $u['password_hash'])) {
                json_out(['ok' => false, 'error' => 'Invalid email or password', 'code' => 'invalid_credentials'], 401);
            }
            if ((int)$u['is_banned'] === 1) json_out(['ok' => false, 'error' => 'Account banned', 'code' => 'banned'], 403);
            $token = create_session((int)$u['id']);
            json_out(['ok' => true, 'token' => $token, 'user' => public_user($u)]);
        }

        case 'auth.me': {
            $u = require_user();
            $plan = plan_limits($u['plan']);
            json_out([
                'ok' => true,
                'user' => public_user($u),
                'uploadsToday' => uploads_today((int)$u['id']),
                'dailyLimit' => (int)$plan['daily_uploads'],
            ]);
        }

        case 'auth.logout': {
            destroy_session(bearer_token());
            json_out(['ok' => true]);
        }

        case 'market.list': {
            $rows = db()->query("SELECT a.id, a.title, a.description, a.category, a.price, a.preview_link AS previewLink, a.release_type AS releaseType, a.stock,
                u.name AS sellerName, u.email AS sellerEmail, u.is_verified AS sellerVerified
                FROM ads a JOIN users u ON u.id = a.seller_id
                WHERE a.status = 'active' AND a.stock > 0 AND u.is_banned = 0
                ORDER BY a.created_at DESC LIMIT 200")->fetchAll();
            json_out(['ok' => true, 'listings' => $rows]);
        }

        case 'ads.mine': {
            $u = require_user();
            $stmt = db()->prepare('SELECT * FROM ads WHERE seller_id = ? ORDER BY created_at DESC');
            $stmt->execute([(int)$u['id']]);
            json_out(['ok' => true, 'ads' => $stmt->fetchAll()]);
        }

        case 'ads.create': {
            $u = require_user();
            $plan = plan_limits($u['plan']);
            $used = uploads_today((int)$u['id']);
            if ($used >= (int)$plan['daily_uploads']) {
                json_out(['ok' => false, 'error' => 'Daily upload limit reached. Upgrade your plan.'], 429);
            }
            $ad = [
                'category' => trim((string)($body['category'] ?? '')),
                'title' => trim((string)($body['title'] ?? '')),
                'description' => trim((string)($body['description'] ?? '')),
                'price' => (float)($body['price'] ?? 0),
                'release_type' => (($body['releaseType'] ?? 'auto') === 'manual') ? 'manual' : 'auto',
                'username' => trim((string)($body['username'] ?? '')),
                'password' => (string)($body['password'] ?? ''),
                'preview_link' => trim((string)($body['previewLink'] ?? '')),
                'attached_email' => trim((string)($body['attachedEmail'] ?? '')),
                'attached_email_password' => (string)($body['attachedEmailPassword'] ?? ''),
                'two_fa' => trim((string)($body['twoFA'] ?? '')),
                'extra_info' => trim((string)($body['extraInfo'] ?? '')),
            ];
            if ($ad['category'] === '' || $ad['title'] === '' || $ad['username'] === '' || $ad['password'] === '' || $ad['price'] <= 0) {
                json_out(['ok' => false, 'error' => 'Missing required listing fields'], 422);
            }
            $review = ai_review_listing($ad);
            $stmt = db()->prepare('INSERT INTO ads
                (seller_id, category, title, description, price, release_type, username, password_plain, preview_link, attached_email, attached_email_password, two_fa, extra_info, status, deny_reason, reviewed_by, reviewed_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            $stmt->execute([
                (int)$u['id'], $ad['category'], $ad['title'], $ad['description'], money_f($ad['price']), $ad['release_type'],
                $ad['username'], $ad['password'], $ad['preview_link'], $ad['attached_email'], $ad['attached_email_password'],
                $ad['two_fa'], $ad['extra_info'], $review['status'] === 'active' ? 'pending' : 'pending', '',
                '', null
            ]);
            // Always start pending, then apply AI result immediately (under review → active/denied)
            $adId = (int)db()->lastInsertId();
            bump_upload((int)$u['id']);
            $upd = db()->prepare('UPDATE ads SET status = ?, deny_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?');
            $upd->execute([$review['status'], $review['reason'], $review['reviewed_by'], $adId]);
            notify_user((int)$u['id'], $review['status'] === 'active' ? 'Ad Approved' : 'Ad Denied', $review['status'] === 'active' ? 'Your listing is live.' : $review['reason'], 'ad_review');
            $row = db()->query('SELECT * FROM ads WHERE id = ' . $adId)->fetch();
            json_out(['ok' => true, 'ad' => $row, 'ai' => $review]);
        }

        case 'orders.mine': {
            $u = require_user();
            $stmt = db()->prepare('SELECT o.*,
                CASE WHEN o.buyer_id = ? THEN \'buyer\' ELSE \'seller\' END AS role,
                b.name AS buyerName, s.name AS sellerName
                FROM orders o
                JOIN users b ON b.id = o.buyer_id
                JOIN users s ON s.id = o.seller_id
                WHERE o.buyer_id = ? OR o.seller_id = ?
                ORDER BY o.created_at DESC');
            $stmt->execute([(int)$u['id'], (int)$u['id'], (int)$u['id']]);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                $r['credentials'] = $r['credentials_json'] ? json_decode($r['credentials_json'], true) : null;
                unset($r['credentials_json']);
            }
            json_out(['ok' => true, 'orders' => $rows]);
        }

        case 'orders.create':
        case 'orders.buy': {
            $u = require_user();
            $listingId = (int)($body['listingId'] ?? $body['id'] ?? 0);
            $stmt = db()->prepare("SELECT a.*, u.email AS seller_email, u.name AS seller_name FROM ads a JOIN users u ON u.id = a.seller_id WHERE a.id = ? AND a.status = 'active' AND a.stock > 0 LIMIT 1");
            $stmt->execute([$listingId]);
            $ad = $stmt->fetch();
            if (!$ad) json_out(['ok' => false, 'error' => 'Listing unavailable'], 404);
            if ((int)$ad['seller_id'] === (int)$u['id']) json_out(['ok' => false, 'error' => 'Cannot buy your own listing'], 400);
            $price = (float)$ad['price'];
            if ((float)$u['balance'] < $price) json_out(['ok' => false, 'error' => 'Insufficient balance'], 400);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $pdo->prepare('UPDATE users SET balance = balance - ? WHERE id = ?')->execute([money_f($price), (int)$u['id']]);
                $creds = json_encode([
                    'username' => $ad['username'],
                    'password' => $ad['password_plain'],
                    'previewLink' => $ad['preview_link'],
                    'attachedEmail' => $ad['attached_email'],
                    'attachedEmailPassword' => $ad['attached_email_password'],
                    'twoFA' => $ad['two_fa'],
                    'extraInfo' => $ad['extra_info'],
                ]);
                $status = $ad['release_type'] === 'manual' ? 'pending' : 'completed';
                $publicId = substr(uid_token(8), 0, 12);
                $pdo->prepare('INSERT INTO orders (public_id, listing_id, buyer_id, seller_id, title, category, price, status, credentials_json, completed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([
                    $publicId, $listingId, (int)$u['id'], (int)$ad['seller_id'], $ad['title'], $ad['category'], money_f($price), $status, $creds,
                    $status === 'completed' ? date('Y-m-d H:i:s') : null
                ]);
                $orderId = (int)$pdo->lastInsertId();
                if ($status === 'completed') {
                    $pdo->prepare('UPDATE users SET balance = balance + ? WHERE id = ?')->execute([money_f($price), (int)$ad['seller_id']]);
                } else {
                    $pdo->prepare('UPDATE users SET escrow_balance = escrow_balance + ? WHERE id = ?')->execute([money_f($price), (int)$ad['seller_id']]);
                }
                $pdo->prepare('UPDATE ads SET stock = stock - 1, status = IF(stock - 1 <= 0, \'removed\', status) WHERE id = ?')->execute([$listingId]);
                $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'purchase\', ?, \'completed\', ?)')
                    ->execute([(int)$u['id'], money_f($price), 'Bought #' . $publicId]);
                if ($status === 'completed') {
                    $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'sale\', ?, \'completed\', ?)')
                        ->execute([(int)$ad['seller_id'], money_f($price), 'Sold #' . $publicId]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            notify_user((int)$u['id'], 'Order placed', 'You purchased ' . $ad['title'], 'order');
            notify_user((int)$ad['seller_id'], 'New sale', $u['name'] . ' purchased ' . $ad['title'], 'order');
            try {
                $buyerMail = email_order_notice($u['name'], $ad['title'], 'buyer', money_f($price));
                send_app_mail($u['email'], $buyerMail['subject'], $buyerMail['html'], $buyerMail['text']);
                $sellerMail = email_order_notice($ad['seller_name'], $ad['title'], 'seller', money_f($price));
                send_app_mail($ad['seller_email'], $sellerMail['subject'], $sellerMail['html'], $sellerMail['text']);
            } catch (Throwable $e) {}
            json_out(['ok' => true, 'orderId' => $orderId, 'publicId' => $publicId, 'status' => $status]);
        }

        case 'orders.refund': {
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND seller_id = ? LIMIT 1');
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            if ($o['status'] === 'cancelled') json_out(['ok' => false, 'error' => 'Already cancelled'], 400);
            $price = (float)$o['price'];
            $pdo = db();
            $pdo->beginTransaction();
            try {
                if ($o['status'] === 'pending') {
                    $pdo->prepare('UPDATE users SET escrow_balance = GREATEST(0, escrow_balance - ?) WHERE id = ?')->execute([money_f($price), (int)$u['id']]);
                } else {
                    $chk = $pdo->prepare('SELECT balance FROM users WHERE id = ? FOR UPDATE');
                    $chk->execute([(int)$u['id']]);
                    $bal = (float)$chk->fetch()['balance'];
                    if ($bal < $price) throw new RuntimeException('Insufficient seller balance to refund');
                    $pdo->prepare('UPDATE users SET balance = balance - ? WHERE id = ?')->execute([money_f($price), (int)$u['id']]);
                }
                $pdo->prepare('UPDATE users SET balance = balance + ? WHERE id = ?')->execute([money_f($price), (int)$o['buyer_id']]);
                $pdo->prepare('UPDATE orders SET status = \'cancelled\', refunded_at = NOW() WHERE id = ?')->execute([$orderId]);
                $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'refund\', ?, \'completed\', ?)')
                    ->execute([(int)$o['buyer_id'], money_f($price), 'Refund order #' . $o['public_id']]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                json_out(['ok' => false, 'error' => $e->getMessage()], 400);
            }
            notify_user((int)$o['buyer_id'], 'Refund received', 'Order ' . $o['title'] . ' was refunded', 'refund');
            json_out(['ok' => true]);
        }

        case 'orders.release': {
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND seller_id = ? AND status = \'pending\' LIMIT 1');
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Pending order not found'], 404);
            $price = (float)$o['price'];
            $pdo = db();
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE users SET escrow_balance = GREATEST(0, escrow_balance - ?), balance = balance + ? WHERE id = ?')
                ->execute([money_f($price), money_f($price), (int)$u['id']]);
            $pdo->prepare('UPDATE orders SET status = \'completed\', completed_at = NOW() WHERE id = ?')->execute([$orderId]);
            $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'sale\', ?, \'completed\', ?)')
                ->execute([(int)$u['id'], money_f($price), 'Released #' . $o['public_id']]);
            $pdo->commit();
            json_out(['ok' => true]);
        }

        case 'messages.list': {
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? $_GET['orderId'] ?? $_GET['order_id'] ?? 0);
            $chk = db()->prepare('SELECT id FROM orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?)');
            $chk->execute([$orderId, (int)$u['id'], (int)$u['id']]);
            if (!$chk->fetch()) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            $stmt = db()->prepare('SELECT m.*, u.name AS fromName, u.email AS fromEmail FROM messages m JOIN users u ON u.id = m.sender_id WHERE order_id = ? ORDER BY m.created_at ASC');
            $stmt->execute([$orderId]);
            json_out(['ok' => true, 'messages' => $stmt->fetchAll()]);
        }

        case 'messages.send': {
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $text = trim((string)($body['text'] ?? ''));
            if ($text === '') json_out(['ok' => false, 'error' => 'Empty message'], 422);
            $chk = db()->prepare('SELECT * FROM orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?)');
            $chk->execute([$orderId, (int)$u['id'], (int)$u['id']]);
            $o = $chk->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            db()->prepare('INSERT INTO messages (order_id, sender_id, body) VALUES (?, ?, ?)')->execute([$orderId, (int)$u['id'], $text]);
            $other = ((int)$o['buyer_id'] === (int)$u['id']) ? (int)$o['seller_id'] : (int)$o['buyer_id'];
            notify_user($other, 'New message', $u['name'] . ': ' . mb_substr($text, 0, 80), 'message');
            json_out(['ok' => true]);
        }

        case 'wallet.summary': {
            $u = require_user();
            $stmt = db()->prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
            $stmt->execute([(int)$u['id']]);
            json_out(['ok' => true, 'user' => public_user($u), 'transactions' => $stmt->fetchAll()]);
        }

        case 'wallet.deposit': {
            $u = require_user();
            $amount = (float)($body['amount'] ?? 0);
            $min = (float)setting_get('min_deposit', 3);
            if ($amount < $min) json_out(['ok' => false, 'error' => "Minimum deposit is $$min"], 422);
            $feeRate = (float)setting_get('deposit_fee_rate', 0);
            $fee = round($amount * $feeRate, 2);
            $credited = round($amount - $fee, 2);
            $channel = strtolower(trim((string)($body['channel'] ?? 'local')));
            $prefer = strtoupper(trim((string)($body['currency'] ?? 'NGN')));

            // Crypto deposits: create pending request for owner/admin to credit after confirming on-chain
            if ($channel === 'crypto') {
                ensure_tx_reference_column();
                $txRef = 'AVC' . strtoupper(substr(uid_token(8), 0, 16));
                $coin = $prefer !== '' ? $prefer : 'USDT';
                $note = 'Crypto deposit pending · ' . $coin . ' · await owner credit';
                db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, status, method, note, reference) VALUES (?, \'deposit\', ?, ?, \'pending\', \'crypto\', ?, ?)')
                    ->execute([(int)$u['id'], money_f($credited), money_f($fee), $note, $txRef]);
                notify_user((int)$u['id'], 'Crypto deposit submitted', 'Your $' . money_f($credited) . ' ' . $coin . ' deposit is pending confirmation.', 'wallet');
                json_out([
                    'ok' => true,
                    'pending' => true,
                    'reference' => $txRef,
                    'amount' => $amount,
                    'credited' => $credited,
                    'message' => 'Crypto deposit submitted. Owner will credit your wallet after confirming payment.',
                ]);
            }

            if (!flw_deposit_enabled()) {
                json_out([
                    'ok' => false,
                    'error' => 'Live deposits are not enabled. In Owner Admin → Gateways, set provider to flutterwave, enable it, and paste your FLWSECK secret key.',
                    'code' => 'gateway_disabled',
                ], 503);
            }

            ensure_tx_reference_column();
            $txRef = 'AVD' . strtoupper(substr(uid_token(8), 0, 16));
            $checkout = flw_create_checkout($u, $amount, $txRef, $prefer ?: 'NGN');
            if (!$checkout['ok']) {
                json_out(['ok' => false, 'error' => $checkout['error'] ?? 'Could not start payment'], 502);
            }
            $charge = $checkout['charge'];
            $note = sprintf('Awaiting Flutterwave · charge=%s%s|usd=%s|rate=%s', $charge['amount'], $charge['currency'], money_f($amount), $charge['rate']);
            db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, status, method, note, reference) VALUES (?, \'deposit\', ?, ?, \'pending\', \'flutterwave\', ?, ?)')
                ->execute([(int)$u['id'], money_f($credited), money_f($fee), $note, $txRef]);

            json_out([
                'ok' => true,
                'checkout' => true,
                'paymentLink' => $checkout['link'],
                'reference' => $txRef,
                'amount' => $amount,
                'credited' => $credited,
                'payAmount' => $charge['amount'],
                'payCurrency' => $charge['currency'],
                'rate' => $charge['rate'],
            ]);
        }

        case 'wallet.deposit.confirm': {
            $u = require_user();
            $txRef = trim((string)($body['tx_ref'] ?? $body['reference'] ?? $_GET['tx_ref'] ?? ''));
            $transactionId = $body['transaction_id'] ?? $_GET['transaction_id'] ?? null;
            if ($txRef === '' && !$transactionId) {
                json_out(['ok' => false, 'error' => 'Missing payment reference'], 422);
            }
            $verified = null;
            if ($transactionId) {
                $verified = flw_verify_by_id($transactionId);
            }
            if ((!$verified || !$verified['ok']) && $txRef !== '') {
                $verified = flw_verify_by_tx_ref($txRef);
            }
            if (!$verified || !$verified['ok']) {
                json_out(['ok' => false, 'error' => $verified['error'] ?? 'Payment not confirmed yet'], 400);
            }
            $data = $verified['data'];
            $ref = (string)($data['tx_ref'] ?? $txRef);
            $paid = (float)($data['amount'] ?? 0);
            $flwId = (string)($data['id'] ?? $transactionId ?? '');
            $paidCurrency = strtoupper((string)($data['currency'] ?? ''));
            // Ensure this pending deposit belongs to current user
            ensure_tx_reference_column();
            $chk = db()->prepare('SELECT * FROM transactions WHERE reference = ? AND user_id = ? LIMIT 1');
            $chk->execute([$ref, (int)$u['id']]);
            if (!$chk->fetch()) {
                json_out(['ok' => false, 'error' => 'Deposit not found for this account'], 404);
            }
            $credit = credit_deposit_from_gateway($ref, $paid, $flwId, $paidCurrency);
            if (!$credit['ok']) json_out($credit, 400);
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out(['ok' => true, 'credited' => $credit['credited'] ?? null, 'already' => !empty($credit['already']), 'user' => public_user($fresh)]);
        }

        case 'webhook.flutterwave': {
            $payload = $body ?: read_json_body();
            $event = $payload['event'] ?? '';
            $data = $payload['data'] ?? [];
            if ($event === 'charge.completed' && ($data['status'] ?? '') === 'successful') {
                $ref = (string)($data['tx_ref'] ?? '');
                $paid = (float)($data['amount'] ?? 0);
                $flwId = (string)($data['id'] ?? '');
                $paidCurrency = strtoupper((string)($data['currency'] ?? ''));
                if ($ref !== '') {
                    try {
                        credit_deposit_from_gateway($ref, $paid, $flwId, $paidCurrency);
                    } catch (Throwable $e) {
                        json_out(['ok' => false, 'error' => $e->getMessage()], 500);
                    }
                }
            }
            json_out(['ok' => true]);
        }

        case 'wallet.withdraw': {
            $u = require_user();
            ensure_user_payout_columns();
            // reload with payout columns
            $u = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            $amount = (float)($body['amount'] ?? 0);
            $min = (float)setting_get('min_withdraw', 5);
            if ($amount < $min) json_out(['ok' => false, 'error' => "Minimum withdrawal is $$min"], 422);
            if ((float)$u['balance'] < $amount) json_out(['ok' => false, 'error' => 'Insufficient balance'], 400);
            $method = trim((string)($body['method'] ?? 'bank'));
            $destination = trim((string)($body['destination'] ?? $body['account'] ?? ''));
            $accountName = trim((string)($body['accountName'] ?? ''));
            $bankName = trim((string)($body['bankName'] ?? ''));
            $currency = strtoupper(trim((string)($body['currency'] ?? ($u['payout_currency'] ?? '') ?: country_to_currency((string)($u['country_code'] ?? 'ng')))));

            $locked = (int)($u['payout_bank_locked'] ?? 0) === 1;
            if ($method === 'bank' && $locked) {
                $destination = (string)($u['payout_account'] ?? '');
                $accountName = (string)($u['payout_account_name'] ?? '');
                $bankName = (string)($u['payout_bank'] ?? '');
                if (($u['payout_currency'] ?? '') !== '') $currency = strtoupper((string)$u['payout_currency']);
            }

            if ($destination === '') {
                json_out(['ok' => false, 'error' => 'Enter your payout account / wallet address'], 422);
            }
            $rate = (float)setting_get('withdraw_commission_rate', 0.1);
            $fee = round($amount * $rate, 2);
            $payout = round($amount - $fee, 2);
            ensure_tx_reference_column();
            $txRef = 'AVW' . strtoupper(substr(uid_token(8), 0, 16));
            $note = 'Payout via ' . $method . ' · ' . $destination;
            if ($accountName !== '') $note .= ' · ' . $accountName;
            if ($bankName !== '') $note .= ' · ' . $bankName;
            if ($currency !== '') $note .= ' · ' . $currency;

            // Save bank details on first bank withdraw (editable until first successful payout)
            if ($method === 'bank' && !$locked) {
                db()->prepare('UPDATE users SET payout_bank = ?, payout_account = ?, payout_account_name = ?, payout_currency = ? WHERE id = ?')
                    ->execute([$bankName, $destination, $accountName, $currency, (int)$u['id']]);
            }

            db()->prepare('UPDATE users SET balance = balance - ?, total_withdrawals = total_withdrawals + ? WHERE id = ?')
                ->execute([money_f($amount), money_f($amount), (int)$u['id']]);
            db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, payout, status, method, note, reference) VALUES (?, \'withdrawal\', ?, ?, ?, \'pending\', ?, ?, ?)')
                ->execute([(int)$u['id'], money_f($amount), money_f($fee), money_f($payout), $method, $note, $txRef]);
            notify_user((int)$u['id'], 'Withdrawal requested', 'Your withdrawal of $' . money_f($amount) . ' is pending review.', 'wallet');
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out([
                'ok' => true,
                'payout' => $payout,
                'fee' => $fee,
                'reference' => $txRef,
                'status' => 'pending',
                'user' => public_user($fresh),
                'message' => 'Withdrawal submitted. You’ll be paid after owner approval.',
            ]);
        }

        case 'wallet.transactions': {
            $u = require_user();
            $stmt = db()->prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
            $stmt->execute([(int)$u['id']]);
            json_out(['ok' => true, 'transactions' => $stmt->fetchAll()]);
        }

        case 'notifications.list': {
            $u = require_user();
            $stmt = db()->prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
            $stmt->execute([(int)$u['id']]);
            json_out(['ok' => true, 'notifications' => $stmt->fetchAll()]);
        }

        case 'presence.ping': {
            $u = require_user();
            touch_user_presence((int)$u['id']);
            json_out(['ok' => true, 'serverTime' => date('c')]);
        }

        case 'staff.login': {
            ensure_support_tables();
            $user = trim((string)($body['username'] ?? ''));
            $pass = (string)($body['password'] ?? '');
            $cfg = app_config();
            $okOwner = ($user === ($cfg['owner_username'] ?? 'owner') && $pass === ($cfg['owner_password'] ?? ''));
            $okAdmin = ($user === 'admin' && ($pass === 'admin123' || $pass === (string)setting_get('admin_api_password', 'admin123')));
            if (!$okOwner && !$okAdmin) {
                json_out(['ok' => false, 'error' => 'Invalid staff credentials'], 401);
            }
            $role = $okOwner ? 'owner' : 'admin';
            $name = $okOwner ? 'Owner Support' : 'Acctventa Support';
            $token = create_staff_session($role, $name);
            json_out(['ok' => true, 'token' => $token, 'role' => $role, 'name' => $name]);
        }

        case 'support.open': {
            $u = require_user();
            touch_user_presence((int)$u['id']);
            $thread = support_get_or_create_thread((int)$u['id']);
            db()->prepare('UPDATE support_threads SET user_last_seen_at = NOW() WHERE id = ?')->execute([(int)$thread['id']]);
            $msgs = array_map('support_map_message', support_list_messages((int)$thread['id']));
            json_out(['ok' => true, 'thread' => support_public_thread($thread, $u), 'messages' => $msgs]);
        }

        case 'support.messages': {
            // user or staff
            $staff = staff_from_token();
            $threadId = (int)($body['threadId'] ?? $_GET['threadId'] ?? 0);
            if ($staff) {
                if ($threadId < 1) json_out(['ok' => false, 'error' => 'threadId required'], 422);
                $t = db()->prepare('SELECT t.*, u.name AS user_name, u.email AS user_email, u.last_seen_at FROM support_threads t JOIN users u ON u.id = t.user_id WHERE t.id = ?');
                $t->execute([$threadId]);
                $thread = $t->fetch();
                if (!$thread) json_out(['ok' => false, 'error' => 'Thread not found'], 404);
                db()->prepare('UPDATE support_threads SET staff_last_seen_at = NOW() WHERE id = ?')->execute([$threadId]);
                $msgs = array_map('support_map_message', support_list_messages($threadId));
                json_out([
                    'ok' => true,
                    'thread' => array_merge(support_public_thread($thread, ['last_seen_at' => $thread['last_seen_at'] ?? null]), [
                        'userName' => $thread['user_name'],
                        'userEmail' => $thread['user_email'],
                    ]),
                    'messages' => $msgs,
                ]);
            }
            $u = require_user();
            touch_user_presence((int)$u['id']);
            $thread = support_get_or_create_thread((int)$u['id']);
            db()->prepare('UPDATE support_threads SET user_last_seen_at = NOW() WHERE id = ?')->execute([(int)$thread['id']]);
            $msgs = array_map('support_map_message', support_list_messages((int)$thread['id']));
            json_out(['ok' => true, 'thread' => support_public_thread($thread, $u), 'messages' => $msgs]);
        }

        case 'support.send': {
            $staff = staff_from_token();
            $text = trim((string)($body['text'] ?? $body['body'] ?? ''));
            if ($text === '') json_out(['ok' => false, 'error' => 'Empty message'], 422);
            if ($staff) {
                $threadId = (int)($body['threadId'] ?? 0);
                if ($threadId < 1) json_out(['ok' => false, 'error' => 'threadId required'], 422);
                $t = db()->prepare('SELECT * FROM support_threads WHERE id = ?');
                $t->execute([$threadId]);
                $thread = $t->fetch();
                if (!$thread) json_out(['ok' => false, 'error' => 'Thread not found'], 404);
                db()->prepare('INSERT INTO support_messages (thread_id, sender_role, sender_id, staff_name, body) VALUES (?, \'staff\', NULL, ?, ?)')
                    ->execute([$threadId, $staff['staff_name'], $text]);
                db()->prepare("UPDATE support_threads SET status = 'open', staff_typing_at = NULL, staff_last_seen_at = NOW(), last_message_at = NOW() WHERE id = ?")
                    ->execute([$threadId]);
                notify_user((int)$thread['user_id'], 'Support reply', mb_substr($text, 0, 100), 'support');
                $msgs = array_map('support_map_message', support_list_messages($threadId));
                json_out(['ok' => true, 'messages' => $msgs]);
            }
            $u = require_user();
            touch_user_presence((int)$u['id']);
            $thread = support_get_or_create_thread((int)$u['id']);
            $threadId = (int)$thread['id'];
            db()->prepare('INSERT INTO support_messages (thread_id, sender_role, sender_id, staff_name, body) VALUES (?, \'user\', ?, NULL, ?)')
                ->execute([$threadId, (int)$u['id'], $text]);
            db()->prepare("UPDATE support_threads SET status = 'open', user_typing_at = NULL, user_last_seen_at = NOW(), last_message_at = NOW() WHERE id = ?")
                ->execute([$threadId]);
            // notify staff via a lightweight settings flag / no user id — staff poll inbox
            $msgs = array_map('support_map_message', support_list_messages($threadId));
            json_out(['ok' => true, 'thread' => support_public_thread($thread, $u), 'messages' => $msgs]);
        }

        case 'support.typing': {
            $staff = staff_from_token();
            $typing = !empty($body['typing']);
            if ($staff) {
                $threadId = (int)($body['threadId'] ?? 0);
                if ($threadId < 1) json_out(['ok' => false, 'error' => 'threadId required'], 422);
                if ($typing) {
                    db()->prepare('UPDATE support_threads SET staff_typing_at = NOW(), staff_last_seen_at = NOW() WHERE id = ?')->execute([$threadId]);
                } else {
                    db()->prepare('UPDATE support_threads SET staff_typing_at = NULL WHERE id = ?')->execute([$threadId]);
                }
                json_out(['ok' => true]);
            }
            $u = require_user();
            $thread = support_get_or_create_thread((int)$u['id']);
            if ($typing) {
                db()->prepare('UPDATE support_threads SET user_typing_at = NOW(), user_last_seen_at = NOW() WHERE id = ?')->execute([(int)$thread['id']]);
            } else {
                db()->prepare('UPDATE support_threads SET user_typing_at = NULL WHERE id = ?')->execute([(int)$thread['id']]);
            }
            json_out(['ok' => true]);
        }

        case 'support.threads': {
            $staff = require_staff();
            ensure_support_tables();
            $rows = db()->query("SELECT t.*, u.name AS user_name, u.email AS user_email, u.last_seen_at,
                (SELECT body FROM support_messages sm WHERE sm.thread_id = t.id ORDER BY sm.id DESC LIMIT 1) AS last_body
              FROM support_threads t
              JOIN users u ON u.id = t.user_id
              ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
              LIMIT 100")->fetchAll();
            $list = [];
            foreach ($rows as $r) {
                $list[] = array_merge(support_public_thread($r, ['last_seen_at' => $r['last_seen_at'] ?? null]), [
                    'userName' => $r['user_name'],
                    'userEmail' => $r['user_email'],
                    'lastBody' => $r['last_body'] ?? '',
                ]);
            }
            json_out(['ok' => true, 'threads' => $list, 'staff' => ['name' => $staff['staff_name'], 'role' => $staff['role']]]);
        }

        default:
            json_out(['ok' => false, 'error' => 'Unknown action', 'action' => $action], 404);
    }
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
