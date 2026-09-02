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
            ensure_commerce_features();
            ensure_merchant_slug_column();
            $rows = db()->query("SELECT a.id, a.title, a.description, a.category, a.price, a.preview_link AS previewLink, a.release_type AS releaseType, a.stock,
                a.public_slug AS publicSlug, a.created_at,
                a.seller_id AS sellerId, u.name AS sellerName, u.email AS sellerEmail, u.is_verified AS sellerVerified,
                u.merchant_slug AS sellerMerchantSlug,
                (SELECT COUNT(*) FROM orders o WHERE o.seller_id = a.seller_id AND o.status = 'completed') AS sellerCompletedSales
                FROM ads a JOIN users u ON u.id = a.seller_id
                WHERE a.status = 'active' AND a.stock > 0 AND u.is_banned = 0
                " . market_list_sql_order() . " LIMIT 200")->fetchAll();
            foreach ($rows as &$r) {
                if (empty($r['publicSlug'])) {
                    $r['publicSlug'] = ensure_ad_public_slug(['id' => $r['id'], 'title' => $r['title'], 'public_slug' => $r['publicSlug']]);
                }
                if (empty($r['sellerMerchantSlug']) && !empty($r['sellerId'])) {
                    $r['sellerMerchantSlug'] = ensure_merchant_slug((int)$r['sellerId']);
                }
                $sum = seller_rating_summary((int)$r['sellerId']);
                $r['sellerRating'] = $sum['average'];
                $r['sellerReviews'] = $sum['count'];
            }
            json_out(['ok' => true, 'listings' => $rows]);
        }

        case 'market.get': {
            ensure_marketplace_extras();
            ensure_commerce_features();
            ensure_merchant_slug_column();
            $id = (int)($body['id'] ?? $body['listingId'] ?? $_GET['id'] ?? 0);
            $slug = trim((string)($body['slug'] ?? $_GET['slug'] ?? ''));
            $cols = "a.id, a.title, a.description, a.category, a.price, a.preview_link AS previewLink, a.release_type AS releaseType, a.stock,
                a.public_slug AS publicSlug, a.created_at,
                a.seller_id AS sellerId, u.name AS sellerName, u.email AS sellerEmail, u.is_verified AS sellerVerified,
                u.merchant_slug AS sellerMerchantSlug, u.avatar_url AS sellerAvatar, u.created_at AS sellerMemberSince,
                (SELECT COUNT(*) FROM orders o WHERE o.seller_id = a.seller_id AND o.status = 'completed') AS sellerCompletedSales";
            if ($id > 0) {
                $stmt = db()->prepare("SELECT {$cols} FROM ads a JOIN users u ON u.id = a.seller_id
                    WHERE a.id = ? AND a.status = 'active' AND u.is_banned = 0 LIMIT 1");
                $stmt->execute([$id]);
            } elseif ($slug !== '') {
                $stmt = db()->prepare("SELECT {$cols} FROM ads a JOIN users u ON u.id = a.seller_id
                    WHERE a.public_slug = ? AND a.status = 'active' AND u.is_banned = 0 LIMIT 1");
                $stmt->execute([$slug]);
            } else {
                json_out(['ok' => false, 'error' => 'id or slug required'], 422);
            }
            $row = $stmt->fetch();
            if (!$row) json_out(['ok' => false, 'error' => 'Listing not found'], 404);
            if (empty($row['publicSlug'])) {
                $row['publicSlug'] = ensure_ad_public_slug(['id' => $row['id'], 'title' => $row['title'], 'public_slug' => $row['publicSlug']]);
            }
            if (empty($row['sellerMerchantSlug'])) {
                $row['sellerMerchantSlug'] = ensure_merchant_slug((int)$row['sellerId']);
            }
            $sum = seller_rating_summary((int)$row['sellerId']);
            $row['sellerRating'] = $sum['average'];
            $row['sellerReviews'] = $sum['count'];
            json_out(['ok' => true, 'listing' => $row]);
        }

        case 'ads.mine': {
            $u = require_user();
            $stmt = db()->prepare('SELECT * FROM ads WHERE seller_id = ? ORDER BY created_at DESC');
            $stmt->execute([(int)$u['id']]);
            json_out(['ok' => true, 'ads' => $stmt->fetchAll()]);
        }

        case 'ads.create': {
            $u = require_user();
            $plan = plan_limits($u['plan'] ?? 'free');
            $used = uploads_today((int)$u['id']);
            $dailyLimit = (int)($plan['daily_uploads'] ?? 5);
            if ($used >= $dailyLimit) {
                json_out([
                    'ok' => false,
                    'error' => 'Daily upload limit reached (' . $dailyLimit . '). Upgrade your plan to upload more today.',
                    'code' => 'daily_limit',
                    'used' => $used,
                    'limit' => $dailyLimit,
                ], 429);
            }
            $ad = [
                'category' => trim((string)($body['category'] ?? '')),
                'title' => trim((string)($body['title'] ?? '')),
                'description' => trim((string)($body['description'] ?? '')),
                'price' => round((float)($body['price'] ?? 0), 2),
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
                json_out(['ok' => false, 'error' => 'Missing required listing fields (category, title, username, password, price).', 'code' => 'validation'], 422);
            }
            if ($ad['price'] > 99999) {
                json_out(['ok' => false, 'error' => 'Listing price is too high.', 'code' => 'validation'], 422);
            }
            // Soft AI pre-check: hard-deny bad listings; good ones stay pending for Owner approval
            $review = ai_review_listing($ad);
            $finalStatus = 'pending';
            $denyReason = '';
            $reviewedBy = '';
            $reviewedAt = null;
            if (($review['status'] ?? '') === 'denied') {
                $finalStatus = 'denied';
                $denyReason = (string)($review['reason'] ?? 'Failed AI checks.');
                $reviewedBy = (string)($review['reviewed_by'] ?? 'AI Review');
                $reviewedAt = date('Y-m-d H:i:s');
            } else {
                // Pass AI → wait for Owner (do not auto-publish)
                $finalStatus = 'pending';
                $reviewedBy = 'AI Precheck';
                $reviewedAt = date('Y-m-d H:i:s');
            }
            try {
                $stmt = db()->prepare('INSERT INTO ads
                    (seller_id, category, title, description, price, release_type, username, password_plain, preview_link, attached_email, attached_email_password, two_fa, extra_info, status, deny_reason, stock, reviewed_by, reviewed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
                $stmt->execute([
                    (int)$u['id'], $ad['category'], $ad['title'], $ad['description'], money_f($ad['price']), $ad['release_type'],
                    $ad['username'], $ad['password'], $ad['preview_link'], $ad['attached_email'], $ad['attached_email_password'],
                    $ad['two_fa'], $ad['extra_info'], $finalStatus, $denyReason, 1,
                    $reviewedBy, $reviewedAt,
                ]);
            } catch (Throwable $e) {
                json_out(['ok' => false, 'error' => 'Could not save listing: ' . $e->getMessage(), 'code' => 'insert_failed'], 500);
            }
            $adId = (int)db()->lastInsertId();
            if ($adId < 1) {
                json_out(['ok' => false, 'error' => 'Listing was not saved. Please try again.', 'code' => 'insert_failed'], 500);
            }
            bump_upload((int)$u['id']);
            // Ensure slug exists for public links
            try {
                ensure_commerce_features();
                ensure_ad_public_slug(['id' => $adId, 'title' => $ad['title'], 'public_slug' => null]);
            } catch (Throwable $e) {}
            try {
                ensure_merchant_slug((int)$u['id']);
            } catch (Throwable $e) {}

            if ($finalStatus === 'denied') {
                notify_user((int)$u['id'], 'Ad Denied', $denyReason !== '' ? $denyReason : 'Your listing did not pass review.', 'ad_review');
            } else {
                notify_user((int)$u['id'], 'Ad Under Review', 'Your listing "' . $ad['title'] . '" is pending Owner approval. You will be notified when it goes live.', 'ad_review');
            }
            $row = db()->query('SELECT * FROM ads WHERE id = ' . $adId)->fetch();
            json_out([
                'ok' => true,
                'ad' => $row,
                'ai' => $review,
                'status' => $finalStatus,
                'message' => $finalStatus === 'pending'
                    ? 'Listing submitted for Owner approval.'
                    : 'Listing denied by AI checks.',
            ]);
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
            ensure_commerce_features();
            $listingId = (int)($body['listingId'] ?? $body['id'] ?? 0);
            try {
                $result = purchase_listing((int)$u['id'], $listingId);
            } catch (MarketplaceException $e) {
                json_out(['ok' => false, 'error' => $e->getMessage(), 'code' => $e->errorCode], $e->httpStatus);
            }
            json_out([
                'ok' => true,
                'orderId' => $result['orderId'],
                'publicId' => $result['publicId'],
                'txid' => $result['publicId'],
                'status' => $result['status'],
                'sellerNet' => $result['sellerNet'],
                'platformFee' => $result['platformFee'],
                'listingId' => $result['listingId'] ?? $listingId,
                'title' => $result['title'] ?? '',
                'category' => $result['category'] ?? '',
                'price' => $result['price'] ?? null,
                'credentials' => $result['credentials'] ?? null,
                'sellerName' => $result['sellerName'] ?? '',
                'sellerEmail' => $result['sellerEmail'] ?? '',
                'sellerId' => $result['sellerId'] ?? null,
                'orderStatusStep' => $result['orderStatusStep'] ?? null,
                'createdAt' => $result['createdAt'] ?? null,
                'balance' => $result['buyerBalance'] ?? null,
            ]);
        }

        case 'orders.get':
        case 'orders.detail': {
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? $_GET['orderId'] ?? $_GET['id'] ?? 0);
            $txid = trim((string)($body['txid'] ?? $_GET['txid'] ?? $body['publicId'] ?? $_GET['publicId'] ?? ''));
            if ($orderId < 1 && $txid === '') {
                json_out(['ok' => false, 'error' => 'orderId or txid required'], 422);
            }
            if ($orderId > 0) {
                $stmt = db()->prepare('SELECT o.*,
                    CASE WHEN o.buyer_id = ? THEN \'buyer\' ELSE \'seller\' END AS role,
                    b.name AS buyerName, b.email AS buyerEmail, s.name AS sellerName, s.email AS sellerEmail, s.id AS sellerId
                    FROM orders o
                    JOIN users b ON b.id = o.buyer_id
                    JOIN users s ON s.id = o.seller_id
                    WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
                    LIMIT 1');
                $stmt->execute([(int)$u['id'], $orderId, (int)$u['id'], (int)$u['id']]);
            } else {
                $stmt = db()->prepare('SELECT o.*,
                    CASE WHEN o.buyer_id = ? THEN \'buyer\' ELSE \'seller\' END AS role,
                    b.name AS buyerName, b.email AS buyerEmail, s.name AS sellerName, s.email AS sellerEmail, s.id AS sellerId
                    FROM orders o
                    JOIN users b ON b.id = o.buyer_id
                    JOIN users s ON s.id = o.seller_id
                    WHERE o.public_id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
                    LIMIT 1');
                $stmt->execute([(int)$u['id'], $txid, (int)$u['id'], (int)$u['id']]);
            }
            $r = $stmt->fetch();
            if (!$r) json_out(['ok' => false, 'error' => 'Order not found'], 404);
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
            json_out(['ok' => true, 'order' => $r]);
        }

        case 'cart.list': {
            $u = require_user();
            ensure_commerce_features();
            json_out(['ok' => true, 'items' => cart_list_for_user((int)$u['id'])]);
        }

        case 'cart.add': {
            $u = require_user();
            ensure_commerce_features();
            $listingId = (int)($body['listingId'] ?? $body['id'] ?? 0);
            $qty = max(1, (int)($body['qty'] ?? 1));
            if ($listingId < 1) json_out(['ok' => false, 'error' => 'listingId required'], 422);
            try {
                cart_add_item((int)$u['id'], $listingId, $qty);
            } catch (MarketplaceException $e) {
                json_out(['ok' => false, 'error' => $e->getMessage(), 'code' => $e->errorCode], $e->httpStatus);
            }
            json_out(['ok' => true, 'items' => cart_list_for_user((int)$u['id'])]);
        }

        case 'cart.remove': {
            $u = require_user();
            ensure_commerce_features();
            $listingId = (int)($body['listingId'] ?? $body['id'] ?? 0);
            cart_remove_item((int)$u['id'], $listingId);
            json_out(['ok' => true, 'items' => cart_list_for_user((int)$u['id'])]);
        }

        case 'cart.clear': {
            $u = require_user();
            ensure_commerce_features();
            cart_clear_items((int)$u['id']);
            json_out(['ok' => true, 'items' => []]);
        }

        case 'cart.checkout': {
            $u = require_user();
            ensure_commerce_features();
            try {
                $result = cart_checkout((int)$u['id']);
            } catch (MarketplaceException $e) {
                json_out(['ok' => false, 'error' => $e->getMessage(), 'code' => $e->errorCode], $e->httpStatus);
            }
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out([
                'ok' => true,
                'orders' => $result['orders'],
                'errors' => $result['errors'],
                'total' => $result['total'],
                'user' => public_user($fresh),
            ]);
        }

        case 'wishlist.list': {
            $u = require_user();
            ensure_commerce_features();
            json_out(['ok' => true, 'items' => wishlist_list_for_user((int)$u['id'])]);
        }

        case 'wishlist.add': {
            $u = require_user();
            ensure_commerce_features();
            $listingId = (int)($body['listingId'] ?? $body['id'] ?? 0);
            if ($listingId < 1) json_out(['ok' => false, 'error' => 'listingId required'], 422);
            try {
                wishlist_add_item((int)$u['id'], $listingId);
            } catch (MarketplaceException $e) {
                json_out(['ok' => false, 'error' => $e->getMessage(), 'code' => $e->errorCode], $e->httpStatus);
            }
            json_out(['ok' => true, 'items' => wishlist_list_for_user((int)$u['id'])]);
        }

        case 'wishlist.remove': {
            $u = require_user();
            ensure_commerce_features();
            $listingId = (int)($body['listingId'] ?? $body['id'] ?? 0);
            wishlist_remove_item((int)$u['id'], $listingId);
            json_out(['ok' => true, 'items' => wishlist_list_for_user((int)$u['id'])]);
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
            ensure_commerce_features();
            $orderId = (int)($body['orderId'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND seller_id = ? AND status = \'pending\' LIMIT 1');
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Pending order not found'], 404);
            try {
                release_pending_order_to_seller($o, 'Seller confirmed delivery');
                db()->prepare("UPDATE orders SET order_status_step = 'delivered' WHERE id = ?")->execute([$orderId]);
                order_set_dispute_window(db(), $orderId);
            } catch (Throwable $e) {
                json_out(['ok' => false, 'error' => $e->getMessage()], 400);
            }
            json_out(['ok' => true]);
        }

        case 'disputes.open': {
            $u = require_user();
            ensure_commerce_features();
            $orderId = (int)($body['orderId'] ?? 0);
            $reason = trim((string)($body['reason'] ?? ''));
            $evidence = $body['evidence'] ?? null;
            if ($reason === '') json_out(['ok' => false, 'error' => 'Reason is required'], 422);
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ? LIMIT 1');
            $stmt->execute([$orderId, (int)$u['id']]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            order_mark_dispute_expired_if_needed($o);
            if (!dispute_window_open($o)) {
                json_out(['ok' => false, 'error' => 'The 60-minute dispute window for this order has closed.', 'code' => 'dispute_window_closed'], 400);
            }
            $existing = db()->prepare('SELECT id FROM disputes WHERE order_id = ?');
            $existing->execute([$orderId]);
            if ($existing->fetch()) json_out(['ok' => false, 'error' => 'A dispute already exists for this order'], 409);
            $evidenceJson = $evidence !== null ? json_encode($evidence) : null;
            try {
                db()->prepare('INSERT INTO disputes (order_id, buyer_id, seller_id, reason, evidence_json) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$orderId, (int)$u['id'], (int)$o['seller_id'], $reason, $evidenceJson]);
            } catch (Throwable $e) {
                json_out(['ok' => false, 'error' => 'A dispute already exists for this order'], 409);
            }
            db()->prepare("UPDATE orders SET status = 'disputed', order_status_step = 'disputed' WHERE id = ?")->execute([$orderId]);
            notify_user((int)$o['seller_id'], 'Dispute opened', 'Buyer opened a dispute on order #' . $o['public_id'] . '.', 'dispute');
            notify_order_parties_email($o, 'Dispute opened', 'The buyer opened a dispute within the 60-minute window. Our team will review the order chat. Keep all communication on Acctventa.');
            $d = db()->prepare('SELECT * FROM disputes WHERE order_id = ? LIMIT 1');
            $d->execute([$orderId]);
            json_out(['ok' => true, 'dispute' => dispute_public($d->fetch())]);
        }

        case 'disputes.mine': {
            $u = require_user();
            ensure_commerce_features();
            $stmt = db()->prepare('SELECT d.*, o.public_id, o.title AS order_title FROM disputes d
                JOIN orders o ON o.id = d.order_id
                WHERE d.buyer_id = ? OR d.seller_id = ?
                ORDER BY d.created_at DESC');
            $stmt->execute([(int)$u['id'], (int)$u['id']]);
            json_out(['ok' => true, 'disputes' => array_map('dispute_public', $stmt->fetchAll())]);
        }

        case 'disputes.get': {
            ensure_commerce_features();
            $staff = staff_from_token();
            $disputeId = (int)($body['disputeId'] ?? $_GET['disputeId'] ?? 0);
            $stmt = db()->prepare('SELECT d.*, o.public_id, o.title AS order_title FROM disputes d
                JOIN orders o ON o.id = d.order_id WHERE d.id = ? LIMIT 1');
            $stmt->execute([$disputeId]);
            $d = $stmt->fetch();
            if (!$d) json_out(['ok' => false, 'error' => 'Dispute not found'], 404);
            if (!$staff) {
                $u = require_user();
                if ((int)$d['buyer_id'] !== (int)$u['id'] && (int)$d['seller_id'] !== (int)$u['id']) {
                    json_out(['ok' => false, 'error' => 'Not authorized'], 403);
                }
            }
            json_out(['ok' => true, 'dispute' => dispute_public($d)]);
        }

        case 'staff.disputes.list': {
            require_staff();
            ensure_commerce_features();
            $status = trim((string)($body['status'] ?? $_GET['status'] ?? ''));
            if ($status !== '') {
                $stmt = db()->prepare('SELECT d.*, o.public_id, o.title AS order_title, b.name AS buyer_name, s.name AS seller_name
                    FROM disputes d
                    JOIN orders o ON o.id = d.order_id
                    JOIN users b ON b.id = d.buyer_id
                    JOIN users s ON s.id = d.seller_id
                    WHERE d.status = ?
                    ORDER BY d.created_at DESC LIMIT 200');
                $stmt->execute([$status]);
            } else {
                $stmt = db()->query("SELECT d.*, o.public_id, o.title AS order_title, b.name AS buyer_name, s.name AS seller_name
                    FROM disputes d
                    JOIN orders o ON o.id = d.order_id
                    JOIN users b ON b.id = d.buyer_id
                    JOIN users s ON s.id = d.seller_id
                    ORDER BY d.created_at DESC LIMIT 200");
            }
            json_out(['ok' => true, 'disputes' => array_map('dispute_public', $stmt->fetchAll())]);
        }

        case 'staff.disputes.resolve': {
            $staff = require_staff();
            ensure_commerce_features();
            $disputeId = (int)($body['disputeId'] ?? 0);
            // Note: the resolve verb is read from "decision" (not "action") because "action"
            // is already used at the top level for API routing (e.g. "staff.disputes.resolve").
            $decision = trim((string)($body['decision'] ?? $body['resolution'] ?? ''));
            $note = trim((string)($body['note'] ?? ''));
            $stmt = db()->prepare('SELECT * FROM disputes WHERE id = ? LIMIT 1');
            $stmt->execute([$disputeId]);
            $d = $stmt->fetch();
            if (!$d) json_out(['ok' => false, 'error' => 'Dispute not found'], 404);
            $orderStmt = db()->prepare('SELECT * FROM orders WHERE id = ? LIMIT 1');
            $orderStmt->execute([(int)$d['order_id']]);
            $order = $orderStmt->fetch();
            if (!$order) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            $actorName = 'Staff ' . ($staff['staff_name'] ?? 'admin');

            if ($decision === 'refund_buyer') {
                try {
                    admin_deduct_seller_refund_buyer($order, $actorName . ($note !== '' ? ' · ' . $note : ''));
                } catch (Throwable $e) {
                    json_out(['ok' => false, 'error' => $e->getMessage()], 400);
                }
                db()->prepare("UPDATE disputes SET status = 'resolved_refund', admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?")
                    ->execute([$note, $staff['staff_name'] ?? 'admin', $disputeId]);
                db()->prepare("UPDATE orders SET order_status_step = 'refunded' WHERE id = ?")->execute([(int)$order['id']]);
                notify_user((int)$d['buyer_id'], 'Dispute resolved', 'Your dispute on order #' . $order['public_id'] . ' was resolved with a refund.', 'dispute');
                notify_order_parties_email($order, 'Refunded after dispute', 'Admin resolved the dispute in the buyer’s favor. The purchase amount was refunded to the buyer and deducted from the seller (including platform commission clawback).' . ($note !== '' ? ' Note: ' . $note : ''));
            } elseif ($decision === 'deny') {
                db()->prepare("UPDATE disputes SET status = 'resolved_denied', admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?")
                    ->execute([$note, $staff['staff_name'] ?? 'admin', $disputeId]);
                db()->prepare("UPDATE orders SET status = 'completed', order_status_step = 'completed' WHERE id = ? AND status = 'disputed'")
                    ->execute([(int)$order['id']]);
                notify_user((int)$d['buyer_id'], 'Dispute resolved', 'Your dispute on order #' . $order['public_id'] . ' was reviewed and denied.' . ($note !== '' ? ' ' . $note : ''), 'dispute');
                notify_user((int)$d['seller_id'], 'Dispute resolved', 'The dispute on order #' . $order['public_id'] . ' was denied — your funds are confirmed.', 'dispute');
                notify_order_parties_email($order, 'Dispute denied', 'Admin reviewed and denied the dispute. Seller funds remain confirmed.' . ($note !== '' ? ' Note: ' . $note : ''));
            } elseif ($decision === 'note') {
                $newStatus = ($d['status'] === 'open') ? 'under_review' : $d['status'];
                db()->prepare('UPDATE disputes SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                    ->execute([$newStatus, $note, $staff['staff_name'] ?? 'admin', $disputeId]);
                if ($newStatus === 'under_review') {
                    notify_order_parties_email($order, 'Dispute under review', 'An admin is reviewing this dispute. Please stay available in the order chat.');
                }
            } else {
                json_out(['ok' => false, 'error' => 'Unknown decision. Use refund_buyer, deny, or note.'], 422);
            }

            $fresh = db()->prepare('SELECT * FROM disputes WHERE id = ?');
            $fresh->execute([$disputeId]);
            json_out(['ok' => true, 'dispute' => dispute_public($fresh->fetch())]);
        }

        case 'staff.orders.deduct_refund': {
            $staff = require_staff();
            ensure_commerce_features();
            $orderId = (int)($body['orderId'] ?? 0);
            $note = trim((string)($body['note'] ?? 'Warranty replacement/refund'));
            $stmt = db()->prepare('SELECT * FROM orders WHERE id = ? LIMIT 1');
            $stmt->execute([$orderId]);
            $o = $stmt->fetch();
            if (!$o) json_out(['ok' => false, 'error' => 'Order not found'], 404);
            try {
                admin_deduct_seller_refund_buyer($o, 'Staff ' . ($staff['staff_name'] ?? 'admin') . ' · warranty · ' . $note);
            } catch (Throwable $e) {
                json_out(['ok' => false, 'error' => $e->getMessage()], 400);
            }
            db()->prepare("UPDATE orders SET order_status_step = 'warranty_refunded' WHERE id = ?")->execute([$orderId]);
            notify_order_parties_email($o, 'Warranty refund', 'Admin approved a warranty refund (e.g. account banned within 24h without buyer edits). The sale amount was deducted from the seller and refunded to the buyer.' . ($note !== '' ? ' Note: ' . $note : ''));
            $sBal = db()->prepare('SELECT balance FROM users WHERE id = ?');
            $sBal->execute([(int)$o['seller_id']]);
            $sellerBal = (float)($sBal->fetch()['balance'] ?? 0);
            json_out(['ok' => true, 'sellerBalance' => $sellerBal, 'owing' => $sellerBal < 0 ? abs($sellerBal) : 0]);
        }

        case 'stats.social_proof': {
            ensure_commerce_features();
            $orders24h = (int)(db()->query("SELECT COUNT(*) c FROM orders WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)")->fetch()['c'] ?? 0);
            $activeListings = (int)(db()->query("SELECT COUNT(*) c FROM ads WHERE status = 'active' AND stock > 0")->fetch()['c'] ?? 0);
            json_out(['ok' => true, 'completedOrders24h' => $orders24h, 'activeListings' => $activeListings]);
        }

        case 'banks.list': {
            // Used by withdraw form — requires login; falls back to empty if Flutterwave keys missing.
            require_user();
            $country = strtoupper(trim((string)($body['country'] ?? $_GET['country'] ?? 'NG')));
            if ($country === '') $country = 'NG';
            $res = flw_list_banks($country);
            json_out(['ok' => true, 'banks' => $res['banks'] ?? [], 'source' => !empty($res['ok']) ? 'flutterwave' : 'none', 'error' => $res['error'] ?? null]);
        }

        case 'staff.wallet.pending': {
            require_staff();
            ensure_wallet_ledger_columns();
            ensure_user_payout_columns();
            try { flw_reconcile_pending(false, 60); } catch (Throwable $e) {}
            $wdAll = db()->query("SELECT t.*, u.email, u.name, u.payout_bank, u.payout_account, u.payout_account_name, u.payout_bank_code
                FROM transactions t JOIN users u ON u.id = t.user_id
                WHERE t.type = 'withdrawal' AND t.status = 'pending'
                ORDER BY t.created_at ASC LIMIT 200")->fetchAll();
            $wd = [];
            $sending = [];
            foreach ($wdAll as $row) {
                if (tx_is_flutterwave_payout_inflight($row)) $sending[] = $row;
                else $wd[] = $row;
            }
            $dep = db()->query("SELECT t.*, u.email, u.name
                FROM transactions t JOIN users u ON u.id = t.user_id
                WHERE t.type = 'deposit' AND t.status = 'pending'
                ORDER BY t.created_at ASC LIMIT 200")->fetchAll();
            json_out(['ok' => true, 'withdrawals' => $wd, 'sending' => $sending, 'deposits' => $dep]);
        }

        case 'staff.wallet.approve_withdrawal': {
            $staff = require_staff();
            ensure_user_payout_columns();
            $txId = (int)($body['txId'] ?? $body['id'] ?? 0);
            $forceManual = !empty($body['forceManual']);
            $noteEdit = trim((string)($body['note'] ?? ''));
            $stmt = db()->prepare('SELECT t.*, u.payout_bank, u.payout_account, u.payout_account_name, u.payout_bank_code
                FROM transactions t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ? LIMIT 1');
            $stmt->execute([$txId]);
            $row = $stmt->fetch();
            if (!$row || ($row['type'] ?? '') !== 'withdrawal') json_out(['ok' => false, 'error' => 'Withdrawal not found'], 404);
            if (($row['status'] ?? '') !== 'pending') json_out(['ok' => false, 'error' => 'Already processed'], 400);
            if (tx_is_flutterwave_payout_inflight($row)) {
                json_out(['ok' => false, 'error' => 'Already sent to Flutterwave — waiting for automatic status update'], 400);
            }
            if ($noteEdit !== '') {
                db()->prepare('UPDATE transactions SET note = ? WHERE id = ?')->execute([$noteEdit, $txId]);
                $row['note'] = $noteEdit;
            }
            $actor = 'Staff ' . ($staff['staff_name'] ?? 'admin');
            $pay = approve_withdrawal_payout($row, $actor . ' approved', $forceManual);
            if (empty($pay['ok'])) {
                json_out(['ok' => false, 'error' => $pay['error'] ?? 'Payout failed', 'code' => $pay['code'] ?? ''], 400);
            }
            json_out(['ok' => true, 'result' => $pay]);
        }

        case 'staff.wallet.reject_withdrawal': {
            $staff = require_staff();
            $txId = (int)($body['txId'] ?? $body['id'] ?? 0);
            $stmt = db()->prepare('SELECT * FROM transactions WHERE id = ? LIMIT 1');
            $stmt->execute([$txId]);
            $row = $stmt->fetch();
            if (!$row || ($row['type'] ?? '') !== 'withdrawal') json_out(['ok' => false, 'error' => 'Withdrawal not found'], 404);
            if (($row['status'] ?? '') !== 'pending') json_out(['ok' => false, 'error' => 'Already processed'], 400);
            ensure_wallet_ledger_columns();
            db()->prepare('UPDATE users SET balance = balance + ?, withdrawable_balance = withdrawable_balance + ?, total_withdrawals = GREATEST(0, total_withdrawals - ?) WHERE id = ?')
                ->execute([money_f($row['amount']), money_f($row['amount']), money_f($row['amount']), (int)$row['user_id']]);
            $note = (string)($row['note'] ?? '');
            $note .= ' · Rejected by ' . ($staff['staff_name'] ?? 'admin');
            db()->prepare("UPDATE transactions SET status = 'cancelled', note = ? WHERE id = ?")->execute([$note, $txId]);
            notify_user((int)$row['user_id'], 'Withdrawal declined', 'Your withdrawal of $' . money_f($row['amount']) . ' was declined and refunded to your withdrawable balance.', 'wallet');
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
            ensure_commerce_features();
            $u = require_user();
            $orderId = (int)($body['orderId'] ?? 0);
            $text = trim((string)($body['text'] ?? $body['body'] ?? ''));
            $attachData = (string)($body['attachment'] ?? $body['file'] ?? '');
            $attachName = trim((string)($body['fileName'] ?? $body['filename'] ?? 'attachment'));

            if ($text !== '') {
                $guard = ai_blocks_external_contact($text);
                if (!empty($guard['blocked'])) {
                    // Block the whole message (and any attached file) — do not save it.
                    json_out(['ok' => false, 'error' => $guard['reason'], 'code' => 'external_contact_blocked'], 422);
                }
            }
            $att = null;
            if ($attachData !== '') {
                try {
                    $att = save_chat_attachment($attachData, $attachName);
                } catch (Throwable $e) {
                    json_out(['ok' => false, 'error' => $e->getMessage()], 422);
                }
            }
            if ($text === '' && !$att) json_out(['ok' => false, 'error' => 'Empty message'], 422);
            if ($text === '' && $att) {
                $text = (strpos((string)($att['mime'] ?? ''), 'image/') === 0)
                    ? ''
                    : ('📎 ' . ($att['name'] ?: 'Attachment'));
            }
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
                        db()->prepare("UPDATE orders SET order_status_step = 'delivered' WHERE id = ?")->execute([$orderId]);
                        order_set_dispute_window(db(), $orderId);
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
            // Always return history first — never let Flutterwave sync wipe/blank the wallet UI
            $stmt = db()->prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
            $stmt->execute([(int)$u['id']]);
            $rows = $stmt->fetchAll();
            $txs = array_map('map_public_transaction', $rows);
            // Best-effort sync (short). Failures must not break history.
            try {
                if (flw_secret_looks_valid()) {
                    flw_reconcile_pending(false, 180);
                    $u = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch() ?: $u;
                    $stmt->execute([(int)$u['id']]);
                    $rows = $stmt->fetchAll();
                    $txs = array_map('map_public_transaction', $rows);
                }
            } catch (Throwable $e) {}
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

            // Pay from wallet balance
            if ($method === 'wallet') {
                if ((float)$u['balance'] < $price) {
                    json_out([
                        'ok' => false,
                        'error' => 'Insufficient funds. Please deposit money into your wallet.',
                        'code' => 'insufficient_funds',
                    ], 400);
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

            // Flutterwave hosted checkout for plan upgrades
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
            $event = (string)($payload['event'] ?? '');
            $data = $payload['data'] ?? [];
            if (!is_array($data)) $data = [];

            // Deposit / plan checkout confirmed
            if ($event === 'charge.completed') {
                $ref = (string)($data['tx_ref'] ?? '');
                $paid = (float)($data['amount'] ?? 0);
                $flwId = (string)($data['id'] ?? '');
                $paidCurrency = strtoupper((string)($data['currency'] ?? ''));
                $chargeStatus = strtolower((string)($data['status'] ?? ''));
                if ($ref !== '' && $chargeStatus === 'successful') {
                    try {
                        settle_flutterwave_payment($ref, $paid, $flwId, $paidCurrency);
                    } catch (Throwable $e) {
                        json_out(['ok' => false, 'error' => $e->getMessage()], 500);
                    }
                } elseif ($ref !== '' && in_array($chargeStatus, ['failed', 'cancelled', 'canceled'], true)) {
                    try {
                        ensure_tx_reference_column();
                        $row = db()->prepare("SELECT id, note FROM transactions WHERE reference = ? AND status = 'pending' AND type IN ('deposit','plan') LIMIT 1");
                        $row->execute([$ref]);
                        $tx = $row->fetch();
                        if ($tx) {
                            db()->prepare("UPDATE transactions SET status = 'failed', note = ? WHERE id = ?")
                                ->execute([rtrim((string)$tx['note'], " ·") . ' · Flutterwave ' . $chargeStatus, (int)$tx['id']]);
                        }
                    } catch (Throwable $e) {}
                }
            }

            // Bank payout result (withdrawal)
            if ($event === 'transfer.completed' || strpos($event, 'transfer.') === 0) {
                $flwId = (string)($data['id'] ?? '');
                $ref = (string)($data['reference'] ?? '');
                $st = strtoupper((string)($data['status'] ?? ''));
                try {
                    ensure_tx_reference_column();
                    $tx = null;
                    if ($flwId !== '') {
                        $q = db()->prepare("SELECT * FROM transactions WHERE type='withdrawal' AND note LIKE ? ORDER BY id DESC LIMIT 1");
                        $q->execute(['%flw_payout=' . $flwId . '%']);
                        $tx = $q->fetch() ?: null;
                        if (!$tx) {
                            $q = db()->prepare("SELECT * FROM transactions WHERE type='withdrawal' AND note LIKE ? ORDER BY id DESC LIMIT 1");
                            $q->execute(['%Flutterwave transfer #' . $flwId . '%']);
                            $tx = $q->fetch() ?: null;
                        }
                    }
                    if (!$tx && $ref !== '') {
                        $q = db()->prepare("SELECT * FROM transactions WHERE type='withdrawal' AND reference = ? LIMIT 1");
                        $q->execute([$ref]);
                        $tx = $q->fetch() ?: null;
                    }
                    if ($tx && $st !== '') {
                        apply_flutterwave_transfer_status($tx, $st, $flwId);
                    }
                } catch (Throwable $e) {}
            }

            // Best-effort sweep so statuses keep catching up even if one webhook was missed
            try {
                flw_reconcile_pending(false, 120);
            } catch (Throwable $e) {}
            json_out(['ok' => true]);
        }

        case 'cron.reconcile_payments': {
            // Hostinger cron example:
            // /api/index.php?action=cron.reconcile_payments&key=YOUR_KEY
            $key = (string)($_GET['key'] ?? $body['key'] ?? '');
            $expected = (string)(app_config()['cron_key'] ?? '');
            if ($expected === '') {
                $expected = (string)setting_get('cron_key', '');
            }
            if ($expected === '') {
                $expected = substr(hash('sha256', (string)(app_config()['owner_password'] ?? 'owner') . '|acctventa-flw-cron'), 0, 32);
            }
            if ($key === '' || !hash_equals($expected, $key)) {
                json_out(['ok' => false, 'error' => 'Unauthorized'], 401);
            }
            json_out(flw_reconcile_pending(true, 0));
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
            $bankCode = trim((string)($body['bankCode'] ?? $body['bank_code'] ?? ''));
            $currency = strtoupper(trim((string)($body['currency'] ?? ($u['payout_currency'] ?? '') ?: country_to_currency((string)($u['country_code'] ?? 'ng')))));

            $locked = (int)($u['payout_bank_locked'] ?? 0) === 1;
            if ($method === 'bank' && $locked) {
                $destination = (string)($u['payout_account'] ?? '');
                $accountName = (string)($u['payout_account_name'] ?? '');
                $bankName = (string)($u['payout_bank'] ?? '');
                $bankCode = (string)($u['payout_bank_code'] ?? $bankCode);
                if (($u['payout_currency'] ?? '') !== '') $currency = strtoupper((string)$u['payout_currency']);
            }

            if ($destination === '') {
                json_out(['ok' => false, 'error' => 'Enter your payout account / wallet address'], 422);
            }
            if ($method === 'bank' && $bankCode === '' && $bankName !== '') {
                $bankCode = flw_resolve_bank_code($bankName);
            }
            $rate = (float)setting_get('withdraw_commission_rate', 0.1);
            $fee = round($amount * $rate, 2);
            $payout = round($amount - $fee, 2);
            ensure_tx_reference_column();
            $txRef = uuid_txid();
            $note = 'Payout via ' . $method . ' · ' . $destination;
            if ($accountName !== '') $note .= ' · ' . $accountName;
            if ($bankName !== '') $note .= ' · ' . $bankName;
            if ($bankCode !== '') $note .= ' · bankCode=' . $bankCode;
            if ($currency !== '') $note .= ' · ' . $currency;

            // Save + lock bank details on first bank withdraw (one account only; support unlocks).
            if ($method === 'bank' && !$locked) {
                ensure_user_payout_columns();
                try {
                    db()->prepare('UPDATE users SET payout_bank = ?, payout_account = ?, payout_account_name = ?, payout_currency = ?, payout_bank_code = ?, payout_bank_locked = 1 WHERE id = ?')
                        ->execute([$bankName, $destination, $accountName, $currency, $bankCode, (int)$u['id']]);
                } catch (Throwable $e) {
                    db()->prepare('UPDATE users SET payout_bank = ?, payout_account = ?, payout_account_name = ?, payout_currency = ?, payout_bank_locked = 1 WHERE id = ?')
                        ->execute([$bankName, $destination, $accountName, $currency, (int)$u['id']]);
                }
            }

            db()->prepare('UPDATE users SET balance = balance - ?, withdrawable_balance = GREATEST(0, withdrawable_balance - ?), total_withdrawals = total_withdrawals + ? WHERE id = ?')
                ->execute([money_f($amount), money_f($amount), money_f($amount), (int)$u['id']]);
            db()->prepare('INSERT INTO transactions (user_id, type, amount, fee, payout, status, method, note, reference) VALUES (?, \'withdrawal\', ?, ?, ?, \'pending\', ?, ?, ?)')
                ->execute([(int)$u['id'], money_f($amount), money_f($fee), money_f($payout), $method, $note, $txRef]);
            notify_user((int)$u['id'], 'Withdrawal requested', 'Your withdrawal of $' . money_f($amount) . ' is pending admin payment.', 'wallet');
            $fresh = db()->query('SELECT * FROM users WHERE id=' . (int)$u['id'])->fetch();
            json_out([
                'ok' => true,
                'payout' => $payout,
                'fee' => $fee,
                'reference' => $txRef,
                'status' => 'pending',
                'user' => public_user($fresh),
                'message' => 'Withdrawal submitted. Admin will pay you from the platform bank after review.',
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
            $okAdmin = ($user === 'admin' && admin_password_verify($pass));
            if (!$okOwner && !$okAdmin) {
                json_out(['ok' => false, 'error' => 'Invalid staff credentials'], 401);
            }
            $role = $okOwner ? 'owner' : 'admin';
            $name = $okOwner ? 'Owner Support' : 'Acctventa Support';
            $token = create_staff_session($role, $name);
            json_out(['ok' => true, 'token' => $token, 'role' => $role, 'name' => $name]);
        }

        case 'admin.changePassword': {
            $current = (string)($body['currentPassword'] ?? '');
            $next = (string)($body['newPassword'] ?? '');
            if (!admin_password_verify($current)) {
                json_out(['ok' => false, 'error' => 'Current password is wrong', 'code' => 'bad_current'], 400);
            }
            if (strlen($next) < 6) {
                json_out(['ok' => false, 'error' => 'New password must be at least 6 characters'], 422);
            }
            admin_password_set($next);
            json_out(['ok' => true, 'message' => 'Website admin password updated']);
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
            ensure_marketplace_extras();
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
            if ($text === '' && $att) {
                $text = (strpos((string)($att['mime'] ?? ''), 'image/') === 0)
                    ? ''
                    : ('📎 ' . ($att['name'] ?: 'Attachment'));
            }
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
            ensure_marketplace_extras();
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

        case 'sellers.storefront': {
            ensure_marketplace_extras();
            ensure_commerce_features();
            ensure_user_avatar_column();
            ensure_merchant_slug_column();
            $sellerId = (int)($body['sellerId'] ?? $body['id'] ?? $_GET['sellerId'] ?? $_GET['id'] ?? 0);
            $sellerEmail = strtolower(trim((string)($body['sellerEmail'] ?? $_GET['sellerEmail'] ?? '')));
            $key = trim((string)($body['slug'] ?? $_GET['slug'] ?? ''));
            $seller = null;
            if ($key !== '') {
                $s = db()->prepare('SELECT * FROM users WHERE merchant_slug = ? LIMIT 1');
                $s->execute([$key]);
                $seller = $s->fetch() ?: null;
                if (!$seller && ctype_digit($key)) {
                    $s = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                    $s->execute([(int)$key]);
                    $seller = $s->fetch() ?: null;
                }
            }
            if (!$seller && $sellerEmail !== '') {
                $s = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
                $s->execute([$sellerEmail]);
                $seller = $s->fetch() ?: null;
            }
            if (!$seller && $sellerId > 0) {
                $s = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                $s->execute([$sellerId]);
                $seller = $s->fetch() ?: null;
            }
            if (!$seller) json_out(['ok' => false, 'error' => 'Seller not found'], 404);
            $sid = (int)$seller['id'];
            if (!user_has_uploaded_ads($sid)) {
                json_out(['ok' => false, 'error' => 'Storefront not available'], 404);
            }
            $merchantSlug = ensure_merchant_slug($sid);
            $ads = db()->prepare("SELECT id, title, category, description, price, preview_link AS previewLink, public_slug AS publicSlug, stock, release_type AS releaseType, status
                FROM ads WHERE seller_id = ? AND status = 'active' AND stock > 0 " . market_list_sql_order() . " LIMIT 60");
            $ads->execute([$sid]);
            $adsRows = $ads->fetchAll();
            foreach ($adsRows as &$ar) {
                if (empty($ar['publicSlug'])) {
                    $ar['publicSlug'] = ensure_ad_public_slug(['id' => $ar['id'], 'title' => $ar['title'], 'public_slug' => $ar['publicSlug']]);
                }
            }
            unset($ar);
            $rev = db()->prepare('SELECT r.rating, r.comment, r.created_at, u.name AS buyer_name FROM seller_reviews r JOIN users u ON u.id = r.buyer_id WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 30');
            $rev->execute([$sid]);
            $stats = seller_storefront_stats($sid);
            json_out([
                'ok' => true,
                'seller' => [
                    'id' => $sid,
                    'name' => $seller['name'],
                    'email' => $seller['email'],
                    'isVerified' => (int)$seller['is_verified'] === 1,
                    'avatarUrl' => (string)($seller['avatar_url'] ?? ''),
                    'memberSince' => $seller['created_at'],
                    'completedSales' => $stats['totalSold'],
                    'rating' => seller_rating_summary($sid),
                    'merchantSlug' => $merchantSlug,
                    'merchantLink' => $merchantSlug ? ('https://acctventa.com/seller/' . $merchantSlug) : null,
                    'stats' => $stats,
                ],
                'listings' => $adsRows,
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
