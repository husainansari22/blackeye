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
            json_out([
                'ok' => true,
                'config' => [
                    'minDeposit' => (float)setting_get('min_deposit', app_config()['min_deposit']),
                    'minWithdraw' => (float)setting_get('min_withdraw', app_config()['min_withdraw']),
                    'withdrawCommissionRate' => (float)setting_get('withdraw_commission_rate', app_config()['withdraw_commission_rate']),
                    'depositFeeRate' => (float)setting_get('deposit_fee_rate', app_config()['deposit_fee_rate']),
                    'supportTelegram' => setting_get('support_telegram', app_config()['support_telegram']),
                    'supportEmail' => setting_get('support_email', app_config()['support_email']),
                ],
                'plans' => db()->query('SELECT id, name, price, daily_uploads AS dailyUploads, approval_label AS approval FROM plans WHERE is_active = 1')->fetchAll(),
            ]);

        case 'auth.register': {
            $name = trim((string)($body['name'] ?? ''));
            $email = strtolower(trim((string)($body['email'] ?? '')));
            $phone = trim((string)($body['phone'] ?? ''));
            $password = (string)($body['password'] ?? '');
            $ref = trim((string)($body['referredBy'] ?? $body['ref'] ?? ''));
            if ($name === '' || $email === '' || $password === '') json_out(['ok' => false, 'error' => 'Name, email and password required'], 422);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['ok' => false, 'error' => 'Invalid email'], 422);
            $exists = db()->prepare('SELECT id FROM users WHERE email = ?');
            $exists->execute([$email]);
            if ($exists->fetch()) json_out(['ok' => false, 'error' => 'Email already registered'], 409);
            $code = strtolower(preg_replace('/[^a-z0-9]/', '', explode(' ', $name)[0] ?? 'user')) ?: ('user' . substr(uid_token(3), 0, 6));
            $stmt = db()->prepare('INSERT INTO users (name, email, phone, password_hash, referral_code, referred_by, plan) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$name, $email, $phone, password_hash($password, PASSWORD_DEFAULT), $code, $ref, 'free']);
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
            // Always return ok to avoid email enumeration
            $generic = [
                'ok' => true,
                'message' => 'If an account exists for that email, a reset link is on the way. Check your inbox and spam folder.',
            ];
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out($generic);
            $stmt = db()->prepare('SELECT * FROM users WHERE email = ? AND is_banned = 0 LIMIT 1');
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u) json_out($generic);
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
                json_out(['ok' => false, 'error' => 'Could not send email right now. Create mailbox help@acctventa.com in Hostinger and try again.'], 500);
            }
            json_out($generic);
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
            if (!$u || !password_verify($password, $u['password_hash'])) json_out(['ok' => false, 'error' => 'Invalid email or password'], 401);
            if ((int)$u['is_banned'] === 1) json_out(['ok' => false, 'error' => 'Account banned'], 403);
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
            // Mark completed for now until live gateway webhooks are connected; owner can also approve pending later
            db()->prepare('UPDATE users SET balance = balance + ?, total_deposits = total_deposits + ? WHERE id = ?')
                ->execute([money_f($credited), money_f($credited), (int)$u['id']]);
            db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, status, method, note) VALUES (?, \'deposit\', ?, ?, \'completed\', ?, ?)')
                ->execute([(int)$u['id'], money_f($credited), money_f($fee), (string)($body['method'] ?? 'manual'), 'Deposit recorded (connect live gateway webhook for automatic paid confirmations)']);
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out(['ok' => true, 'credited' => $credited, 'user' => public_user($fresh)]);
        }

        case 'wallet.withdraw': {
            $u = require_user();
            $amount = (float)($body['amount'] ?? 0);
            $min = (float)setting_get('min_withdraw', 5);
            if ($amount < $min) json_out(['ok' => false, 'error' => "Minimum withdrawal is $$min"], 422);
            if ((float)$u['balance'] < $amount) json_out(['ok' => false, 'error' => 'Insufficient balance'], 400);
            $rate = (float)setting_get('withdraw_commission_rate', 0.1);
            $fee = round($amount * $rate, 2);
            $payout = round($amount - $fee, 2);
            db()->prepare('UPDATE users SET balance = balance - ?, total_withdrawals = total_withdrawals + ? WHERE id = ?')
                ->execute([money_f($amount), money_f($amount), (int)$u['id']]);
            db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, payout, status, method, note) VALUES (?, \'withdrawal\', ?, ?, ?, \'pending\', ?, ?)')
                ->execute([(int)$u['id'], money_f($amount), money_f($fee), money_f($payout), (string)($body['method'] ?? 'crypto'), 'Awaiting owner payout / gateway']);
            // platform commission ledger on a system note — tracked as fee on the row
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out(['ok' => true, 'payout' => $payout, 'fee' => $fee, 'user' => public_user($fresh)]);
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

        default:
            json_out(['ok' => false, 'error' => 'Unknown action', 'action' => $action], 404);
    }
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
