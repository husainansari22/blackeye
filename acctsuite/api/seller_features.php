<?php
declare(strict_types=1);

/**
 * Bulk ad credentials, seller bio, hold-ads, and reCAPTCHA helpers.
 */

function ensure_ad_credentials_table(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS ad_credentials (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          ad_id INT UNSIGNED NOT NULL,
          username VARCHAR(190) NOT NULL DEFAULT '',
          password_plain VARCHAR(190) NOT NULL DEFAULT '',
          preview_link VARCHAR(500) NOT NULL DEFAULT '',
          attached_email VARCHAR(190) NOT NULL DEFAULT '',
          attached_email_password VARCHAR(190) NOT NULL DEFAULT '',
          two_fa VARCHAR(190) NOT NULL DEFAULT '',
          extra_info TEXT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'available',
          sold_order_id INT UNSIGNED NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX (ad_id),
          INDEX (ad_id, status),
          CONSTRAINT fk_adcred_ad FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
}

function ensure_user_bio_column(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->query('SELECT bio FROM users LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec("ALTER TABLE users ADD COLUMN bio TEXT NULL AFTER phone");
        } catch (Throwable $e2) {}
    }
}

function ensure_user_ads_held_column(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->query('SELECT ads_held FROM users LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec("ALTER TABLE users ADD COLUMN ads_held TINYINT(1) NOT NULL DEFAULT 0 AFTER is_verified");
        } catch (Throwable $e2) {}
    }
}

function ensure_seller_review_reply_column(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->query('SELECT seller_reply FROM seller_reviews LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec("ALTER TABLE seller_reviews ADD COLUMN seller_reply TEXT NULL AFTER comment");
        } catch (Throwable $e2) {}
    }
}

/**
 * Google reCAPTCHA v3 — OFF by default. Enable in Owner Admin → Settings
 * when you want captcha before login / signup.
 */
function recaptcha_enabled(): bool {
    return setting_get('recaptcha_enabled', '0') === '1';
}

function recaptcha_site_key(): string {
    if (!recaptcha_enabled()) return '';
    return trim((string)setting_get('recaptcha_site_key', app_config()['recaptcha_site_key'] ?? ''));
}

function recaptcha_secret_key(): string {
    if (!recaptcha_enabled()) return '';
    return trim((string)setting_get('recaptcha_secret_key', app_config()['recaptcha_secret_key'] ?? ''));
}

function verify_recaptcha_token(?string $token, string $action = ''): bool {
    if (!recaptcha_enabled()) return true;
    $secret = recaptcha_secret_key();
    if ($secret === '') {
        // Enabled in admin but keys missing — don't lock users out
        return true;
    }
    $token = trim((string)$token);
    if ($token === '') return false;
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query([
                'secret' => $secret,
                'response' => $token,
            ]),
            'timeout' => 8,
        ],
    ]);
    $raw = @file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $ctx);
    if ($raw === false || $raw === '') {
        // Network blip — don't lock users out of auth
        return true;
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data['success'])) return false;
    if ($action !== '' && isset($data['action']) && (string)$data['action'] !== $action) {
        return false;
    }
    $score = isset($data['score']) ? (float)$data['score'] : 1.0;
    return $score >= 0.3;
}

/**
 * Normalize accounts[] from ads.create body. Falls back to single username/password fields.
 * @return list<array{username:string,password:string,preview_link:string,attached_email:string,attached_email_password:string,two_fa:string,extra_info:string}>
 */
function normalize_ad_accounts(array $body, array $fallbackAd): array {
    $out = [];
    $raw = $body['accounts'] ?? null;
    if (is_array($raw) && count($raw) > 0) {
        foreach ($raw as $row) {
            if (!is_array($row)) continue;
            $username = trim((string)($row['username'] ?? ''));
            $password = (string)($row['password'] ?? '');
            if ($username === '' || $password === '') continue;
            $out[] = [
                'username' => $username,
                'password' => $password,
                'preview_link' => trim((string)($row['previewLink'] ?? $row['preview_link'] ?? '')),
                'attached_email' => trim((string)($row['attachedEmail'] ?? $row['attached_email'] ?? '')),
                'attached_email_password' => (string)($row['attachedEmailPassword'] ?? $row['attached_email_password'] ?? ''),
                'two_fa' => trim((string)($row['twoFA'] ?? $row['two_fa'] ?? '')),
                'extra_info' => trim((string)($row['extraInfo'] ?? $row['extra_info'] ?? '')),
            ];
        }
    }
    if (!$out) {
        $username = trim((string)($fallbackAd['username'] ?? ''));
        $password = (string)($fallbackAd['password'] ?? '');
        if ($username !== '' && $password !== '') {
            $out[] = [
                'username' => $username,
                'password' => $password,
                'preview_link' => trim((string)($fallbackAd['preview_link'] ?? '')),
                'attached_email' => trim((string)($fallbackAd['attached_email'] ?? '')),
                'attached_email_password' => (string)($fallbackAd['attached_email_password'] ?? ''),
                'two_fa' => trim((string)($fallbackAd['two_fa'] ?? '')),
                'extra_info' => trim((string)($fallbackAd['extra_info'] ?? '')),
            ];
        }
    }
    return $out;
}

function insert_ad_credentials(int $adId, array $accounts): int {
    ensure_ad_credentials_table();
    if ($adId < 1 || !$accounts) return 0;
    $stmt = db()->prepare('INSERT INTO ad_credentials
        (ad_id, username, password_plain, preview_link, attached_email, attached_email_password, two_fa, extra_info, status)
        VALUES (?,?,?,?,?,?,?,?,\'available\')');
    $n = 0;
    foreach ($accounts as $a) {
        $stmt->execute([
            $adId,
            $a['username'],
            $a['password'],
            $a['preview_link'] ?? '',
            $a['attached_email'] ?? '',
            $a['attached_email_password'] ?? '',
            $a['two_fa'] ?? '',
            $a['extra_info'] ?? '',
        ]);
        $n++;
    }
    return $n;
}

/**
 * Claim one available credential for a purchase (FIFO). Falls back to ads row fields.
 * @return array{username:string,password:string,previewLink:string,attachedEmail:string,attachedEmailPassword:string,twoFA:string,extraInfo:string,credentialId:?int}
 */
function claim_ad_credential(PDO $pdo, array $ad, ?int $preferIndex = null): array {
    ensure_ad_credentials_table();
    $adId = (int)$ad['id'];
    $cred = null;
    try {
        $rows = $pdo->prepare("SELECT * FROM ad_credentials WHERE ad_id = ? AND status = 'available' ORDER BY id ASC");
        $rows->execute([$adId]);
        $list = $rows->fetchAll();
        if ($list) {
            $idx = $preferIndex !== null ? max(0, min(count($list) - 1, $preferIndex)) : 0;
            $cred = $list[$idx];
            $pdo->prepare("UPDATE ad_credentials SET status = 'sold' WHERE id = ? AND status = 'available'")
                ->execute([(int)$cred['id']]);
        }
    } catch (Throwable $e) {
        $cred = null;
    }
    if ($cred) {
        return [
            'username' => (string)$cred['username'],
            'password' => (string)$cred['password_plain'],
            'previewLink' => (string)$cred['preview_link'],
            'attachedEmail' => (string)$cred['attached_email'],
            'attachedEmailPassword' => (string)$cred['attached_email_password'],
            'twoFA' => (string)$cred['two_fa'],
            'extraInfo' => (string)($cred['extra_info'] ?? ''),
            'credentialId' => (int)$cred['id'],
        ];
    }
    return [
        'username' => (string)($ad['username'] ?? ''),
        'password' => (string)($ad['password_plain'] ?? ''),
        'previewLink' => (string)($ad['preview_link'] ?? ''),
        'attachedEmail' => (string)($ad['attached_email'] ?? ''),
        'attachedEmailPassword' => (string)($ad['attached_email_password'] ?? ''),
        'twoFA' => (string)($ad['two_fa'] ?? ''),
        'extraInfo' => (string)($ad['extra_info'] ?? ''),
        'credentialId' => null,
    ];
}

function mark_credential_sold_order(PDO $pdo, ?int $credentialId, int $orderId): void {
    if (!$credentialId || $orderId < 1) return;
    try {
        $pdo->prepare('UPDATE ad_credentials SET sold_order_id = ? WHERE id = ?')->execute([$orderId, $credentialId]);
    } catch (Throwable $e) {}
}
