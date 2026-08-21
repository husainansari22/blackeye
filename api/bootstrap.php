<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');

function app_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['ok' => false, 'error' => 'Missing api/config.php. Copy config.example.php and fill MySQL details.']);
        exit;
    }
    $cfg = require $path;
    return $cfg;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = app_config();
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $c['db_host'],
        $c['db_name'],
        $c['db_charset'] ?? 'utf8mb4'
    );
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function json_out(array $payload, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    echo json_encode($payload);
    exit;
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return $_POST ?: [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function setting_get(string $key, $default = null) {
    $stmt = db()->prepare('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    return $row ? $row['setting_value'] : $default;
}

function setting_set(string $key, string $value): void {
    $stmt = db()->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
    $stmt->execute([$key, $value]);
}

function money_f($n): string {
    return number_format((float)$n, 2, '.', '');
}

function uid_token(int $bytes = 16): string {
    return bin2hex(random_bytes($bytes));
}

function bearer_token(): ?string {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $hdr, $m)) return $m[1];
    $alt = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($alt !== '') return $alt;
    if (!empty($_COOKIE['acctventa_token'])) return (string)$_COOKIE['acctventa_token'];
    return null;
}

function ensure_sessions_table(): void {
    db()->exec("CREATE TABLE IF NOT EXISTS api_sessions (
      token CHAR(64) PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX(user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function create_session(int $userId): string {
    ensure_sessions_table();
    $token = uid_token(24);
    $stmt = db()->prepare('INSERT INTO api_sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))');
    $stmt->execute([$token, $userId]);
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    setcookie('acctventa_token', $token, [
        'expires' => time() + 60 * 60 * 24 * 30,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    return $token;
}

function destroy_session(?string $token): void {
    if ($token) {
        try {
            ensure_sessions_table();
            $stmt = db()->prepare('DELETE FROM api_sessions WHERE token = ?');
            $stmt->execute([$token]);
        } catch (Throwable $e) {
            // ignore
        }
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    setcookie('acctventa_token', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function user_from_token(?string $token): ?array {
    if (!$token) return null;
    try {
        $stmt = db()->prepare('SELECT u.* FROM api_sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > NOW() AND u.is_banned = 0 LIMIT 1');
        $stmt->execute([$token]);
        $u = $stmt->fetch();
        return $u ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

function require_user(): array {
    $u = user_from_token(bearer_token());
    if (!$u) json_out(['ok' => false, 'error' => 'Login required'], 401);
    return $u;
}

function public_user(array $u): array {
    return [
        'id' => (int)$u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'phone' => $u['phone'],
        'balance' => (float)$u['balance'],
        'escrowBalance' => (float)$u['escrow_balance'],
        'totalDeposits' => (float)$u['total_deposits'],
        'totalWithdrawals' => (float)$u['total_withdrawals'],
        'plan' => $u['plan'],
        'referralCode' => $u['referral_code'],
        'isVerified' => (int)$u['is_verified'] === 1,
        'createdAt' => $u['created_at'],
    ];
}

function notify_user(int $userId, string $title, string $body, string $type = 'info'): void {
    $stmt = db()->prepare('INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, ?)');
    $stmt->execute([$userId, $title, $body, $type]);
}

function plan_limits(string $planId): array {
    $stmt = db()->prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$planId]);
    $p = $stmt->fetch();
    if ($p) return $p;
    return ['id' => 'free', 'name' => 'Free (Default)', 'price' => 0, 'daily_uploads' => (int)(setting_get('free_daily_uploads', '5')), 'approval_label' => 'Standard AI review'];
}

function uploads_today(int $userId): int {
    $day = date('Y-m-d');
    $stmt = db()->prepare('SELECT upload_count FROM uploads_daily WHERE user_id = ? AND day_key = ?');
    $stmt->execute([$userId, $day]);
    $row = $stmt->fetch();
    return $row ? (int)$row['upload_count'] : 0;
}

function bump_upload(int $userId): void {
    $day = date('Y-m-d');
    $stmt = db()->prepare('INSERT INTO uploads_daily (user_id, day_key, upload_count) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE upload_count = upload_count + 1');
    $stmt->execute([$userId, $day]);
}

function allowed_hosts_for_category(string $category): array {
    $map = [
        'Facebook' => ['facebook.com', 'fb.com', 'fb.me'],
        'Instagram' => ['instagram.com'],
        'TikTok' => ['tiktok.com'],
        'Twitter' => ['twitter.com', 'x.com'],
        'Gmail' => ['gmail.com', 'mail.google.com'],
        'Telegram' => ['t.me', 'telegram.org'],
        'WhatsApp' => ['wa.me', 'whatsapp.com'],
        'Social Media' => ['facebook.com', 'fb.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'linkedin.com'],
        'Emails & Messaging' => ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 't.me', 'wa.me'],
        'VPN & Proxies' => ['expressvpn.com', 'nordvpn.com', 'surfshark.com', 'protonvpn.com'],
        'Giftcards' => [],
        'Gaming' => ['steamcommunity.com', 'xbox.com', 'playstation.com'],
        'Subscription' => ['netflix.com', 'spotify.com', 'youtube.com'],
    ];
    if (isset($map[$category])) return $map[$category];
    foreach ($map as $k => $hosts) {
        if (stripos($category, $k) !== false) return $hosts;
    }
    return $map['Social Media'];
}

function ai_review_listing(array $ad): array {
    $reasons = [];
    $title = trim((string)($ad['title'] ?? ''));
    $username = trim((string)($ad['username'] ?? ''));
    $password = trim((string)($ad['password'] ?? $ad['password_plain'] ?? ''));
    $preview = trim((string)($ad['preview_link'] ?? $ad['previewLink'] ?? ''));
    $price = (float)($ad['price'] ?? 0);
    $category = (string)($ad['category'] ?? '');

    if ($title === '') $reasons[] = 'Missing account title';
    if ($price <= 0) $reasons[] = 'Invalid price';
    if ($username === '') $reasons[] = 'Missing account username';
    if (strlen($password) < 3) $reasons[] = 'Missing or weak account password';

    $allowed = allowed_hosts_for_category($category);
    if (count($allowed) > 0) {
        if ($preview === '') {
            $reasons[] = 'Preview link is required for this account type';
        } elseif (!filter_var($preview, FILTER_VALIDATE_URL)) {
            $reasons[] = 'Preview link is not a valid URL';
        } else {
            $host = strtolower(parse_url($preview, PHP_URL_HOST) ?: '');
            $host = preg_replace('/^www\./', '', $host);
            $ok = false;
            foreach ($allowed as $d) {
                if ($host === $d || substr($host, -strlen('.' . $d)) === '.' . $d || $host === $d) { $ok = true; break; }
            }
            if (!$ok) $reasons[] = 'Preview link does not match the selected account category';
        }
        if (preg_match('/example\.com|localhost|127\.0\.0\.1/i', $preview)) {
            $reasons[] = 'Preview link looks like a placeholder';
        }
    }

    if ($reasons) {
        return ['status' => 'denied', 'reason' => implode('. ', $reasons) . '.', 'reviewed_by' => 'AI Review'];
    }
    return ['status' => 'active', 'reason' => '', 'reviewed_by' => 'AI Review'];
}

function ensure_password_resets_table(): void {
    db()->exec("CREATE TABLE IF NOT EXISTS password_resets (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (token_hash),
      INDEX (user_id),
      CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/flutterwave.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    json_out(['ok' => true]);
}
