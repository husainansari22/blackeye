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

function admin_password_is_default(): bool {
    $hash = (string)setting_get('admin_password_hash', '');
    if ($hash !== '') return false;
    $legacy = (string)setting_get('admin_api_password', '');
    return $legacy === '' || $legacy === 'admin123';
}

function admin_password_verify(string $pass): bool {
    if ($pass === '') return false;
    $hash = (string)setting_get('admin_password_hash', '');
    if ($hash !== '') {
        return password_verify($pass, $hash);
    }
    $legacy = (string)setting_get('admin_api_password', '');
    if ($legacy !== '') {
        return hash_equals($legacy, $pass);
    }
    return hash_equals('admin123', $pass);
}

function admin_password_set(string $newPass): void {
    setting_set('admin_password_hash', password_hash($newPass, PASSWORD_DEFAULT));
    setting_set('admin_api_password', '');
}

function money_f($n): string {
    return number_format((float)$n, 2, '.', '');
}

function uid_token(int $bytes = 16): string {
    return bin2hex(random_bytes($bytes));
}

/**
 * 5-char referral code with letters + numbers, e.g. a7K2m / Q4b9X.
 * Excludes ambiguous 0/O/1/l/I for readability.
 */
function referral_code_generate(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    $len = strlen($chars) - 1;
    for ($attempt = 0; $attempt < 48; $attempt++) {
        $code = '';
        for ($i = 0; $i < 5; $i++) {
            $code .= $chars[random_int(0, $len)];
        }
        if (!preg_match('/[A-Za-z]/', $code) || !preg_match('/[0-9]/', $code)) {
            continue;
        }
        try {
            $stmt = db()->prepare('SELECT id FROM users WHERE referral_code = ? LIMIT 1');
            $stmt->execute([$code]);
            if ($stmt->fetch()) {
                continue;
            }
        } catch (Throwable $e) {
            // table may be unavailable during early install — still return code
        }
        return $code;
    }
    return substr(str_replace(['0', 'o', 'O', '1', 'l', 'I'], 'x', bin2hex(random_bytes(4))), 0, 5);
}

function referral_code_is_valid(?string $code): bool {
    $code = trim((string)$code);
    return (bool)preg_match('/^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{5}$/', $code);
}

/** Upgrade legacy name-based codes to the random 5-char format. */
function ensure_user_referral_code(array $u): array {
    $code = (string)($u['referral_code'] ?? '');
    if (referral_code_is_valid($code)) {
        return $u;
    }
    if (empty($u['id'])) {
        $u['referral_code'] = referral_code_generate();
        return $u;
    }
    $new = referral_code_generate();
    try {
        db()->prepare('UPDATE users SET referral_code = ? WHERE id = ?')->execute([$new, (int)$u['id']]);
        $u['referral_code'] = $new;
    } catch (Throwable $e) {
        $u['referral_code'] = $new;
    }
    return $u;
}

/** Public TXID style: 4a36412c-0c41-455a-b87d */
function uuid_txid(): string {
    $h = bin2hex(random_bytes(10));
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4);
}

/** Stable display TXID for rows missing a UUID reference. */
function tx_public_id(array $row): string {
    $ref = trim((string)($row['reference'] ?? ''));
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i', $ref)) {
        return strtolower($ref);
    }
    $seed = hash('sha256', 'acctventa-tx-' . (string)($row['id'] ?? '0') . '-' . (string)($row['created_at'] ?? ''));
    return substr($seed, 0, 8) . '-' . substr($seed, 8, 4) . '-' . substr($seed, 12, 4) . '-' . substr($seed, 16, 4);
}

function map_public_transaction(array $row): array {
    $publicId = tx_public_id($row);
    return [
        'id' => (string)($row['id'] ?? ''),
        'type' => $row['type'] ?? '',
        'amount' => (float)($row['amount'] ?? 0),
        'fee' => (float)($row['fee'] ?? 0),
        'payout' => isset($row['payout']) && $row['payout'] !== null ? (float)$row['payout'] : null,
        'status' => $row['status'] ?? '',
        'method' => $row['method'] ?? '',
        'note' => $row['note'] ?? '',
        'reference' => $publicId,
        'publicId' => $publicId,
        'txid' => $publicId,
        'created_at' => $row['created_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null,
    ];
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
    ensure_user_payout_columns();
    ensure_wallet_ledger_columns();
    ensure_user_avatar_column();
    $u = ensure_user_referral_code($u);
    $bal = (float)$u['balance'];
    $wd = array_key_exists('withdrawable_balance', $u)
        ? (float)$u['withdrawable_balance']
        : 0.0;
    // Never expose withdrawable above available balance (or below zero).
    if ($bal <= 0) {
        $wd = 0.0;
    } else {
        $wd = min($wd, $bal);
    }
    return [
        'id' => (int)$u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'phone' => $u['phone'],
        'countryCode' => strtolower((string)($u['country_code'] ?? '')),
        'avatarUrl' => (string)($u['avatar_url'] ?? ''),
        'balance' => $bal,
        'withdrawableBalance' => (float)money_f($wd),
        'owing' => $bal < 0 ? abs($bal) : 0,
        'escrowBalance' => (float)$u['escrow_balance'],
        'totalDeposits' => (float)$u['total_deposits'],
        'totalWithdrawals' => (float)$u['total_withdrawals'],
        'plan' => $u['plan'],
        'referralCode' => $u['referral_code'],
        'isVerified' => (int)$u['is_verified'] === 1,
        'kycStatus' => (static function (array $u): string {
            if ((int)($u['is_verified'] ?? 0) === 1) return 'verified';
            try {
                if (function_exists('kyc_status_for_user')) {
                    return (string)(kyc_status_for_user($u)['kycStatus'] ?? 'none');
                }
            } catch (Throwable $e) {}
            return 'none';
        })($u),
        'createdAt' => $u['created_at'],
        'payoutBank' => (string)($u['payout_bank'] ?? ''),
        'payoutAccount' => (string)($u['payout_account'] ?? ''),
        'payoutAccountName' => (string)($u['payout_account_name'] ?? ''),
        'payoutCurrency' => (string)($u['payout_currency'] ?? ''),
        'payoutBankLocked' => (int)($u['payout_bank_locked'] ?? 0) === 1,
    ];
}

function ensure_user_avatar_column(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->query('SELECT avatar_url FROM users LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) NOT NULL DEFAULT '' AFTER phone");
        } catch (Throwable $e2) {}
    }
    $dir = dirname(__DIR__) . '/uploads/avatars';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|phar)$\">\nDeny from all\n</FilesMatch>\n");
    }
}

/**
 * Save a JPEG/PNG/WebP data-URL as the user's public avatar. Returns the public URL.
 */
function save_user_avatar(int $userId, string $data): string {
    ensure_user_avatar_column();
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
    if (strlen($bin) > 2.5 * 1024 * 1024) {
        throw new RuntimeException('Photo is too large (max 2.5MB)');
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
    $stored = 'u' . $userId . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
    $dir = dirname(__DIR__) . '/uploads/avatars';
    $path = $dir . '/' . $stored;
    if (file_put_contents($path, $bin) === false) {
        throw new RuntimeException('Could not save photo');
    }

    $stmt = db()->prepare('SELECT avatar_url FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $prev = (string)($stmt->fetchColumn() ?: '');
    if ($prev !== '' && preg_match('#^/uploads/avatars/([a-zA-Z0-9._-]+)$#', $prev, $pm)) {
        $old = $dir . '/' . $pm[1];
        if (is_file($old)) {
            @unlink($old);
        }
    }

    $url = '/uploads/avatars/' . $stored;
    db()->prepare('UPDATE users SET avatar_url = ? WHERE id = ?')->execute([$url, $userId]);
    return $url;
}

function ensure_user_payout_columns(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    $cols = [
        'country_code' => "ALTER TABLE users ADD COLUMN country_code VARCHAR(8) NOT NULL DEFAULT '' AFTER phone",
        'payout_bank' => "ALTER TABLE users ADD COLUMN payout_bank VARCHAR(120) NOT NULL DEFAULT '' AFTER plan",
        'payout_account' => "ALTER TABLE users ADD COLUMN payout_account VARCHAR(120) NOT NULL DEFAULT '' AFTER payout_bank",
        'payout_account_name' => "ALTER TABLE users ADD COLUMN payout_account_name VARCHAR(120) NOT NULL DEFAULT '' AFTER payout_account",
        'payout_currency' => "ALTER TABLE users ADD COLUMN payout_currency VARCHAR(10) NOT NULL DEFAULT '' AFTER payout_account_name",
        'payout_bank_locked' => "ALTER TABLE users ADD COLUMN payout_bank_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER payout_currency",
    ];
    foreach ($cols as $name => $sql) {
        try {
            db()->query('SELECT ' . $name . ' FROM users LIMIT 1');
        } catch (Throwable $e) {
            try {
                db()->exec($sql);
            } catch (Throwable $e2) {
                // ignore
            }
        }
    }
}

/**
 * Separates deposit funds (spend-only) from sales/referral earnings (withdrawable).
 */
function ensure_wallet_ledger_columns(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->query('SELECT withdrawable_balance FROM users LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec("ALTER TABLE users ADD COLUMN withdrawable_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER balance");
        } catch (Throwable $e2) {
            // ignore
        }
    }
}

/** Platform fee taken from every successful sale (seller receives the remainder). */
function sales_commission_rate(): float {
    $cfg = app_config();
    $default = (float)($cfg['sales_commission_rate'] ?? 0.22);
    return max(0.0, min(0.95, (float)setting_get('sales_commission_rate', $default)));
}

function sales_split(float $gross): array {
    $gross = (float)money_f($gross);
    $rate = sales_commission_rate();
    $commission = (float)money_f($gross * $rate);
    $net = (float)money_f($gross - $commission);
    if ($net < 0) {
        $net = 0.0;
        $commission = $gross;
    }
    return [
        'gross' => $gross,
        'rate' => $rate,
        'commission' => $commission,
        'net' => $net,
    ];
}

/** Map ISO country (ng, gh, …) to wallet local currency code. */
function country_to_currency(string $countryCode): string {
    $map = [
        'ng' => 'NGN', 'gh' => 'GHS', 'ke' => 'KES', 'za' => 'ZAR',
        'cm' => 'XAF', 'td' => 'XAF', 'cg' => 'XAF', 'ga' => 'XAF',
        'sn' => 'XOF', 'ci' => 'XOF', 'bj' => 'XOF', 'tg' => 'XOF', 'bf' => 'XOF', 'ml' => 'XOF',
        'us' => 'USD', 'gb' => 'GBP',
    ];
    $cc = strtolower(trim($countryCode));
    return $map[$cc] ?? 'NGN';
}

function currency_symbol(string $code): string {
    $map = ['NGN' => '₦', 'GHS' => 'GH₵', 'KES' => 'KSh', 'ZAR' => 'R', 'XAF' => 'CFA', 'XOF' => 'CFA', 'USD' => '$', 'GBP' => '£'];
    return $map[strtoupper($code)] ?? (strtoupper($code) . ' ');
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

function default_wallet_currencies(): array {
    return [
        'local' => [
            ['code' => 'NGN', 'name' => 'Nigeria', 'flag' => 'ng', 'rate' => 1600, 'enabled' => true],
            ['code' => 'GHS', 'name' => 'Ghana', 'flag' => 'gh', 'rate' => 15, 'enabled' => true],
            ['code' => 'KES', 'name' => 'Kenya', 'flag' => 'ke', 'rate' => 130, 'enabled' => true],
            ['code' => 'ZAR', 'name' => 'South Africa', 'flag' => 'za', 'rate' => 18, 'enabled' => true],
            ['code' => 'XAF', 'name' => 'Central Africa', 'flag' => 'cm', 'rate' => 600, 'enabled' => true],
            ['code' => 'XOF', 'name' => 'West Africa', 'flag' => 'sn', 'rate' => 600, 'enabled' => true],
        ],
        'crypto' => [
            ['code' => 'USDT', 'name' => 'Tether', 'networks' => ['TRC20', 'BEP20', 'ERC20'], 'addresses' => ['TRC20' => '', 'BEP20' => '', 'ERC20' => ''], 'enabled' => true],
            ['code' => 'BTC', 'name' => 'Bitcoin', 'networks' => ['BTC'], 'addresses' => ['BTC' => ''], 'enabled' => true],
            ['code' => 'ETH', 'name' => 'Ethereum', 'networks' => ['ERC20'], 'addresses' => ['ERC20' => ''], 'enabled' => true],
            ['code' => 'USDC', 'name' => 'USD Coin', 'networks' => ['ERC20', 'BEP20'], 'addresses' => ['ERC20' => '', 'BEP20' => ''], 'enabled' => true],
            ['code' => 'BNB', 'name' => 'BNB', 'networks' => ['BEP20'], 'addresses' => ['BEP20' => ''], 'enabled' => true],
            ['code' => 'TRX', 'name' => 'Tron', 'networks' => ['TRC20'], 'addresses' => ['TRC20' => ''], 'enabled' => true],
            ['code' => 'LTC', 'name' => 'Litecoin', 'networks' => ['LTC'], 'addresses' => ['LTC' => ''], 'enabled' => true],
            ['code' => 'SOL', 'name' => 'Solana', 'networks' => ['SOL'], 'addresses' => ['SOL' => ''], 'enabled' => true],
        ],
    ];
}

function wallet_currencies_get(): array {
    $raw = setting_get('wallet_currencies', '');
    $defaults = default_wallet_currencies();
    if ($raw) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded) && !empty($decoded['local'])) {
            // Ensure crypto rows always expose an addresses map
            if (!empty($decoded['crypto']) && is_array($decoded['crypto'])) {
                foreach ($decoded['crypto'] as &$c) {
                    if (!is_array($c)) continue;
                    $nets = $c['networks'] ?? [];
                    if (!is_array($nets)) $nets = [];
                    $addrs = is_array($c['addresses'] ?? null) ? $c['addresses'] : [];
                    $normalized = [];
                    foreach ($nets as $n) {
                        $nk = strtoupper(trim((string)$n));
                        if ($nk === '') continue;
                        $normalized[$nk] = trim((string)($addrs[$nk] ?? $addrs[$n] ?? ''));
                    }
                    // Keep any extra address keys owner saved
                    foreach ($addrs as $k => $v) {
                        $nk = strtoupper(trim((string)$k));
                        if ($nk !== '' && !isset($normalized[$nk])) {
                            $normalized[$nk] = trim((string)$v);
                        }
                    }
                    $c['addresses'] = $normalized;
                }
                unset($c);
            }
            return $decoded;
        }
    }
    // sync NGN rate with usd_ngn_rate setting
    $rate = (float)setting_get('usd_ngn_rate', '1600');
    foreach ($defaults['local'] as &$row) {
        if (($row['code'] ?? '') === 'NGN') $row['rate'] = $rate > 0 ? $rate : 1600;
    }
    unset($row);
    return $defaults;
}

function wallet_currencies_set(array $data): void {
    setting_set('wallet_currencies', json_encode($data));
    foreach (($data['local'] ?? []) as $row) {
        if (($row['code'] ?? '') === 'NGN' && isset($row['rate'])) {
            setting_set('usd_ngn_rate', (string)max(1, (float)$row['rate']));
        }
    }
}

/** Find enabled crypto coin config by code. */
function crypto_coin_config(string $coinCode): ?array {
    $code = strtoupper(trim($coinCode));
    foreach ((wallet_currencies_get()['crypto'] ?? []) as $c) {
        if (!is_array($c)) continue;
        if (strtoupper((string)($c['code'] ?? '')) !== $code) continue;
        if (isset($c['enabled']) && !$c['enabled']) return null;
        return $c;
    }
    return null;
}

/** Deposit address for coin + network (empty string if not configured). */
function crypto_deposit_address(string $coinCode, string $network): string {
    $c = crypto_coin_config($coinCode);
    if (!$c) return '';
    $net = strtoupper(trim($network));
    $addrs = is_array($c['addresses'] ?? null) ? $c['addresses'] : [];
    foreach ($addrs as $k => $v) {
        if (strtoupper(trim((string)$k)) === $net) {
            return trim((string)$v);
        }
    }
    return '';
}

/** One-time: rename legacy help@ mailbox to support@ */
function migrate_legacy_support_email(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $email = (string)setting_get('support_email', '');
        if ($email === '' || $email === 'help@acctventa.com') {
            setting_set('support_email', 'support@acctventa.com');
        }
    } catch (Throwable $e) {
        // db may not be ready during install
    }
}

require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/flutterwave.php';
require_once __DIR__ . '/support.php';
require_once __DIR__ . '/marketplace_extras.php';
require_once __DIR__ . '/commerce_features.php';
require_once __DIR__ . '/kyc.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    json_out(['ok' => true]);
}
