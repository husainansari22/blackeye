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
    return [
        'url' => '/uploads/chat/' . $stored,
        'name' => $safeName,
        'mime' => $mime,
    ];
}

/**
 * Credit seller balance; if balance is negative (debt), sale proceeds reduce the owing first.
 * Call inside an open transaction when possible.
 */
function credit_seller_balance(PDO $pdo, int $sellerId, float $amount, string $note): void {
    $amount = (float)money_f($amount);
    if ($amount <= 0) return;
    $chk = $pdo->prepare('SELECT balance FROM users WHERE id = ? FOR UPDATE');
    $chk->execute([$sellerId]);
    $row = $chk->fetch();
    if (!$row) throw new RuntimeException('Seller not found');
    $bal = (float)$row['balance'];
    $pdo->prepare('UPDATE users SET balance = balance + ? WHERE id = ?')->execute([money_f($amount), $sellerId]);
    $newBal = $bal + $amount;
    $txNote = $note;
    if ($bal < 0) {
        $applied = min($amount, abs($bal));
        $txNote .= ' · $' . money_f($applied) . ' applied to seller debt';
        if ($newBal < 0) {
            $txNote .= ' · still owing $' . money_f(abs($newBal));
        }
    }
    $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'sale\', ?, \'completed\', ?)')
        ->execute([$sellerId, money_f($amount), $txNote]);
}

/**
 * Refund buyer and deduct seller; allows negative seller balance (owing).
 */
function refund_order_with_debt(array $order, string $actorNote = 'Refund'): void {
    ensure_marketplace_extras();
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
            // Allow going negative — seller owes the platform/buyer remainder
            $pdo->prepare('UPDATE users SET balance = balance - ? WHERE id = ?')
                ->execute([money_f($price), $sellerId]);
            $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'refund\', ?, \'completed\', ?)')
                ->execute([$sellerId, money_f($price), 'Seller debit #' . $publicId . ' · ' . $actorNote]);
        }
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
    $sellerMsg = 'Order #' . $publicId . ' refunded. $' . money_f($price) . ' deducted from your balance.';
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
    $price = (float)$order['price'];
    $sellerId = (int)$order['seller_id'];
    $orderId = (int)$order['id'];
    $publicId = (string)$order['public_id'];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE users SET escrow_balance = GREATEST(0, escrow_balance - ?) WHERE id = ?')
            ->execute([money_f($price), $sellerId]);
        credit_seller_balance($pdo, $sellerId, $price, 'Released #' . $publicId . ($noteSuffix !== '' ? ' · ' . $noteSuffix : ''));
        $pdo->prepare("UPDATE orders SET status = 'completed', completed_at = NOW() WHERE id = ?")->execute([$orderId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    notify_user($sellerId, 'Funds released', 'Escrow for #' . $publicId . ' was released to your balance.', 'order');
    notify_user((int)$order['buyer_id'], 'Order completed', 'Seller delivered login details for #' . $publicId . '.', 'order');
}

function map_order_message(array $m): array {
    return [
        'id' => (int)$m['id'],
        'orderId' => (int)$m['order_id'],
        'fromName' => $m['fromName'] ?? $m['from_name'] ?? '',
        'fromEmail' => $m['fromEmail'] ?? $m['from_email'] ?? '',
        'text' => $m['body'] ?? $m['text'] ?? '',
        'body' => $m['body'] ?? '',
        'attachmentUrl' => $m['attachment_url'] ?? null,
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
