<?php
declare(strict_types=1);

/**
 * Marketplace commerce features: cart, wishlist, public listing pages, seller storefronts,
 * disputes/warranty window, and the off-platform-contact guard used by order chat.
 */

/**
 * Thrown by commerce helpers so callers can map a stable error code + HTTP status
 * back to the API response without string-matching messages.
 */
class MarketplaceException extends RuntimeException {
    public string $errorCode;
    public int $httpStatus;

    public function __construct(string $message, string $errorCode = 'error', int $httpStatus = 400) {
        parent::__construct($message);
        $this->errorCode = $errorCode;
        $this->httpStatus = $httpStatus;
    }
}

function ensure_commerce_features(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    ensure_marketplace_extras();
    ensure_wallet_ledger_columns();

    try {
        db()->exec("CREATE TABLE IF NOT EXISTS cart_items (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          listing_id INT UNSIGNED NOT NULL,
          qty INT UNSIGNED NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_cart_user_listing (user_id, listing_id),
          INDEX (listing_id),
          CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_cart_listing FOREIGN KEY (listing_id) REFERENCES ads(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}

    try {
        db()->exec("CREATE TABLE IF NOT EXISTS wishlist_items (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          listing_id INT UNSIGNED NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_wish_user_listing (user_id, listing_id),
          INDEX (listing_id),
          CONSTRAINT fk_wish_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_wish_listing FOREIGN KEY (listing_id) REFERENCES ads(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}

    try {
        db()->exec("CREATE TABLE IF NOT EXISTS disputes (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          order_id INT UNSIGNED NOT NULL,
          buyer_id INT UNSIGNED NOT NULL,
          seller_id INT UNSIGNED NOT NULL,
          reason TEXT NOT NULL,
          status ENUM('open','under_review','resolved_refund','resolved_denied','expired','closed') NOT NULL DEFAULT 'open',
          evidence_json TEXT NULL,
          admin_note TEXT NULL,
          reviewed_by VARCHAR(80) NULL,
          reviewed_at DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_dispute_order (order_id),
          INDEX (buyer_id),
          INDEX (seller_id),
          INDEX (status),
          CONSTRAINT fk_dispute_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          CONSTRAINT fk_dispute_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_dispute_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}

    foreach ([
        'dispute_deadline_at' => "ALTER TABLE orders ADD COLUMN dispute_deadline_at DATETIME NULL AFTER refunded_at",
        'dispute_expired_at' => "ALTER TABLE orders ADD COLUMN dispute_expired_at DATETIME NULL AFTER dispute_deadline_at",
        'funds_released_at' => "ALTER TABLE orders ADD COLUMN funds_released_at DATETIME NULL AFTER dispute_expired_at",
        'warranty_until' => "ALTER TABLE orders ADD COLUMN warranty_until DATETIME NULL AFTER funds_released_at",
        'order_status_step' => "ALTER TABLE orders ADD COLUMN order_status_step VARCHAR(40) NULL AFTER warranty_until",
    ] as $col => $sql) {
        try {
            db()->query("SELECT {$col} FROM orders LIMIT 1");
        } catch (Throwable $e) {
            try { db()->exec($sql); } catch (Throwable $e2) {}
        }
    }

    try {
        db()->query('SELECT public_slug FROM ads LIMIT 1');
    } catch (Throwable $e) {
        try { db()->exec("ALTER TABLE ads ADD COLUMN public_slug VARCHAR(80) NULL AFTER id"); } catch (Throwable $e2) {}
    }
    try {
        $hasIndex = db()->query("SHOW INDEX FROM ads WHERE Key_name = 'uniq_ads_public_slug'")->fetchAll();
        if (!$hasIndex) {
            db()->exec("ALTER TABLE ads ADD UNIQUE KEY uniq_ads_public_slug (public_slug)");
        }
    } catch (Throwable $e) {
        // duplicates already present or engine doesn't allow it right now — skip, not fatal
    }

    // Backfill warranty window for historical completed orders that predate this feature.
    try {
        db()->exec("UPDATE orders SET warranty_until = DATE_ADD(created_at, INTERVAL 24 HOUR) WHERE warranty_until IS NULL AND status = 'completed'");
    } catch (Throwable $e) {}
}

/** ORDER BY clause used to randomize the public marketplace feed on every request. */
function market_list_sql_order(): string {
    return 'ORDER BY RAND()';
}

function ad_slug_generate(string $title): string {
    $base = strtolower(trim($title));
    $base = preg_replace('/[^a-z0-9]+/', '-', $base) ?? '';
    $base = trim($base, '-');
    if ($base === '') $base = 'listing';
    if (strlen($base) > 50) $base = substr($base, 0, 50);
    return trim($base, '-');
}

/**
 * Lazily assigns a unique public slug to a listing (used for public /listing/<slug> pages).
 * Accepts a partial ad row (id, title, public_slug) so callers can pass rows from any query.
 */
function ensure_ad_public_slug(array $ad): string {
    $existing = trim((string)($ad['public_slug'] ?? ''));
    if ($existing !== '') return $existing;
    $adId = (int)($ad['id'] ?? 0);
    if ($adId < 1) return '';
    ensure_commerce_features();
    $base = ad_slug_generate((string)($ad['title'] ?? 'listing'));
    for ($i = 0; $i < 8; $i++) {
        $candidate = $base . '-' . substr(bin2hex(random_bytes(4)), 0, 6);
        try {
            $stmt = db()->prepare("UPDATE ads SET public_slug = ? WHERE id = ? AND (public_slug IS NULL OR public_slug = '')");
            $stmt->execute([$candidate, $adId]);
            if ($stmt->rowCount() > 0) {
                return $candidate;
            }
        } catch (Throwable $e) {
            // slug collision — try another random suffix
        }
        $chk = db()->prepare('SELECT public_slug FROM ads WHERE id = ? LIMIT 1');
        $chk->execute([$adId]);
        $slug = (string)($chk->fetchColumn() ?: '');
        if ($slug !== '') return $slug;
    }
    return '';
}

/**
 * Heuristic guard for order chat: blocks attempts to move the conversation off-platform
 * (WhatsApp/Telegram/Signal/etc., wa.me/t.me links, phone numbers, "DM me" style invites).
 * Deliberately does NOT block normal delivery of the account being sold (usernames,
 * passwords, emails, 2FA codes) — only messages that read as an invitation to chat elsewhere.
 */
function ai_blocks_external_contact(string $text): array {
    $t = trim($text);
    if ($t === '') {
        return ['blocked' => false, 'reason' => ''];
    }
    $lower = mb_strtolower($t);

    // Direct off-platform links are always blocked, regardless of surrounding context.
    $linkPatterns = [
        '/\bwa\.me\//i' => 'Links to WhatsApp are not allowed here. Please keep all contact on Acctventa.',
        '/\bapi\.whatsapp\.com\b/i' => 'Links to WhatsApp are not allowed here. Please keep all contact on Acctventa.',
        '/\bt\.me\//i' => 'Links to Telegram are not allowed here. Please keep all contact on Acctventa.',
        '/\btelegram\.me\//i' => 'Links to Telegram are not allowed here. Please keep all contact on Acctventa.',
        '/\bsignal\.me\//i' => 'Links to Signal are not allowed here. Please keep all contact on Acctventa.',
        '/\bdiscord\.gg\//i' => 'Discord invite links are not allowed here. Please keep all contact on Acctventa.',
        '/\bm\.me\//i' => 'Messenger links are not allowed here. Please keep all contact on Acctventa.',
    ];
    foreach ($linkPatterns as $re => $reason) {
        if (preg_match($re, $t)) {
            return ['blocked' => true, 'reason' => $reason];
        }
    }

    // Short, unambiguous invitations to chat elsewhere.
    $shortInvites = [
        '/\bdm\s*me\b/i',
        '/\bdm\s+@/i',
        '/\binbox\s*me\b/i',
        '/\bhit\s+me\s+up\b/i',
        '/\bmessage\s+me\s+on\b/i',
        '/\bcontact\s+me\s+on\b/i',
        '/\breach\s+me\s+on\b/i',
        '/\btext\s+me\s+on\b/i',
        '/\bcall\s+me\s+on\b/i',
        '/\badd\s+me\s+on\b/i',
        '/\bwhatsapp\s+me\b/i',
        '/\btelegram\s+me\b/i',
        '/\bfind\s+me\s+on\b/i',
        '/\boutside\s+(the\s+|this\s+)?(platform|app|site|acctventa)\b/i',
        '/\boff[\s-]?platform\b/i',
        '/\blet\'?s\s+(talk|chat|continue)\s+(on|via|through)\b/i',
        '/\bmove\s+(this|our\s+chat)\s+to\b/i',
        '/\bdirect\s+message\s+me\b/i',
    ];
    foreach ($shortInvites as $re) {
        if (preg_match($re, $lower)) {
            return ['blocked' => true, 'reason' => 'Please keep all communication on Acctventa. Invitations to chat elsewhere are not allowed.'];
        }
    }

    // A named messaging app mentioned alongside a handle or number reads as "here is where to reach me".
    $mentionsApp = preg_match('/\b(whatsapp|telegram|signal|viber|wechat|snapchat|discord|skype|imo|kik)\b/i', $lower);
    $hasHandleOrNumber = preg_match('/(@[\w.]{2,30}|\+?\d[\d\-\s]{6,14}\d)/', $t);
    if ($mentionsApp && $hasHandleOrNumber) {
        return ['blocked' => true, 'reason' => 'Sharing a messaging app handle or number is not allowed. Keep communication on Acctventa.'];
    }

    // "my ig/telegram/whatsapp is @handle" style contact-sharing.
    if (preg_match('/\b(my|add|follow|find)\s+(ig|insta|instagram|snap|snapchat|telegram|whatsapp|discord|twitter|x)\s*(is|:)?\s*@?[\w.]{2,30}/i', $lower)) {
        return ['blocked' => true, 'reason' => 'Sharing a social handle to contact you outside Acctventa is not allowed.'];
    }

    // A phone-number-looking digit run mentioned together with contact verbs.
    $looksLikePhone = preg_match('/\+?\d[\d\-\s]{7,16}\d/', $t);
    $contactVerb = preg_match('/\b(call|text|whatsapp|number|reach|contact\s+me|phone)\b/i', $lower);
    if ($looksLikePhone && $contactVerb) {
        return ['blocked' => true, 'reason' => 'Sharing a phone number to contact you outside Acctventa is not allowed.'];
    }

    return ['blocked' => false, 'reason' => ''];
}

/**
 * Starts the 60-minute dispute window + 24h warranty for an order and marks when funds
 * were considered "released" to the seller. Call inside the same transaction that credits
 * the seller when possible.
 */
function order_set_dispute_window(PDO $pdo, int $orderId, int $minutes = 60): void {
    ensure_commerce_features();
    $pdo->prepare("UPDATE orders SET
            dispute_deadline_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
            warranty_until = DATE_ADD(NOW(), INTERVAL 24 HOUR),
            funds_released_at = NOW()
        WHERE id = ?")->execute([$minutes, $orderId]);
}

/** True while the buyer may still open a dispute on this order. */
function dispute_window_open(array $order): bool {
    $deadline = $order['dispute_deadline_at'] ?? null;
    if (!$deadline) return false;
    $ts = strtotime((string)$deadline);
    if ($ts === false) return false;
    return $ts >= time();
}

/** Opportunistically stamps dispute_expired_at once the window has lapsed with no dispute filed. */
function order_mark_dispute_expired_if_needed(array $order): void {
    if (dispute_window_open($order)) return;
    if (empty($order['dispute_deadline_at']) || !empty($order['dispute_expired_at'])) return;
    try {
        db()->prepare('UPDATE orders SET dispute_expired_at = NOW() WHERE id = ? AND dispute_expired_at IS NULL')
            ->execute([(int)$order['id']]);
    } catch (Throwable $e) {}
}

/**
 * Dispute / warranty resolution in the buyer's favor: deducts the sale amount from the
 * seller (net proceeds, and — unless disabled — the platform commission too, since the sale
 * is being unwound) and credits the buyer the full price back. Seller balance may go negative,
 * same as refund_order_with_debt(). Marks the order cancelled/refunded.
 */
function admin_deduct_seller_refund_buyer(array $order, string $actorNote = 'Dispute resolution', bool $refundCommission = true): void {
    ensure_marketplace_extras();
    ensure_wallet_ledger_columns();
    ensure_commerce_features();
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
    $sellerDebit = 0.0;
    try {
        if (($order['status'] ?? '') === 'pending') {
            $pdo->prepare('UPDATE users SET escrow_balance = GREATEST(0, escrow_balance - ?) WHERE id = ?')
                ->execute([money_f($price), $sellerId]);
        } else {
            $sellerNet = seller_refund_debit_amount($order);
            if (isset($order['platform_fee']) && $order['platform_fee'] !== null && $order['platform_fee'] !== '') {
                $commission = (float)$order['platform_fee'];
            } else {
                $commission = sales_split($price)['commission'];
            }
            $sellerDebit = $refundCommission ? (float)money_f($sellerNet + $commission) : (float)money_f($sellerNet);
            // Allow going negative — seller owes the platform/buyer remainder.
            $pdo->prepare('UPDATE users SET balance = balance - ?, withdrawable_balance = GREATEST(0, withdrawable_balance - ?) WHERE id = ?')
                ->execute([money_f($sellerDebit), money_f($sellerDebit), $sellerId]);
            $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'refund\', ?, \'completed\', ?)')
                ->execute([$sellerId, money_f($sellerDebit), 'Seller debit #' . $publicId . ' · ' . $actorNote]);
        }
        // Buyer refund is the full purchase price (deposits back as spendable, not withdrawable).
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
    notify_user($buyerId, 'Refund received', 'Order #' . $publicId . ' was refunded ($' . money_f($price) . ') after review.', 'refund');
    $sellerMsg = 'Order #' . $publicId . ' was refunded after review. $' . money_f($sellerDebit) . ' deducted from your balance.';
    if (($order['status'] ?? '') === 'pending') {
        $sellerMsg = 'Order #' . $publicId . ' was refunded after review. Escrow of $' . money_f($price) . ' was released.';
    }
    if ($sellerBal < 0) {
        $sellerMsg .= ' You owe $' . money_f(abs($sellerBal)) . ' — future sales will repay this automatically.';
    }
    notify_user($sellerId, 'Refund issued', $sellerMsg, 'refund');
}

/**
 * Core "buy one unit of a listing" transaction shared by orders.buy and cart.checkout.
 * Mirrors the original orders.buy logic exactly (debit buyer, credit/escrow seller,
 * decrement stock, notify + email both sides, referral check) so behavior is unchanged.
 */
function purchase_listing(int $buyerId, int $listingId): array {
    ensure_wallet_ledger_columns();
    ensure_marketplace_extras();
    ensure_commerce_features();

    $buyerStmt = db()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $buyerStmt->execute([$buyerId]);
    $buyer = $buyerStmt->fetch();
    if (!$buyer) throw new MarketplaceException('Account not found', 'not_found', 404);

    $stmt = db()->prepare("SELECT a.*, u.email AS seller_email, u.name AS seller_name FROM ads a JOIN users u ON u.id = a.seller_id WHERE a.id = ? AND a.status = 'active' AND a.stock > 0 LIMIT 1");
    $stmt->execute([$listingId]);
    $ad = $stmt->fetch();
    if (!$ad) throw new MarketplaceException('Listing unavailable', 'listing_unavailable', 404);
    if ((int)$ad['seller_id'] === $buyerId) throw new MarketplaceException('Cannot buy your own listing', 'own_listing', 400);
    $price = (float)$ad['price'];
    if ((float)$buyer['balance'] < $price) {
        throw new MarketplaceException('Insufficient funds. Please deposit money into your wallet.', 'insufficient_funds', 400);
    }

    $pdo = db();
    $pdo->beginTransaction();
    $saleSplit = null;
    $publicId = '';
    $status = '';
    $orderId = 0;
    $creds = '';
    $step = 'paid';
    try {
        debit_user_for_purchase($pdo, $buyerId, $price);
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
        $step = $status === 'completed' ? 'delivered' : 'paid';
        $pdo->prepare('INSERT INTO orders (public_id, listing_id, buyer_id, seller_id, title, category, price, status, credentials_json, completed_at, order_status_step)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)')->execute([
            $publicId, $listingId, $buyerId, (int)$ad['seller_id'], $ad['title'], $ad['category'], money_f($price), $status, $creds,
            $status === 'completed' ? date('Y-m-d H:i:s') : null,
            $step,
        ]);
        $orderId = (int)$pdo->lastInsertId();
        if ($status === 'completed') {
            $saleSplit = credit_seller_balance($pdo, (int)$ad['seller_id'], $price, 'Sold #' . $publicId);
            record_order_sale_split($pdo, $orderId, $saleSplit);
            order_set_dispute_window($pdo, $orderId);
        } else {
            $pdo->prepare('UPDATE users SET escrow_balance = escrow_balance + ? WHERE id = ?')->execute([money_f($price), (int)$ad['seller_id']]);
        }
        $newStock = max(0, (int)$ad['stock'] - 1);
        $newAdStatus = $newStock <= 0 ? 'removed' : (string)$ad['status'];
        $pdo->prepare('UPDATE ads SET stock = ?, status = ? WHERE id = ?')->execute([$newStock, $newAdStatus, $listingId]);
        $pdo->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, \'purchase\', ?, \'completed\', ?)')
            ->execute([$buyerId, money_f($price), 'Bought #' . $publicId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    notify_user($buyerId, 'Order placed', 'You purchased ' . $ad['title'] . ' · TXID ' . $publicId, 'order');
    $sellerNetNote = '';
    if ($saleSplit) {
        $sellerNetNote = ' AI deducted ' . round(($saleSplit['rate'] ?? 0) * 100, 2) . '% ($' . money_f($saleSplit['commission']) . '); $' . money_f($saleSplit['net']) . ' added to withdrawable balance.';
        notify_user((int)$ad['seller_id'], 'New sale — congratulations!', $buyer['name'] . ' purchased ' . $ad['title'] . ' · TXID ' . $publicId . '.' . $sellerNetNote, 'order');
    } else {
        notify_user((int)$ad['seller_id'], 'New sale — congratulations!', $buyer['name'] . ' purchased ' . $ad['title'] . ' · TXID ' . $publicId, 'order');
    }
    $sellerReleaseNote = $status === 'pending'
        ? 'Funds are on hold in escrow until you send the buyer the login details in order chat. AI will release funds when credentials are detected (platform sales commission applies on release).'
        : ('AI sales settlement credited $' . money_f($saleSplit['net'] ?? 0) . ' to your withdrawable balance after platform commission (any seller debt was repaid first).');
    try {
        $buyerMail = email_order_notice($buyer['name'], $ad['title'], 'buyer', money_f($price), $publicId);
        send_app_mail($buyer['email'], $buyerMail['subject'], $buyerMail['html'], $buyerMail['text']);
        $sellerMail = email_order_notice($ad['seller_name'], $ad['title'], 'seller', money_f($price), $publicId, $sellerReleaseNote);
        send_app_mail($ad['seller_email'], $sellerMail['subject'], $sellerMail['html'], $sellerMail['text']);
    } catch (Throwable $e) {}
    try {
        maybe_credit_referral_reward($buyerId);
    } catch (Throwable $e) {}

    $buyerBalance = null;
    try {
        $b = db()->prepare('SELECT balance FROM users WHERE id = ? LIMIT 1');
        $b->execute([$buyerId]);
        $row = $b->fetch();
        if ($row) $buyerBalance = (float)$row['balance'];
    } catch (Throwable $e) {}

    return [
        'orderId' => $orderId,
        'publicId' => $publicId,
        'status' => $status,
        'listingId' => $listingId,
        'title' => $ad['title'],
        'category' => $ad['category'] ?? '',
        'price' => $price,
        'sellerNet' => $saleSplit['net'] ?? null,
        'platformFee' => $saleSplit['commission'] ?? null,
        'credentials' => $creds !== '' ? json_decode($creds, true) : null,
        'sellerName' => $ad['seller_name'] ?? '',
        'sellerEmail' => $ad['seller_email'] ?? '',
        'sellerId' => (int)$ad['seller_id'],
        'orderStatusStep' => $step,
        'createdAt' => date('c'),
        'buyerBalance' => $buyerBalance,
    ];
}

function cart_list_for_user(int $userId): array {
    ensure_commerce_features();
    $stmt = db()->prepare("SELECT c.id AS cartId, c.qty, c.created_at AS addedAt,
            a.id AS listingId, a.title, a.price, a.category, a.preview_link AS previewLink, a.stock, a.status,
            a.public_slug AS publicSlug, a.seller_id AS sellerId, u.name AS sellerName
        FROM cart_items c
        JOIN ads a ON a.id = c.listing_id
        JOIN users u ON u.id = a.seller_id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC");
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['cartId'] = (int)$r['cartId'];
        $r['qty'] = (int)$r['qty'];
        $r['listingId'] = (int)$r['listingId'];
        $r['price'] = (float)$r['price'];
        $r['stock'] = (int)$r['stock'];
        $r['sellerId'] = (int)$r['sellerId'];
        $r['available'] = ($r['status'] === 'active' && $r['stock'] > 0);
        $r['lineTotal'] = (float)money_f($r['price'] * $r['qty']);
    }
    unset($r);
    return $rows;
}

function cart_add_item(int $userId, int $listingId, int $qty = 1): void {
    ensure_commerce_features();
    if ($qty < 1) $qty = 1;
    $chk = db()->prepare("SELECT id, seller_id FROM ads WHERE id = ? AND status = 'active' LIMIT 1");
    $chk->execute([$listingId]);
    $ad = $chk->fetch();
    if (!$ad) throw new MarketplaceException('Listing unavailable', 'listing_unavailable', 404);
    if ((int)$ad['seller_id'] === $userId) throw new MarketplaceException('Cannot add your own listing to cart', 'own_listing', 400);
    db()->prepare('INSERT INTO cart_items (user_id, listing_id, qty) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)')->execute([$userId, $listingId, $qty]);
}

function cart_remove_item(int $userId, int $listingId): void {
    ensure_commerce_features();
    db()->prepare('DELETE FROM cart_items WHERE user_id = ? AND listing_id = ?')->execute([$userId, $listingId]);
}

function cart_clear_items(int $userId): void {
    ensure_commerce_features();
    db()->prepare('DELETE FROM cart_items WHERE user_id = ?')->execute([$userId]);
}

/** Buys every available unit currently in the cart if the buyer's balance covers the total. */
function cart_checkout(int $userId): array {
    ensure_commerce_features();
    $items = cart_list_for_user($userId);
    $buyable = array_values(array_filter($items, static function (array $r): bool {
        return !empty($r['available']);
    }));
    if (!$buyable) {
        throw new MarketplaceException('Your cart has no purchasable items', 'empty_cart', 400);
    }

    $units = [];
    $total = 0.0;
    foreach ($buyable as $r) {
        $count = min((int)$r['qty'], (int)$r['stock']);
        if ($count < 1) continue;
        $total = (float)money_f($total + ((float)$r['price'] * $count));
        for ($i = 0; $i < $count; $i++) {
            $units[] = (int)$r['listingId'];
        }
    }
    if (!$units) {
        throw new MarketplaceException('Your cart has no purchasable items', 'empty_cart', 400);
    }

    $buyerStmt = db()->prepare('SELECT balance FROM users WHERE id = ? LIMIT 1');
    $buyerStmt->execute([$userId]);
    $balance = (float)($buyerStmt->fetchColumn() ?: 0);
    if ($balance < $total) {
        throw new MarketplaceException('Insufficient funds. Please deposit money into your wallet.', 'insufficient_funds', 400);
    }

    $orders = [];
    $errors = [];
    foreach ($units as $listingId) {
        try {
            $orders[] = purchase_listing($userId, $listingId);
        } catch (Throwable $e) {
            $errors[] = ['listingId' => $listingId, 'error' => $e->getMessage()];
        }
    }

    $attempted = array_values(array_unique($units));
    if ($attempted) {
        $placeholders = implode(',', array_fill(0, count($attempted), '?'));
        try {
            $params = array_merge([$userId], $attempted);
            db()->prepare("DELETE FROM cart_items WHERE user_id = ? AND listing_id IN ({$placeholders})")->execute($params);
        } catch (Throwable $e) {}
    }

    return ['orders' => $orders, 'errors' => $errors, 'total' => $total];
}

function wishlist_list_for_user(int $userId): array {
    ensure_commerce_features();
    $stmt = db()->prepare("SELECT w.id AS wishlistId, w.created_at AS addedAt,
            a.id AS listingId, a.title, a.price, a.category, a.preview_link AS previewLink, a.stock, a.status,
            a.public_slug AS publicSlug, a.seller_id AS sellerId, u.name AS sellerName
        FROM wishlist_items w
        JOIN ads a ON a.id = w.listing_id
        JOIN users u ON u.id = a.seller_id
        WHERE w.user_id = ?
        ORDER BY w.created_at DESC");
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['wishlistId'] = (int)$r['wishlistId'];
        $r['listingId'] = (int)$r['listingId'];
        $r['price'] = (float)$r['price'];
        $r['stock'] = (int)$r['stock'];
        $r['sellerId'] = (int)$r['sellerId'];
        $r['available'] = ($r['status'] === 'active' && $r['stock'] > 0);
    }
    unset($r);
    return $rows;
}

function wishlist_add_item(int $userId, int $listingId): void {
    ensure_commerce_features();
    $chk = db()->prepare('SELECT id FROM ads WHERE id = ? LIMIT 1');
    $chk->execute([$listingId]);
    if (!$chk->fetch()) throw new MarketplaceException('Listing not found', 'listing_unavailable', 404);
    db()->prepare('INSERT INTO wishlist_items (user_id, listing_id) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE user_id = user_id')->execute([$userId, $listingId]);
}

function wishlist_remove_item(int $userId, int $listingId): void {
    ensure_commerce_features();
    db()->prepare('DELETE FROM wishlist_items WHERE user_id = ? AND listing_id = ?')->execute([$userId, $listingId]);
}

function dispute_public(array $d): array {
    return [
        'id' => (int)$d['id'],
        'orderId' => (int)$d['order_id'],
        'buyerId' => (int)$d['buyer_id'],
        'sellerId' => (int)$d['seller_id'],
        'reason' => $d['reason'] ?? '',
        'status' => $d['status'] ?? 'open',
        'evidence' => !empty($d['evidence_json']) ? json_decode((string)$d['evidence_json'], true) : null,
        'adminNote' => $d['admin_note'] ?? '',
        'reviewedBy' => $d['reviewed_by'] ?? '',
        'reviewedAt' => $d['reviewed_at'] ?? null,
        'orderPublicId' => $d['public_id'] ?? null,
        'orderTitle' => $d['order_title'] ?? null,
        'buyerName' => $d['buyer_name'] ?? null,
        'sellerName' => $d['seller_name'] ?? null,
        'createdAt' => $d['created_at'] ?? null,
        'updatedAt' => $d['updated_at'] ?? null,
    ];
}

/** Email both buyer and seller a branded order-status update (best-effort). */
function notify_order_parties_email(array $order, string $statusLabel, string $detail = ''): void {
    try {
        $title = (string)($order['title'] ?? 'Order');
        $txid = (string)($order['public_id'] ?? '');
        $buyerId = (int)($order['buyer_id'] ?? 0);
        $sellerId = (int)($order['seller_id'] ?? 0);
        $stmt = db()->prepare('SELECT id, name, email FROM users WHERE id IN (?, ?)');
        $stmt->execute([$buyerId, $sellerId]);
        foreach ($stmt->fetchAll() as $u) {
            if (empty($u['email'])) continue;
            $mail = email_order_status_update((string)$u['name'], $title, $statusLabel, $txid, $detail);
            send_app_mail((string)$u['email'], $mail['subject'], $mail['html'], $mail['text']);
        }
    } catch (Throwable $e) {
        // Never fail the request because mail failed.
    }
}
