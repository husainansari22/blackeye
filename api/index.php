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
                    'salesCommissionRate' => (float)setting_get('sales_commission_rate', app_config()['sales_commission_rate'] ?? 0.22),
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
            $code = referral_code_generate();
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
            ensure_user_avatar_column();
            $name = trim((string)($body['name'] ?? $u['name']));
            $phone = trim((string)($body['phone'] ?? $u['phone']));
            if ($name === '') json_out(['ok' => false, 'error' => 'Name is required'], 422);
            db()->prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')->execute([$name, $phone, (int)$u['id']]);
            $avatarData = (string)($body['avatar'] ?? '');
            if ($avatarData !== '') {
                try {
                    save_user_avatar((int)$u['id'], $avatarData);
                } catch (Throwable $e) {
                    json_out(['ok' => false, 'error' => $e->getMessage()], 422);
                }
            }
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
            ensure_marketplace_extras();
            $rows = db()->query("SELECT a.id, a.title, a.description, a.category, a.price, a.preview_link AS previewLink, a.release_type AS releaseType, a.stock,
                a.seller_id AS sellerId, u.name AS sellerName, u.email AS sellerEmail, u.is_verified AS sellerVerified
                FROM ads a JOIN users u ON u.id = a.seller_id
                WHERE a.status = 'active' AND a.stock > 0 AND u.is_banned = 0
                ORDER BY a.created_at DESC LIMIT 200")->fetchAll();
            foreach ($rows as &$r) {
                $sum = seller_rating_summary((int)$r['sellerId']);
                $r['sellerRating'] = $sum['average'];
                $r['sellerReviews'] = $sum['count'];
            }
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
                b.name AS buyerName, b.email AS buyerEmail, s.name AS sellerName, s.email AS sellerEmail, s.id AS sellerId
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
                $r['txid'] = $r['public_id'];
                $r['publicId'] = $r['public_id'];
                if (($r['role'] ?? '') === 'buyer' && ($r['status'] ?? '') === 'completed') {
                    $chk = db()->prepare('SELECT id FROM seller_reviews WHERE order_id = ?');
                    $chk->execute([(int)$r['id']]);
                    $r['canReview'] = !$chk->fetch();
                    $r['reviewed'] = !$r['canReview'];
                } else {
                    $r['canReview'] = false;
                    $r['reviewed'] = false;
                }
            }
            json_out(['ok' => true, 'orders' => $rows]);
        }

        case 'orders.create':
        case 'orders.buy': {
            $u = require_user();
            ensure_wallet_ledger_columns();
            ensure_marketplace_extras();
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
            $saleSplit = null;
            try {
                debit_user_for_purchase($pdo, (int)$u['id'], $price);
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
                $publicId = uuid_txid();
                $pdo->prepare('INSERT INTO orders (public_id, listing_id, buyer_id, seller_id, title, category, price, status, credentials_json, completed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([
                    $publicId, $listingId, (int)$u['id'], (int)$ad['seller_id'], $ad['title'], $ad['category'], money_f($price), $status, $creds,
                    $status === 'completed' ? date('Y-m-d H:i:s') : null
                ]);
                $orderId = (int)$pdo->lastInsertId();
                if ($status === 'completed') {
                    $saleSplit = credit_seller_balance($pdo, (int)$ad['seller_id'], $price, 'Sold #' . $publicId);
                    record_order_sale_split($pdo, $orderId, $saleSplit);
                } else {
                    $pdo->prepare('UPDATE users SET escrow_balance = escrow_balance + ? WHERE id = ?')->execute([money_f($price), (int)$ad['seller_id']]);
                }
                $pdo->prepare('UPDATE ads SET stock = stock - 1, status = IF(stock - 1 <= 0, \'removed\', status) WHERE id = ?')->execute([$listingId]);
                $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'purchase\', ?, \'completed\', ?)')
                    ->execute([(int)$u['id'], money_f($price), 'Bought #' . $publicId]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            notify_user((int)$u['id'], 'Order placed', 'You purchased ' . $ad['title'] . ' · TXID ' . $publicId, 'order');
            $sellerNetNote = '';
            if ($saleSplit) {
                $sellerNetNote = ' AI deducted ' . round(($saleSplit['rate'] ?? 0) * 100, 2) . '% ($' . money_f($saleSplit['commission']) . '); $' . money_f($saleSplit['net']) . ' added to withdrawable balance.';
                notify_user((int)$ad['seller_id'], 'New sale — congratulations!', $u['name'] . ' purchased ' . $ad['title'] . ' · TXID ' . $publicId . '.' . $sellerNetNote, 'order');
            } else {
                notify_user((int)$ad['seller_id'], 'New sale — congratulations!', $u['name'] . ' purchased ' . $ad['title'] . ' · TXID ' . $publicId, 'order');
            }
            $sellerReleaseNote = $status === 'pending'
                ? 'Funds are on hold in escrow until you send the buyer the login details in order chat. AI will release funds when credentials are detected (platform sales commission applies on release).'
                : ('AI sales settlement credited $' . money_f($saleSplit['net'] ?? 0) . ' to your withdrawable balance after platform commission (any seller debt was repaid first).');
            try {
                $buyerMail = email_order_notice($u['name'], $ad['title'], 'buyer', money_f($price), $publicId);
                send_app_mail($u['email'], $buyerMail['subject'], $buyerMail['html'], $buyerMail['text']);
                $sellerMail = email_order_notice($ad['seller_name'], $ad['title'], 'seller', money_f($price), $publicId, $sellerReleaseNote);
                send_app_mail($ad['seller_email'], $sellerMail['subject'], $sellerMail['html'], $sellerMail['text']);
            } catch (Throwable $e) {}
            try {
                maybe_credit_referral_reward((int)$u['id']);
            } catch (Throwable $e) {}
            json_out(['ok' => true, 'orderId' => $orderId, 'publicId' => $publicId, 'txid' => $publicId, 'status' => $status, 'sellerNet' => $saleSplit['net'] ?? null, 'platformFee' => $saleSplit['commission'] ?? null]);
        }

        case 'orders.refund': {
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND seller_id = ? LIMIT 1');
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            try {
                refund_order_with_debt($o, 'Seller refund');
            } catch (Throwable $e) {
                json_out(['ok' => false, 'error' => $e->getMessage()], 400);
            }
            $balStmt = db()->prepare('SELECT balance FROM users WHERE id = ?');
            $balStmt->execute([(int)$u['id']]);
            $sellerBal = (float)($balStmt->fetch()['balance'] ?? 0);
            json_out(['ok' => true, 'sellerBalance' => $sellerBal, 'owing' => $sellerBal < 0 ? abs($sellerBal) : 0]);
        }

        case 'orders.release': {
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND seller_id = ? AND status = \'pending\' LIMIT 1');
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Pending order not found'], 404);
            try {
                release_pending_order_to_seller($o, 'Seller confirmed delivery');
            } catch (Throwable $e) {
                json_out(['ok' => false, 'error' => $e->getMessage()], 400);
            }
            json_out(['ok' => true]);
        }

        case 'messages.list': {
            ensure_marketplace_extras();
            $staff = staff_from_token();
            $orderId = (int)($body['orderId'] ?? $_GET['orderId'] ?? $_GET['order_id'] ?? 0);
            if ($staff) {
                $chk = db()->prepare('SELECT id FROM orders WHERE id = ?');
                $chk->execute([$orderId]);
                if (!$chk->fetch()) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            } else {
                $u = require_user();
                $chk = db()->prepare('SELECT id FROM orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?)');
                $chk->execute([$orderId, (int)$u['id'], (int)$u['id']]);
                if (!$chk->fetch()) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            }
            $stmt = db()->prepare('SELECT m.*, u.name AS fromName, u.email AS fromEmail FROM messages m JOIN users u ON u.id = m.sender_id WHERE order_id = ? ORDER BY m.created_at ASC');
            $stmt->execute([$orderId]);
            $msgs = array_map('map_order_message', $stmt->fetchAll());
            json_out(['ok' => true, 'messages' => $msgs]);
        }

        case 'messages.send': {
            ensure_marketplace_extras();
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $text = trim((string)($body['text'] ?? $body['body'] ?? ''));
            $attachData = (string)($body['attachment'] ?? $body['file'] ?? '');
            $attachName = trim((string)($body['fileName'] ?? $body['filename'] ?? 'attachment'));
            $att = null;
            if ($attachData !== '') {
                try {
                    $att = save_chat_attachment($attachData, $attachName);
                } catch (Throwable $e) {
                    json_out(['ok' => false, 'error' => $e->getMessage()], 422);
                }
            }
            if ($text === '' && !$att) json_out(['ok' => false, 'error' => 'Empty message'], 422);
            if ($text === '' && $att) $text = '📎 ' . ($att['name'] ?: 'Attachment');
            $chk = db()->prepare('SELECT * FROM orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?)');
            $chk->execute([$orderId, (int)$u['id'], (int)$u['id']]);
            $o = $chk->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            db()->prepare('INSERT INTO messages (order_id, sender_id, body, attachment_url, attachment_name, attachment_mime) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([
                    $orderId,
                    (int)$u['id'],
                    $text,
                    $att['url'] ?? null,
                    $att['name'] ?? null,
                    $att['mime'] ?? null,
                ]);
            $other = ((int)$o['buyer_id'] === (int)$u['id']) ? (int)$o['seller_id'] : (int)$o['buyer_id'];
            notify_user($other, 'New message', $u['name'] . ': ' . mb_substr($text, 0, 80), 'message');

            $ai = null;
            $released = false;
            // Manual listings: AI releases escrow when seller sends login details
            if ((int)$o['seller_id'] === (int)$u['id'] && ($o['status'] ?? '') === 'pending') {
                $ai = ai_detect_credentials_delivered($text);
                if (!empty($ai['ok'])) {
                    try {
                        release_pending_order_to_seller($o, 'AI confirmed credential delivery');
                        $released = true;
                    } catch (Throwable $e) {
                        $ai['releaseError'] = $e->getMessage();
                    }
                }
            }
            json_out(['ok' => true, 'ai' => $ai, 'fundsReleased' => $released]);
        }

        case 'wallet.summary': {
            $u = require_user();
            $stmt = db()->prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
            $stmt->execute([(int)$u['id']]);
            $rows = $stmt->fetchAll();
            $txs = array_map('map_public_transaction', $rows);
            json_out(['ok' => true, 'user' => public_user($u), 'transactions' => $txs]);
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

            // Crypto deposits: require configured address, show it to user, then create pending for owner review
            if ($channel === 'crypto') {
                ensure_tx_reference_column();
                $coin = $prefer !== '' ? $prefer : 'USDT';
                $network = strtoupper(trim((string)($body['network'] ?? '')));
                $txHash = trim((string)($body['txHash'] ?? $body['txid'] ?? ''));
                $coinCfg = crypto_coin_config($coin);
                if (!$coinCfg) {
                    json_out(['ok' => false, 'error' => 'This cryptocurrency is not available for deposits.'], 422);
                }
                $nets = array_map(static function ($n) {
                    return strtoupper(trim((string)$n));
                }, $coinCfg['networks'] ?? []);
                $nets = array_values(array_filter($nets));
                if ($network === '' && count($nets) === 1) {
                    $network = $nets[0];
                }
                if ($network === '' || !in_array($network, $nets, true)) {
                    json_out(['ok' => false, 'error' => 'Select a valid network for ' . $coin], 422);
                }
                $address = crypto_deposit_address($coin, $network);
                if ($address === '') {
                    json_out([
                        'ok' => false,
                        'error' => 'No wallet is available at the moment.',
                        'code' => 'crypto_address_missing',
                    ], 503);
                }
                $txRef = uuid_txid();
                $note = 'Crypto deposit pending · ' . $coin . ' · ' . $network . ' · to=' . $address;
                if ($txHash !== '') {
                    $note .= ' · user_txid=' . preg_replace('/\s+/', '', $txHash);
                }
                $note .= ' · await owner credit';
                db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, status, method, note, reference) VALUES (?, \'deposit\', ?, ?, \'pending\', \'crypto\', ?, ?)')
                    ->execute([(int)$u['id'], money_f($credited), money_f($fee), $note, $txRef]);
                notify_user((int)$u['id'], 'Crypto deposit submitted', 'Your $' . money_f($credited) . ' ' . $coin . ' (' . $network . ') deposit is pending owner confirmation.', 'wallet');
                json_out([
                    'ok' => true,
                    'pending' => true,
                    'reference' => $txRef,
                    'amount' => $amount,
                    'credited' => $credited,
                    'coin' => $coin,
                    'network' => $network,
                    'address' => $address,
                    'message' => 'Submitted for review. Send exactly $' . money_f($credited) . ' worth of ' . $coin . ' on ' . $network . ' to the address shown, then wait for owner credit. Your wallet will NOT update until the owner confirms.',
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
            $txRef = uuid_txid();
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
                json_out(['ok' => false, 'error' => 'Payment not found for this account'], 404);
            }
            $credit = settle_flutterwave_payment($ref, $paid, $flwId, $paidCurrency);
            if (!$credit['ok']) json_out($credit, 400);
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out([
                'ok' => true,
                'kind' => $credit['kind'] ?? 'deposit',
                'credited' => $credit['credited'] ?? null,
                'plan' => $credit['plan'] ?? null,
                'planName' => $credit['planName'] ?? null,
                'dailyUploads' => $credit['dailyUploads'] ?? null,
                'already' => !empty($credit['already']),
                'user' => public_user($fresh),
            ]);
        }

        case 'plans.upgrade': {
            $u = require_user();
            ensure_plan_tx_type();
            ensure_wallet_ledger_columns();
            $planId = preg_replace('/[^a-z0-9_]/', '', strtolower(trim((string)($body['planId'] ?? $body['plan'] ?? ''))));
            if ($planId === '') json_out(['ok' => false, 'error' => 'Choose a plan'], 422);
            $plan = plan_limits($planId);
            if (($plan['id'] ?? '') !== $planId) json_out(['ok' => false, 'error' => 'Unknown plan'], 404);

            // Downgrade / switch to free — no payment
            if ((float)($plan['price'] ?? 0) <= 0) {
                db()->prepare('UPDATE users SET plan = ? WHERE id = ?')->execute(['free', (int)$u['id']]);
                $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
                notify_user((int)$u['id'], 'Plan updated', 'You are now on the Free plan (' . (int)$plan['daily_uploads'] . ' uploads / day).', 'plan');
                json_out(['ok' => true, 'plan' => 'free', 'user' => public_user($fresh), 'message' => 'Switched to Free plan.']);
            }

            if (($u['plan'] ?? '') === $planId) {
                json_out(['ok' => false, 'error' => 'You are already on this plan'], 400);
            }

            $price = (float)$plan['price'];
            $method = strtolower(trim((string)($body['method'] ?? 'flutterwave')));
            $prefer = strtoupper(trim((string)($body['currency'] ?? country_to_currency((string)($u['country_code'] ?? 'ng')))));

            // Pay from wallet balance (spend-only deposits preferred)
            if ($method === 'wallet') {
                if ((float)$u['balance'] < $price) {
                    json_out(['ok' => false, 'error' => 'Insufficient wallet balance. Deposit funds or pay with Flutterwave.'], 400);
                }
                $pdo = db();
                $pdo->beginTransaction();
                try {
                    debit_user_for_purchase($pdo, (int)$u['id'], $price);
                    $pdo->prepare('UPDATE users SET plan = ? WHERE id = ?')->execute([$planId, (int)$u['id']]);
                    $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, method, note) VALUES (?, \'plan\', ?, \'completed\', \'wallet\', ?)')
                        ->execute([(int)$u['id'], money_f($price), 'Plan upgrade · plan=' . $planId . ' · paid from wallet']);
                    $pdo->commit();
                } catch (Throwable $e) {
                    $pdo->rollBack();
                    throw $e;
                }
                $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
                notify_user((int)$u['id'], 'Plan upgraded', ($plan['name'] ?? $planId) . ' is active — ' . (int)$plan['daily_uploads'] . ' uploads / day.', 'plan');
                json_out([
                    'ok' => true,
                    'plan' => $planId,
                    'dailyUploads' => (int)$plan['daily_uploads'],
                    'paidFrom' => 'wallet',
                    'user' => public_user($fresh),
                    'message' => 'Plan upgraded using wallet balance.',
                ]);
            }

            if (!flw_deposit_enabled()) {
                json_out([
                    'ok' => false,
                    'error' => 'Flutterwave is not enabled. In Owner Admin → Gateways, enable Flutterwave deposits (same keys are used for plan upgrades).',
                    'code' => 'gateway_disabled',
                ], 503);
            }

            ensure_tx_reference_column();
            $txRef = uuid_txid();
            $checkout = flw_create_checkout($u, $price, $txRef, $prefer ?: 'NGN', [
                'purpose' => 'plan_upgrade',
                'title' => (app_config()['app_name'] ?? 'Acctventa') . ' Plan',
                'description' => 'Upgrade to ' . ($plan['name'] ?? $planId) . ' — ' . (int)$plan['daily_uploads'] . ' uploads/day',
                'redirect_url' => rtrim((string)(app_config()['app_url'] ?? 'https://acctventa.com'), '/') . '/wallet-return.html?purpose=plan',
                'meta' => ['plan_id' => $planId, 'daily_uploads' => (int)$plan['daily_uploads']],
            ]);
            if (!$checkout['ok']) {
                json_out(['ok' => false, 'error' => $checkout['error'] ?? 'Could not start payment'], 502);
            }
            $charge = $checkout['charge'];
            $note = sprintf(
                'Awaiting Flutterwave plan upgrade · plan=%s · charge=%s%s|usd=%s|rate=%s',
                $planId,
                $charge['amount'],
                $charge['currency'],
                money_f($price),
                $charge['rate']
            );
            db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, status, method, note, reference) VALUES (?, \'plan\', ?, 0, \'pending\', \'flutterwave\', ?, ?)')
                ->execute([(int)$u['id'], money_f($price), $note, $txRef]);

            json_out([
                'ok' => true,
                'checkout' => true,
                'paymentLink' => $checkout['link'],
                'reference' => $txRef,
                'plan' => $planId,
                'amount' => $price,
                'payAmount' => $charge['amount'],
                'payCurrency' => $charge['currency'],
                'dailyUploads' => (int)$plan['daily_uploads'],
            ]);
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
                        settle_flutterwave_payment($ref, $paid, $flwId, $paidCurrency);
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
            ensure_wallet_ledger_columns();
            // reload with payout columns
            $u = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            $amount = (float)($body['amount'] ?? 0);
            $min = (float)setting_get('min_withdraw', 5);
            if ($amount < $min) json_out(['ok' => false, 'error' => "Minimum withdrawal is $$min"], 422);
            $withdrawable = (float)($u['withdrawable_balance'] ?? 0);
            $balance = (float)$u['balance'];
            if ($balance <= 0 || $withdrawable <= 0) {
                json_out(['ok' => false, 'error' => 'No withdrawable balance. Only sales and referral earnings can be withdrawn — deposits are for purchases only.'], 400);
            }
            if ($withdrawable < $amount) {
                json_out(['ok' => false, 'error' => 'Insufficient withdrawable balance ($' . money_f($withdrawable) . '). Deposits cannot be withdrawn.'], 400);
            }
            if ($balance < $amount) json_out(['ok' => false, 'error' => 'Insufficient balance'], 400);
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
            $txRef = uuid_txid();
            $note = 'Payout via ' . $method . ' · ' . $destination;
            if ($accountName !== '') $note .= ' · ' . $accountName;
            if ($bankName !== '') $note .= ' · ' . $bankName;
            if ($currency !== '') $note .= ' · ' . $currency;

            // Save bank details on first bank withdraw (editable until first successful payout)
            if ($method === 'bank' && !$locked) {
                db()->prepare('UPDATE users SET payout_bank = ?, payout_account = ?, payout_account_name = ?, payout_currency = ? WHERE id = ?')
                    ->execute([$bankName, $destination, $accountName, $currency, (int)$u['id']]);
            }

            db()->prepare('UPDATE users SET balance = balance - ?, withdrawable_balance = GREATEST(0, withdrawable_balance - ?), total_withdrawals = total_withdrawals + ? WHERE id = ?')
                ->execute([money_f($amount), money_f($amount), money_f($amount), (int)$u['id']]);
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
                'message' => 'Withdrawal submitted. You’ll be paid after approval.',
            ]);
        }

        case 'wallet.transactions': {
            $u = require_user();
            $stmt = db()->prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
            $stmt->execute([(int)$u['id']]);
            $txs = array_map('map_public_transaction', $stmt->fetchAll());
            json_out(['ok' => true, 'transactions' => $txs]);
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
            ensure_marketplace_extras();
            $staff = staff_from_token();
            $text = trim((string)($body['text'] ?? $body['body'] ?? ''));
            $attachData = (string)($body['attachment'] ?? $body['file'] ?? '');
            $attachName = trim((string)($body['fileName'] ?? $body['filename'] ?? 'attachment'));
            $att = null;
            if ($attachData !== '') {
                try {
                    $att = save_chat_attachment($attachData, $attachName);
                } catch (Throwable $e) {
                    json_out(['ok' => false, 'error' => $e->getMessage()], 422);
                }
            }
            if ($text === '' && !$att) json_out(['ok' => false, 'error' => 'Empty message'], 422);
            if ($text === '' && $att) $text = '📎 ' . ($att['name'] ?: 'Attachment');
            if ($staff) {
                $threadId = (int)($body['threadId'] ?? 0);
                if ($threadId < 1) json_out(['ok' => false, 'error' => 'threadId required'], 422);
                $t = db()->prepare('SELECT * FROM support_threads WHERE id = ?');
                $t->execute([$threadId]);
                $thread = $t->fetch();
                if (!$thread) json_out(['ok' => false, 'error' => 'Thread not found'], 404);
                db()->prepare('INSERT INTO support_messages (thread_id, sender_role, sender_id, staff_name, body, attachment_url, attachment_name, attachment_mime) VALUES (?, \'staff\', NULL, ?, ?, ?, ?, ?)')
                    ->execute([$threadId, $staff['staff_name'], $text, $att['url'] ?? null, $att['name'] ?? null, $att['mime'] ?? null]);
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
            db()->prepare('INSERT INTO support_messages (thread_id, sender_role, sender_id, staff_name, body, attachment_url, attachment_name, attachment_mime) VALUES (?, \'user\', ?, NULL, ?, ?, ?, ?)')
                ->execute([$threadId, (int)$u['id'], $text, $att['url'] ?? null, $att['name'] ?? null, $att['mime'] ?? null]);
            db()->prepare("UPDATE support_threads SET status = 'open', user_typing_at = NULL, user_last_seen_at = NOW(), last_message_at = NOW() WHERE id = ?")
                ->execute([$threadId]);
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
            $rows = db()->query("SELECT t.*, u.name AS user_name, u.email AS user_email, u.last_seen_at, u.balance AS user_balance, u.plan AS user_plan,
                (SELECT body FROM support_messages sm WHERE sm.thread_id = t.id ORDER BY sm.id DESC LIMIT 1) AS last_body,
                (SELECT sender_role FROM support_messages sm WHERE sm.thread_id = t.id ORDER BY sm.id DESC LIMIT 1) AS last_role,
                (SELECT COUNT(*) FROM support_messages sm WHERE sm.thread_id = t.id AND sm.sender_role = 'user'
                  AND (t.staff_last_seen_at IS NULL OR sm.created_at > t.staff_last_seen_at)) AS unread_count
              FROM support_threads t
              JOIN users u ON u.id = t.user_id
              ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
              LIMIT 300")->fetchAll();
            $list = [];
            foreach ($rows as $r) {
                $list[] = array_merge(support_public_thread($r, ['last_seen_at' => $r['last_seen_at'] ?? null]), [
                    'userName' => $r['user_name'],
                    'userEmail' => $r['user_email'],
                    'userBalance' => (float)($r['user_balance'] ?? 0),
                    'userPlan' => $r['user_plan'] ?? 'free',
                    'lastBody' => $r['last_body'] ?? '',
                    'lastRole' => $r['last_role'] ?? '',
                    'unreadCount' => (int)($r['unread_count'] ?? 0),
                    'staffLastSeenAt' => $r['staff_last_seen_at'] ?? null,
                ]);
            }
            json_out(['ok' => true, 'threads' => $list, 'staff' => ['name' => $staff['staff_name'], 'role' => $staff['role']]]);
        }

        case 'staff.orders.search': {
            require_staff();
            ensure_marketplace_extras();
            $q = trim((string)($body['q'] ?? $_GET['q'] ?? ''));
            if ($q === '') json_out(['ok' => false, 'error' => 'Search query required'], 422);
            $like = '%' . $q . '%';
            $stmt = db()->prepare("SELECT o.*, b.name AS buyer_name, b.email AS buyer_email, b.balance AS buyer_balance,
                s.name AS seller_name, s.email AS seller_email, s.balance AS seller_balance
              FROM orders o
              JOIN users b ON b.id = o.buyer_id
              JOIN users s ON s.id = o.seller_id
              WHERE o.public_id LIKE ? OR o.title LIKE ? OR b.email LIKE ? OR s.email LIKE ? OR b.name LIKE ? OR s.name LIKE ?
              ORDER BY o.created_at DESC LIMIT 40");
            $stmt->execute([$like, $like, $like, $like, $like, $like]);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                $r['txid'] = $r['public_id'];
                unset($r['credentials_json']);
            }
            json_out(['ok' => true, 'orders' => $rows]);
        }

        case 'staff.orders.get': {
            require_staff();
            ensure_marketplace_extras();
            $orderId = (int)($body['orderId'] ?? $_GET['orderId'] ?? 0);
            $txid = trim((string)($body['txid'] ?? $_GET['txid'] ?? $body['publicId'] ?? ''));
            if ($orderId > 0) {
                $stmt = db()->prepare("SELECT o.*, b.name AS buyer_name, b.email AS buyer_email, b.balance AS buyer_balance,
                    s.name AS seller_name, s.email AS seller_email, s.balance AS seller_balance
                  FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id WHERE o.id = ? LIMIT 1");
                $stmt->execute([$orderId]);
            } else {
                $stmt = db()->prepare("SELECT o.*, b.name AS buyer_name, b.email AS buyer_email, b.balance AS buyer_balance,
                    s.name AS seller_name, s.email AS seller_email, s.balance AS seller_balance
                  FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id WHERE o.public_id = ? LIMIT 1");
                $stmt->execute([$txid]);
            }
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            $creds = $o['credentials_json'] ? json_decode($o['credentials_json'], true) : null;
            unset($o['credentials_json']);
            $o['txid'] = $o['public_id'];
            $o['credentials'] = $creds;
            $mstmt = db()->prepare('SELECT m.*, u.name AS fromName, u.email AS fromEmail FROM messages m JOIN users u ON u.id = m.sender_id WHERE order_id = ? ORDER BY m.created_at ASC');
            $mstmt->execute([(int)$o['id']]);
            json_out(['ok' => true, 'order' => $o, 'messages' => array_map('map_order_message', $mstmt->fetchAll())]);
        }

        case 'staff.orders.refund': {
            $staff = require_staff();
            $orderId = (int)($body['orderId'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? LIMIT 1');
            $stmt->execute([$orderId]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            try {
                refund_order_with_debt($o, 'Staff ' . ($staff['staff_name'] ?? 'admin'));
            } catch (Throwable $e) {
                json_out(['ok' => false, 'error' => $e->getMessage()], 400);
            }
            $sBal = db()->prepare('SELECT balance FROM users WHERE id = ?');
            $sBal->execute([(int)$o['seller_id']]);
            $sellerBal = (float)($sBal->fetch()['balance'] ?? 0);
            json_out(['ok' => true, 'sellerBalance' => $sellerBal, 'owing' => $sellerBal < 0 ? abs($sellerBal) : 0]);
        }

        case 'staff.orders.chats': {
            require_staff();
            ensure_marketplace_extras();
            $rows = db()->query("SELECT o.id, o.public_id, o.title, o.status, o.price, o.created_at,
                b.name AS buyer_name, s.name AS seller_name,
                (SELECT COUNT(*) FROM messages m WHERE m.order_id = o.id) AS message_count,
                (SELECT body FROM messages m WHERE m.order_id = o.id ORDER BY m.id DESC LIMIT 1) AS last_body
              FROM orders o
              JOIN users b ON b.id = o.buyer_id
              JOIN users s ON s.id = o.seller_id
              WHERE EXISTS (SELECT 1 FROM messages m WHERE m.order_id = o.id)
              ORDER BY (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.order_id = o.id) DESC
              LIMIT 100")->fetchAll();
            json_out(['ok' => true, 'chats' => $rows]);
        }

        case 'reviews.create': {
            ensure_marketplace_extras();
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $rating = (int)($body['rating'] ?? 0);
            $comment = trim((string)($body['comment'] ?? ''));
            if ($rating < 1 || $rating > 5) json_out(['ok' => false, 'error' => 'Rating must be 1–5'], 422);
            $stmt = db()->prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ? AND status = 'completed' LIMIT 1");
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Completed purchase required to review'], 404);
            $exists = db()->prepare('SELECT id FROM seller_reviews WHERE order_id = ?');
            $exists->execute([$orderId]);
            if ($exists->fetch()) json_out(['ok' => false, 'error' => 'Already reviewed'], 409);
            db()->prepare('INSERT INTO seller_reviews (order_id, seller_id, buyer_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
                ->execute([$orderId, (int)$o['seller_id'], (int)$u['id'], $rating, $comment]);
            notify_user((int)$o['seller_id'], 'New review', $u['name'] . ' left a ' . $rating . '-star review.', 'review');
            json_out(['ok' => true, 'summary' => seller_rating_summary((int)$o['seller_id'])]);
        }

        case 'reviews.seller': {
            ensure_marketplace_extras();
            $sellerId = (int)($body['sellerId'] ?? $_GET['sellerId'] ?? 0);
            $sellerEmail = strtolower(trim((string)($body['sellerEmail'] ?? $_GET['sellerEmail'] ?? '')));
            if ($sellerId < 1 && $sellerEmail !== '') {
                $s = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
                $s->execute([$sellerEmail]);
                $row = $s->fetch();
                $sellerId = $row ? (int)$row['id'] : 0;
            }
            if ($sellerId < 1) json_out(['ok' => false, 'error' => 'sellerId required'], 422);
            $stmt = db()->prepare('SELECT r.*, u.name AS buyer_name FROM seller_reviews r JOIN users u ON u.id = r.buyer_id WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 50');
            $stmt->execute([$sellerId]);
            json_out(['ok' => true, 'summary' => seller_rating_summary($sellerId), 'reviews' => $stmt->fetchAll()]);
        }

        case 'reports.create': {
            ensure_marketplace_extras();
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $reason = trim((string)($body['reason'] ?? ''));
            if ($reason === '') json_out(['ok' => false, 'error' => 'Reason required'], 422);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ? LIMIT 1');
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Only the buyer can report the seller on this order'], 404);
            db()->prepare('INSERT INTO seller_reports (order_id, reporter_id, seller_id, reason) VALUES (?, ?, ?, ?)')
                ->execute([$orderId, (int)$u['id'], (int)$o['seller_id'], $reason]);
            // Flag order disputed for staff visibility
            if (($o['status'] ?? '') !== 'cancelled') {
                db()->prepare("UPDATE orders SET status = 'disputed' WHERE id = ? AND status IN ('pending','completed')")->execute([$orderId]);
            }
            json_out(['ok' => true]);
        }

        case 'staff.reports': {
            require_staff();
            ensure_marketplace_extras();
            $rows = db()->query("SELECT r.*, o.public_id, o.title, b.name AS buyer_name, s.name AS seller_name
              FROM seller_reports r
              JOIN orders o ON o.id = r.order_id
              JOIN users b ON b.id = r.reporter_id
              JOIN users s ON s.id = r.seller_id
              ORDER BY r.created_at DESC LIMIT 100")->fetchAll();
            json_out(['ok' => true, 'reports' => $rows]);
        }

        case 'sellers.profile': {
            ensure_marketplace_extras();
            ensure_user_avatar_column();
            $sellerId = (int)($body['sellerId'] ?? $_GET['sellerId'] ?? 0);
            $sellerEmail = strtolower(trim((string)($body['sellerEmail'] ?? $_GET['sellerEmail'] ?? '')));
            if ($sellerId < 1 && $sellerEmail !== '') {
                $s = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
                $s->execute([$sellerEmail]);
            } else {
                $s = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                $s->execute([$sellerId]);
            }
            $seller = $s->fetch();
            if (!$seller) json_out(['ok' => false, 'error' => 'Seller not found'], 404);
            $sid = (int)$seller['id'];
            $ads = db()->prepare("SELECT id, title, category, price, preview_link AS previewLink, status FROM ads WHERE seller_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 40");
            $ads->execute([$sid]);
            $rev = db()->prepare('SELECT r.rating, r.comment, r.created_at, u.name AS buyer_name FROM seller_reviews r JOIN users u ON u.id = r.buyer_id WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 30');
            $rev->execute([$sid]);
            $sales = (int)db()->query("SELECT COUNT(*) c FROM orders WHERE seller_id = {$sid} AND status = 'completed'")->fetch()['c'];
            json_out([
                'ok' => true,
                'seller' => [
                    'id' => $sid,
                    'name' => $seller['name'],
                    'email' => $seller['email'],
                    'isVerified' => (int)$seller['is_verified'] === 1,
                    'avatarUrl' => (string)($seller['avatar_url'] ?? ''),
                    'memberSince' => $seller['created_at'],
                    'completedSales' => $sales,
                    'rating' => seller_rating_summary($sid),
                ],
                'listings' => $ads->fetchAll(),
                'reviews' => $rev->fetchAll(),
            ]);
        }

        case 'kyc.status':
            $u = require_user();
            json_out(array_merge(['ok' => true], kyc_status_for_user($u)));

        case 'kyc.submit':
            $u = require_user();
            $result = kyc_submit($u, $body);
            $fresh = db()->prepare('SELECT * FROM users WHERE id = ?');
            $fresh->execute([(int)$u['id']]);
            $urow = $fresh->fetch() ?: $u;
            json_out(array_merge(['ok' => true, 'user' => public_user($urow)], $result));

        default:
            json_out(['ok' => false, 'error' => 'Unknown action', 'action' => $action], 404);
    }
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
