<?php
declare(strict_types=1);

/**
 * Reviews, reports, chat attachments, debt-aware credits, AI credential delivery.
 */

function ensure_marketplace_extras(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    ensure_support_tables();

    try {
        db()->exec("CREATE TABLE IF NOT EXISTS seller_reviews (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          order_id INT UNSIGNED NOT NULL,
          seller_id INT UNSIGNED NOT NULL,
          buyer_id INT UNSIGNED NOT NULL,
          rating TINYINT UNSIGNED NOT NULL,
          comment TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_order_review (order_id),
          INDEX (seller_id),
          INDEX (buyer_id),
          CONSTRAINT fk_rev_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          CONSTRAINT fk_rev_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_rev_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}

    try {
        db()->exec("CREATE TABLE IF NOT EXISTS seller_reports (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          order_id INT UNSIGNED NOT NULL,
          reporter_id INT UNSIGNED NOT NULL,
          seller_id INT UNSIGNED NOT NULL,
          reason VARCHAR(500) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX (seller_id),
          INDEX (status),
          CONSTRAINT fk_rep_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          CONSTRAINT fk_rep_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_rep_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}

    foreach ([
        'attachment_url' => "ALTER TABLE support_messages ADD COLUMN attachment_url VARCHAR(500) NULL AFTER body",
        'attachment_name' => "ALTER TABLE support_messages ADD COLUMN attachment_name VARCHAR(200) NULL AFTER attachment_url",
        'attachment_mime' => "ALTER TABLE support_messages ADD COLUMN attachment_mime VARCHAR(120) NULL AFTER attachment_name",
    ] as $col => $sql) {
        try {
            db()->query("SELECT {$col} FROM support_messages LIMIT 1");
        } catch (Throwable $e) {
            try { db()->exec($sql); } catch (Throwable $e2) {}
        }
    }

    foreach ([
        'attachment_url' => "ALTER TABLE messages ADD COLUMN attachment_url VARCHAR(500) NULL AFTER body",
        'attachment_name' => "ALTER TABLE messages ADD COLUMN attachment_name VARCHAR(200) NULL AFTER attachment_url",
        'attachment_mime' => "ALTER TABLE messages ADD COLUMN attachment_mime VARCHAR(120) NULL AFTER attachment_name",
    ] as $col => $sql) {
        try {
            db()->query("SELECT {$col} FROM messages LIMIT 1");
        } catch (Throwable $e) {
            try { db()->exec($sql); } catch (Throwable $e2) {}
        }
    }

    foreach ([
        'platform_fee' => "ALTER TABLE orders ADD COLUMN platform_fee DECIMAL(12,2) NULL AFTER price",
        'seller_net' => "ALTER TABLE orders ADD COLUMN seller_net DECIMAL(12,2) NULL AFTER platform_fee",
    ] as $col => $sql) {
        try {
            db()->query("SELECT {$col} FROM orders LIMIT 1");
        } catch (Throwable $e) {
            try { db()->exec($sql); } catch (Throwable $e2) {}
        }
    }

    $uploadDir = dirname(__DIR__) . '/uploads/chat';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }
    $ht = $uploadDir . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|phar)$\">\nDeny from all\n</FilesMatch>\n");
    }
}

/**
 * Save a base64 data-URL or raw base64 chat attachment. Returns public URL path.
 */
function save_chat_attachment(string $data, string $filename = '', string $mimeHint = ''): array {
    ensure_marketplace_extras();
    $mime = $mimeHint;
    $bin = '';
    if (preg_match('#^data:([^;]+);base64,(.+)$#s', $data, $m)) {
        $mime = $m[1];
        $bin = base64_decode($m[2], true);
    } else {
        $bin = base64_decode($data, true);
    }
    if ($bin === false || $bin === '') {
        throw new RuntimeException('Invalid attachment data');
    }
    if (strlen($bin) > 8 * 1024 * 1024) {
        throw new RuntimeException('Attachment too large (max 8MB)');
    }
    $mime = strtolower(trim($mime ?: 'application/octet-stream'));
    $allowed = [
        'image/jpeg' => 'jpg', 'image/jpg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif',
        'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heif',
        'application/pdf' => 'pdf', 'text/plain' => 'txt',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/zip' => 'zip',
    ];
    if (!isset($allowed[$mime])) {
        // sniff images
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detected = $finfo->buffer($bin) ?: '';
        if (isset($allowed[$detected])) {
            $mime = $detected;
        } else {
            throw new RuntimeException('File type not allowed. Use images, PDF, or common docs.');
        }
    }
    $ext = $allowed[$mime];
    $safeName = preg_replace('/[^a-zA-Z0-9._-]+/', '_', basename($filename ?: ('file.' . $ext)));
    if ($safeName === '' || $safeName === '_') $safeName = 'file.' . $ext;
    $id = bin2hex(random_bytes(12));
    $stored = $id . '.' . $ext;
    $path = dirname(__DIR__) . '/uploads/chat/' . $stored;
    if (file_put_contents($path, $bin) === false) {
        throw new RuntimeException('Could not save attachment');
    }
    @chmod($path, 0644);
    if (!is_file($path) || filesize($path) < 1) {
        @unlink($path);
        throw new RuntimeException('Attachment saved but file is missing on disk');
    }
    return [
        'url' => chat_attachment_public_url($stored),
        'name' => $safeName,
        'mime' => $mime,
    ];
}

function chat_attachment_basename(string $urlOrName): string {
    $base = basename(parse_url($urlOrName, PHP_URL_PATH) ?: $urlOrName);
    return preg_match('/^[a-f0-9]{24}\.(png|jpe?g|gif|webp|heic|heif|pdf|txt|docx?|zip)$/i', $base) ? $base : '';
}

function chat_attachment_disk_path(string $basename): string {
    return dirname(__DIR__) . '/uploads/chat/' . $basename;
}

function chat_attachment_public_url(string $basename): string {
    return '/api/index.php?action=chat.file&f=' . rawurlencode($basename);
}

function serve_chat_attachment_file(string $basename): void {
    ensure_marketplace_extras();
    $path = chat_attachment_disk_path($basename);
    if (!is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Attachment not found';
        exit;
    }
    $mime = mime_content_type($path) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=86400');
    header('Content-Length: ' . (string)filesize($path));
    readfile($path);
    exit;
}

/**
 * Debit wallet for a purchase. Prefers spending deposit funds first so sales/referral
 * earnings remain withdrawable when possible.
 * Call inside an open transaction.
 */
function debit_user_for_purchase(PDO $pdo, int $userId, float $amount): void {
    ensure_wallet_ledger_columns();
    $amount = (float)money_f($amount);
    if ($amount <= 0) return;
    $chk = $pdo->prepare('SELECT balance, withdrawable_balance FROM users WHERE id = ? FOR UPDATE');
    $chk->execute([$userId]);
    $row = $chk->fetch();
    if (!$row) throw new RuntimeException('User not found');
    $bal = (float)$row['balance'];
    $wd = (float)$row['withdrawable_balance'];
    if ($bal < $amount) {
        throw new RuntimeException('Insufficient balance');
    }
    $depositPortion = max(0.0, $bal - max(0.0, $wd));
    $fromDeposit = min($amount, $depositPortion);
    $fromWithdrawable = (float)money_f($amount - $fromDeposit);
    $pdo->prepare('UPDATE users SET balance = balance - ?, withdrawable_balance = GREATEST(0, withdrawable_balance - ?) WHERE id = ?')
        ->execute([money_f($amount), money_f($fromWithdrawable), $userId]);
}

/**
 * Credit sales / referral earnings to balance + withdrawable_balance.
 * Deposits must NOT use this helper.
 * Call inside an open transaction when possible.
 */
function credit_withdrawable_earnings(PDO $pdo, int $userId, float $amount, string $type, string $note): float {
    ensure_wallet_ledger_columns();
    $amount = (float)money_f($amount);
    if ($amount <= 0) return 0.0;
    $chk = $pdo->prepare('SELECT balance, withdrawable_balance FROM users WHERE id = ? FOR UPDATE');
    $chk->execute([$userId]);
    $row = $chk->fetch();
    if (!$row) throw new RuntimeException('User not found');
    $bal = (float)$row['balance'];
    $withdrawableAdd = 0.0;
    if ($bal < 0) {
        $debt = abs($bal);
        if ($amount > $debt) {
            $withdrawableAdd = (float)money_f($amount - $debt);
        }
    } else {
        $withdrawableAdd = $amount;
    }
    $pdo->prepare('UPDATE users SET balance = balance + ?, withdrawable_balance = withdrawable_balance + ? WHERE id = ?')
        ->execute([money_f($amount), money_f($withdrawableAdd), $userId]);
    $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, ?, ?, \'completed\', ?)')
        ->execute([$userId, $type, money_f($amount), $note]);
    return $withdrawableAdd;
}

/**
 * AI sales settlement: deduct platform sales commission, credit net to seller withdrawable balance.
 * Example: $3 sale at 22% → commission $0.66, seller net $2.34.
 * Call inside an open transaction when possible.
 *
 * @return array{gross:float,commission:float,net:float,rate:float,withdrawableAdd:float}
 */
function credit_seller_balance(PDO $pdo, int $sellerId, float $grossAmount, string $note): array {
    ensure_wallet_ledger_columns();
    $split = sales_split($grossAmount);
    $gross = $split['gross'];
    $commission = $split['commission'];
    $net = $split['net'];
    $rate = $split['rate'];
    if ($gross <= 0) {
        return ['gross' => 0.0, 'commission' => 0.0, 'net' => 0.0, 'rate' => $rate, 'withdrawableAdd' => 0.0];
    }

    $chk = $pdo->prepare('SELECT balance FROM users WHERE id = ? FOR UPDATE');
    $chk->execute([$sellerId]);
    $row = $chk->fetch();
    if (!$row) throw new RuntimeException('Seller not found');
    $bal = (float)$row['balance'];

    $txNote = $note . ' · AI settlement: $' . money_f($gross) . ' sale − ' . round($rate * 100, 2) . '% platform fee ($' . money_f($commission) . ') → net $' . money_f($net);
    if ($bal < 0) {
        $applied = min($net, abs($bal));
        $txNote .= ' · $' . money_f($applied) . ' applied to seller debt';
        $newBal = $bal + $net;
        if ($newBal < 0) {
            $txNote .= ' · still owing $' . money_f(abs($newBal));
        }
    }

    $withdrawableAdd = credit_withdrawable_earnings($pdo, $sellerId, $net, 'sale', $txNote);

    if ($commission > 0) {
        $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'commission\', ?, \'completed\', ?)')
            ->execute([
                $sellerId,
                money_f($commission),
                'Platform sales commission (' . round($rate * 100, 2) . '%) on $' . money_f($gross) . ' · ' . $note,
            ]);
    }

    return [
        'gross' => $gross,
        'commission' => $commission,
        'net' => $net,
        'rate' => $rate,
        'withdrawableAdd' => $withdrawableAdd,
    ];
}

/**
 * Persist fee split on the order row for accurate refunds later.
 */
function record_order_sale_split(PDO $pdo, int $orderId, array $split): void {
    ensure_marketplace_extras();
    try {
        $pdo->prepare('UPDATE orders SET platform_fee = ?, seller_net = ? WHERE id = ?')
            ->execute([money_f($split['commission'] ?? 0), money_f($split['net'] ?? 0), $orderId]);
    } catch (Throwable $e) {
        // columns may not exist yet on very old DBs; ignore
    }
}

/**
 * Seller debit amount for a completed-order refund (net credited, not full sale price).
 */
function seller_refund_debit_amount(array $order): float {
    $price = (float)$order['price'];
    if (isset($order['seller_net']) && $order['seller_net'] !== null && $order['seller_net'] !== '') {
        return (float)money_f((float)$order['seller_net']);
    }
    $split = sales_split($price);
    return $split['net'];
}

/**
 * When a referred buyer has deposited ≥ threshold and completed ≥1 purchase, credit referrer.
 */
function maybe_credit_referral_reward(int $buyerId): void {
    ensure_wallet_ledger_columns();
    $reward = (float)money_f((float)setting_get('referral_reward_amount', app_config()['referral_reward_amount'] ?? 5));
    $minDeposit = (float)money_f((float)setting_get('referral_min_deposit', app_config()['referral_min_deposit'] ?? 50));
    if ($reward <= 0) return;

    $buyerStmt = db()->prepare('SELECT id, name, referred_by, total_deposits FROM users WHERE id = ? LIMIT 1');
    $buyerStmt->execute([$buyerId]);
    $buyer = $buyerStmt->fetch();
    if (!$buyer) return;
    $refCode = trim((string)($buyer['referred_by'] ?? ''));
    if ($refCode === '') return;
    if ((float)$buyer['total_deposits'] + 0.0001 < $minDeposit) return;

    $purchases = db()->prepare("SELECT COUNT(*) AS c FROM orders WHERE buyer_id = ? AND status IN ('completed','pending')");
    $purchases->execute([$buyerId]);
    if ((int)($purchases->fetch()['c'] ?? 0) < 1) return;

    $refStmt = db()->prepare('SELECT id, name FROM users WHERE referral_code = ? LIMIT 1');
    $refStmt->execute([$refCode]);
    $referrer = $refStmt->fetch();
    if (!$referrer || (int)$referrer['id'] === $buyerId) return;

    $dup = db()->prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'sale' AND note LIKE ? LIMIT 1");
    $dup->execute([(int)$referrer['id'], 'Referral reward%buyer #' . $buyerId . '%']);
    if ($dup->fetch()) return;

    // Use type sale-like earnings path via credit helper with type that ENUM allows: use 'sale' note tagged, or commission?
    // schema ENUM includes commission — use a distinct note with type that fits. Prefer inserting as sale isn't ideal.
    // ENUM: deposit,withdrawal,sale,purchase,refund,commission — no 'referral'. Use 'sale' with clear note, or extend.
    // Keep ENUM stable: record as completed 'sale' note "Referral reward..." so withdrawable credits work.
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $dup2 = $pdo->prepare("SELECT id FROM transactions WHERE user_id = ? AND note LIKE ? LIMIT 1 FOR UPDATE");
        $dup2->execute([(int)$referrer['id'], 'Referral reward%buyer #' . $buyerId . '%']);
        if ($dup2->fetch()) {
            $pdo->commit();
            return;
        }
        credit_withdrawable_earnings(
            $pdo,
            (int)$referrer['id'],
            $reward,
            'sale',
            'Referral reward · $' . money_f($reward) . ' · buyer #' . $buyerId . ' (' . ($buyer['name'] ?? '') . ')'
        );
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        return;
    }
    notify_user(
        (int)$referrer['id'],
        'Referral reward credited',
        'You earned $' . money_f($reward) . ' withdrawable balance — your invitee funded and purchased.',
        'wallet'
    );
}

/**
 * Refund buyer and deduct seller; allows negative seller balance (owing).
 * Completed sales debit only the seller net (after platform commission), not the full price.
 */
function refund_order_with_debt(array $order, string $actorNote = 'Refund'): void {
    ensure_marketplace_extras();
    ensure_wallet_ledger_columns();
    if (($order['status'] ?? '') === 'cancelled') {
        throw new RuntimeException('Already cancelled');
    }
    $price = (float)$order['price'];
    $sellerId = (int)$order['seller_id'];
    $buyerId = (int)$order['buyer_id'];
    $orderId = (int)$order['id'];
    $publicId = (string)$order['public_id'];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        if (($order['status'] ?? '') === 'pending') {
            $pdo->prepare('UPDATE users SET escrow_balance = GREATEST(0, escrow_balance - ?) WHERE id = ?')
                ->execute([money_f($price), $sellerId]);
        } else {
            $sellerDebit = seller_refund_debit_amount($order);
            // Allow going negative — seller owes the platform/buyer remainder
            $pdo->prepare('UPDATE users SET balance = balance - ?, withdrawable_balance = GREATEST(0, withdrawable_balance - ?) WHERE id = ?')
                ->execute([money_f($sellerDebit), money_f($sellerDebit), $sellerId]);
            $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'refund\', ?, \'completed\', ?)')
                ->execute([$sellerId, money_f($sellerDebit), 'Seller debit #' . $publicId . ' · net after commission · ' . $actorNote]);
        }
        // Buyer refund is full purchase price (deposits back as spendable, not withdrawable)
        $pdo->prepare('UPDATE users SET balance = balance + ? WHERE id = ?')->execute([money_f($price), $buyerId]);
        $pdo->prepare("UPDATE orders SET status = 'cancelled', refunded_at = NOW() WHERE id = ?")->execute([$orderId]);
        $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'refund\', ?, \'completed\', ?)')
            ->execute([$buyerId, money_f($price), 'Refund order #' . $publicId . ' · ' . $actorNote]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $chk = db()->prepare('SELECT balance FROM users WHERE id = ?');
    $chk->execute([$sellerId]);
    $sellerBal = (float)($chk->fetch()['balance'] ?? 0);
    notify_user($buyerId, 'Refund received', 'Order #' . $publicId . ' was refunded ($' . money_f($price) . ').', 'refund');
    $sellerMsg = 'Order #' . $publicId . ' refunded. $' . money_f(seller_refund_debit_amount($order)) . ' deducted from your balance.';
    if (($order['status'] ?? '') === 'pending') {
        $sellerMsg = 'Order #' . $publicId . ' refunded. Escrow of $' . money_f($price) . ' was released.';
    }
    if ($sellerBal < 0) {
        $sellerMsg .= ' You owe $' . money_f(abs($sellerBal)) . ' — future sales will repay this automatically.';
    }
    notify_user($sellerId, 'Refund issued', $sellerMsg, 'refund');
}

/**
 * AI heuristic: does this seller message look like login details were delivered?
 */
function ai_detect_credentials_delivered(string $text): array {
    $t = trim($text);
    if ($t === '') {
        return ['ok' => false, 'confidence' => 0, 'reason' => 'Empty message'];
    }
    $lower = strtolower($t);
    $score = 0;
    $hits = [];
    $patterns = [
        'user' => '/\b(user(name)?|login|email|account)\b/i',
        'pass' => '/\b(pass(word)?|pwd|passcode)\b/i',
        'cred' => '/\b(credential|login details|account details|here (are|is) (the |your )?login)\b/i',
        'colon_pair' => '/\b(user(name)?|email|login)\s*[:=]\s*\S+/i',
        'pass_pair' => '/\b(pass(word)?|pwd)\s*[:=]\s*\S+/i',
        'at_email' => '/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i',
    ];
    foreach ($patterns as $k => $re) {
        if (preg_match($re, $t)) {
            $score += ($k === 'pass_pair' || $k === 'colon_pair') ? 2 : 1;
            $hits[] = $k;
        }
    }
    // Lines that look like key:value
    if (preg_match_all('/^[^\n:]{2,40}:\s*\S+/m', $t, $m) && count($m[0]) >= 2) {
        $score += 2;
        $hits[] = 'kv_lines';
    }
    $ok = $score >= 3 && (in_array('pass', $hits, true) || in_array('pass_pair', $hits, true) || in_array('cred', $hits, true));
    return [
        'ok' => $ok,
        'confidence' => min(1, $score / 6),
        'score' => $score,
        'hits' => $hits,
        'reason' => $ok
            ? 'AI detected login details in the seller message.'
            : 'Message does not look like complete login details yet.',
        'reviewed_by' => 'AI Delivery Check',
    ];
}

function release_pending_order_to_seller(array $order, string $noteSuffix = ''): void {
    if (($order['status'] ?? '') !== 'pending') {
        throw new RuntimeException('Order is not pending escrow');
    }
    ensure_marketplace_extras();
    $price = (float)$order['price'];
    $sellerId = (int)$order['seller_id'];
    $orderId = (int)$order['id'];
    $publicId = (string)$order['public_id'];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE users SET escrow_balance = GREATEST(0, escrow_balance - ?) WHERE id = ?')
            ->execute([money_f($price), $sellerId]);
        $split = credit_seller_balance($pdo, $sellerId, $price, 'Released #' . $publicId . ($noteSuffix !== '' ? ' · ' . $noteSuffix : ''));
        record_order_sale_split($pdo, $orderId, $split);
        $pdo->prepare("UPDATE orders SET status = 'completed', completed_at = NOW() WHERE id = ?")->execute([$orderId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $net = money_f($split['net'] ?? 0);
    $fee = money_f($split['commission'] ?? 0);
    notify_user($sellerId, 'Funds released', 'Escrow for #' . $publicId . ' was settled: $' . $net . ' credited to withdrawable balance after $' . $fee . ' platform fee.', 'order');
    notify_user((int)$order['buyer_id'], 'Order completed', 'Seller delivered login details for #' . $publicId . '.', 'order');
}

function map_order_message(array $m): array {
    $url = $m['attachment_url'] ?? null;
    if ($url) {
        $base = chat_attachment_basename((string)$url);
        if ($base !== '') {
            $url = chat_attachment_public_url($base);
        }
    }
    return [
        'id' => (int)$m['id'],
        'orderId' => (int)$m['order_id'],
        'fromName' => $m['fromName'] ?? $m['from_name'] ?? '',
        'fromEmail' => $m['fromEmail'] ?? $m['from_email'] ?? '',
        'text' => $m['body'] ?? $m['text'] ?? '',
        'body' => $m['body'] ?? '',
        'attachmentUrl' => $url,
        'attachmentName' => $m['attachment_name'] ?? null,
        'attachmentMime' => $m['attachment_mime'] ?? null,
        'createdAt' => $m['created_at'] ?? null,
    ];
}

function seller_rating_summary(int $sellerId): array {
    ensure_marketplace_extras();
    $stmt = db()->prepare('SELECT COUNT(*) AS cnt, COALESCE(AVG(rating),0) AS avg_rating FROM seller_reviews WHERE seller_id = ?');
    $stmt->execute([$sellerId]);
    $row = $stmt->fetch() ?: ['cnt' => 0, 'avg_rating' => 0];
    return [
        'count' => (int)$row['cnt'],
        'average' => round((float)$row['avg_rating'], 2),
    ];
}

function ensure_merchant_slug_column(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->query('SELECT merchant_slug FROM users LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec("ALTER TABLE users ADD COLUMN merchant_slug VARCHAR(64) NULL AFTER referral_code");
        } catch (Throwable $e2) {}
    }
    try {
        $hasIndex = db()->query("SHOW INDEX FROM users WHERE Key_name = 'uniq_users_merchant_slug'")->fetchAll();
        if (!$hasIndex) {
            db()->exec("ALTER TABLE users ADD UNIQUE KEY uniq_users_merchant_slug (merchant_slug)");
        }
    } catch (Throwable $e) {}
}

/** Assign a permanent merchant slug once the seller has uploaded at least one listing. */
function ensure_merchant_slug(int $userId): ?string {
    if ($userId < 1) return null;
    ensure_merchant_slug_column();
    $stmt = db()->prepare('SELECT merchant_slug FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $existing = trim((string)($stmt->fetchColumn() ?: ''));
    if ($existing !== '') return $existing;

    $cnt = db()->prepare('SELECT COUNT(*) FROM ads WHERE seller_id = ?');
    $cnt->execute([$userId]);
    if ((int)$cnt->fetchColumn() < 1) return null;

    for ($i = 0; $i < 10; $i++) {
        $slug = sprintf(
            '%s-%s-%s-%s-%s',
            bin2hex(random_bytes(4)),
            bin2hex(random_bytes(2)),
            bin2hex(random_bytes(2)),
            bin2hex(random_bytes(2)),
            bin2hex(random_bytes(6))
        );
        try {
            $upd = db()->prepare("UPDATE users SET merchant_slug = ? WHERE id = ? AND (merchant_slug IS NULL OR merchant_slug = '')");
            $upd->execute([$slug, $userId]);
            if ($upd->rowCount() > 0) return $slug;
        } catch (Throwable $e) {}
        $chk = db()->prepare('SELECT merchant_slug FROM users WHERE id = ? LIMIT 1');
        $chk->execute([$userId]);
        $got = trim((string)($chk->fetchColumn() ?: ''));
        if ($got !== '') return $got;
    }
    return null;
}

function user_has_uploaded_ads(int $userId): bool {
    if ($userId < 1) return false;
    $cnt = db()->prepare('SELECT COUNT(*) FROM ads WHERE seller_id = ?');
    $cnt->execute([$userId]);
    return (int)$cnt->fetchColumn() >= 1;
}

function user_merchant_link(array $u): array {
    $sid = (int)($u['id'] ?? 0);
    if ($sid < 1 || !user_has_uploaded_ads($sid)) {
        return ['merchantSlug' => null, 'merchantLink' => null];
    }
    $slug = ensure_merchant_slug($sid);
    if (!$slug) {
        return ['merchantSlug' => null, 'merchantLink' => null];
    }
    return [
        'merchantSlug' => $slug,
        'merchantLink' => 'https://acctsuite.com/seller/' . $slug,
    ];
}

function seller_storefront_stats(int $sellerId): array {
    ensure_marketplace_extras();
    $rating = seller_rating_summary($sellerId);
    $totalReviews = (int)$rating['count'];
    $posStmt = db()->prepare('SELECT COUNT(*) FROM seller_reviews WHERE seller_id = ? AND rating >= 4');
    $posStmt->execute([$sellerId]);
    $positive = (int)$posStmt->fetchColumn();
    $negative = max(0, $totalReviews - $positive);
    $posPct = $totalReviews > 0 ? (int)round($positive / $totalReviews * 100) : 0;
    $negPct = $totalReviews > 0 ? 100 - $posPct : 0;

    $salesStmt = db()->prepare("SELECT COUNT(*) FROM orders WHERE seller_id = ? AND status = 'completed'");
    $salesStmt->execute([$sellerId]);
    $totalSold = (int)$salesStmt->fetchColumn();

    $adsStmt = db()->prepare("SELECT COUNT(*) FROM ads WHERE seller_id = ? AND status = 'active' AND stock > 0");
    $adsStmt->execute([$sellerId]);
    $activeAds = (int)$adsStmt->fetchColumn();

    $cancelStmt = db()->prepare("SELECT COUNT(*) FROM orders WHERE seller_id = ? AND status = 'cancelled'");
    $cancelStmt->execute([$sellerId]);
    $cancelledOrders = (int)$cancelStmt->fetchColumn();

    return [
        'totalReviews' => $totalReviews,
        'positivePct' => $posPct,
        'negativePct' => $negPct,
        'totalSold' => $totalSold,
        'activeAds' => $activeAds,
        'cancelledOrders' => $cancelledOrders,
        'ratingAverage' => $rating['average'],
    ];
}
