<?php
/**
 * Merchant stories (24h Instagram-style posts).
 */

function ensure_stories_tables(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    db()->exec("CREATE TABLE IF NOT EXISTS merchant_stories (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      image_url VARCHAR(500) NOT NULL DEFAULT '',
      caption VARCHAR(280) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      KEY idx_stories_user (user_id),
      KEY idx_stories_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $dir = dirname(__DIR__) . '/uploads/stories';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|phar)$\">\nDeny from all\n</FilesMatch>\n");
    }
}

function save_story_image(string $data): string {
    ensure_stories_tables();
    $mime = '';
    $bin = '';
    if (preg_match('#^data:([^;]+);base64,(.+)$#s', $data, $m)) {
        $mime = strtolower(trim($m[1]));
        $bin = base64_decode($m[2], true);
    } else {
        $bin = base64_decode($data, true);
    }
    if ($bin === false || $bin === '') {
        throw new RuntimeException('Could not read that photo');
    }
    if (strlen($bin) > 3 * 1024 * 1024) {
        throw new RuntimeException('Photo is too large (max 3MB)');
    }
    $allowed = [
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    if (!isset($allowed[$mime])) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detected = strtolower((string)($finfo->buffer($bin) ?: ''));
        if (isset($allowed[$detected])) {
            $mime = $detected;
        } else {
            throw new RuntimeException('Use a JPEG, PNG, or WebP photo');
        }
    }
    $ext = $allowed[$mime];
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    $path = dirname(__DIR__) . '/uploads/stories/' . $stored;
    if (@file_put_contents($path, $bin) === false) {
        throw new RuntimeException('Could not save story photo');
    }
    return '/uploads/stories/' . $stored;
}

function map_story_row(array $row): array {
    return [
        'id' => (int)$row['id'],
        'userId' => (int)$row['user_id'],
        'imageUrl' => (string)($row['image_url'] ?? ''),
        'caption' => (string)($row['caption'] ?? ''),
        'createdAt' => (string)($row['created_at'] ?? ''),
        'expiresAt' => (string)($row['expires_at'] ?? ''),
        'sellerName' => (string)($row['seller_name'] ?? $row['name'] ?? ''),
        'sellerEmail' => (string)($row['seller_email'] ?? $row['email'] ?? ''),
        'sellerAvatar' => (string)($row['seller_avatar'] ?? $row['avatar_url'] ?? ''),
        'sellerMerchantSlug' => (string)($row['merchant_slug'] ?? ''),
        'sellerVerified' => (int)($row['is_verified'] ?? 0) === 1,
    ];
}

/** Active story feed grouped by merchant (for Top Merchants rings). */
function stories_feed(int $limit = 40): array {
    ensure_stories_tables();
    ensure_user_avatar_column();
    $limit = max(1, min(80, $limit));
    $sql = "SELECT s.*, u.name AS seller_name, u.email AS seller_email, u.avatar_url AS seller_avatar,
        u.merchant_slug, u.is_verified
      FROM merchant_stories s
      JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > NOW() AND u.is_banned = 0
      ORDER BY s.created_at DESC
      LIMIT {$limit}";
    $rows = db()->query($sql)->fetchAll();
    $byUser = [];
    foreach ($rows as $row) {
        $uid = (int)$row['user_id'];
        if (!isset($byUser[$uid])) {
            $byUser[$uid] = [
                'sellerId' => $uid,
                'sellerName' => (string)$row['seller_name'],
                'sellerEmail' => (string)$row['seller_email'],
                'sellerAvatar' => (string)($row['seller_avatar'] ?? ''),
                'sellerMerchantSlug' => (string)($row['merchant_slug'] ?? ''),
                'sellerVerified' => (int)($row['is_verified'] ?? 0) === 1,
                'stories' => [],
            ];
        }
        if (count($byUser[$uid]['stories']) < 10) {
            $byUser[$uid]['stories'][] = map_story_row($row);
        }
    }
    return array_values($byUser);
}

function stories_for_user(int $userId, bool $includeExpired = false): array {
    ensure_stories_tables();
    if ($userId < 1) return [];
    if ($includeExpired) {
        $stmt = db()->prepare('SELECT s.*, u.name AS seller_name, u.email AS seller_email, u.avatar_url AS seller_avatar, u.merchant_slug, u.is_verified
          FROM merchant_stories s JOIN users u ON u.id = s.user_id
          WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 30');
    } else {
        $stmt = db()->prepare('SELECT s.*, u.name AS seller_name, u.email AS seller_email, u.avatar_url AS seller_avatar, u.merchant_slug, u.is_verified
          FROM merchant_stories s JOIN users u ON u.id = s.user_id
          WHERE s.user_id = ? AND s.expires_at > NOW() ORDER BY s.created_at ASC LIMIT 20');
    }
    $stmt->execute([$userId]);
    return array_map('map_story_row', $stmt->fetchAll());
}

function create_story(int $userId, string $imageData, string $caption = ''): array {
    ensure_stories_tables();
    $active = db()->prepare('SELECT COUNT(*) c FROM merchant_stories WHERE user_id = ? AND expires_at > NOW()');
    $active->execute([$userId]);
    if ((int)$active->fetch()['c'] >= 8) {
        throw new RuntimeException('You can have at most 8 active stories. Delete one or wait for older ones to expire.');
    }
    $caption = trim(mb_substr($caption, 0, 280));
    $url = save_story_image($imageData);
    $stmt = db()->prepare('INSERT INTO merchant_stories (user_id, image_url, caption, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))');
    $stmt->execute([$userId, $url, $caption]);
    $id = (int)db()->lastInsertId();
    $row = db()->prepare('SELECT s.*, u.name AS seller_name, u.email AS seller_email, u.avatar_url AS seller_avatar, u.merchant_slug, u.is_verified
      FROM merchant_stories s JOIN users u ON u.id = s.user_id WHERE s.id = ? LIMIT 1');
    $row->execute([$id]);
    $story = $row->fetch();
    if (!$story) {
        throw new RuntimeException('Story saved but could not reload');
    }
    return map_story_row($story);
}

function delete_story(int $userId, int $storyId): bool {
    ensure_stories_tables();
    $stmt = db()->prepare('SELECT * FROM merchant_stories WHERE id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$storyId, $userId]);
    $row = $stmt->fetch();
    if (!$row) return false;
    $url = (string)($row['image_url'] ?? '');
    if ($url !== '' && preg_match('#^/uploads/stories/([a-zA-Z0-9._-]+)$#', $url, $m)) {
        $path = dirname(__DIR__) . '/uploads/stories/' . $m[1];
        if (is_file($path)) @unlink($path);
    }
    db()->prepare('DELETE FROM merchant_stories WHERE id = ? AND user_id = ?')->execute([$storyId, $userId]);
    return true;
}
