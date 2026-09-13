<?php
declare(strict_types=1);

/**
 * Live Chat Support helpers (user ↔ staff).
 */

function ensure_support_tables(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS support_threads (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          user_typing_at DATETIME NULL,
          staff_typing_at DATETIME NULL,
          user_last_seen_at DATETIME NULL,
          staff_last_seen_at DATETIME NULL,
          last_message_at DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_user_open (user_id),
          INDEX (status),
          INDEX (last_message_at),
          CONSTRAINT fk_st_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS support_messages (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          thread_id INT UNSIGNED NOT NULL,
          sender_role ENUM('user','staff') NOT NULL,
          sender_id INT UNSIGNED NULL,
          staff_name VARCHAR(80) NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX (thread_id),
          CONSTRAINT fk_sm_thread FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS staff_sessions (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          token_hash CHAR(64) NOT NULL,
          role VARCHAR(40) NOT NULL DEFAULT 'staff',
          staff_name VARCHAR(80) NOT NULL DEFAULT 'Support',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          INDEX (token_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
    try {
        db()->query('SELECT last_seen_at FROM users LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec("ALTER TABLE users ADD COLUMN last_seen_at DATETIME NULL AFTER updated_at");
        } catch (Throwable $e2) {}
    }
}

function staff_bearer_token(): ?string {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_STAFF_TOKEN'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $hdr, $m)) return $m[1];
    $alt = $_SERVER['HTTP_X_STAFF_TOKEN'] ?? '';
    return $alt !== '' ? (string)$alt : null;
}

function create_staff_session(string $role = 'owner', string $name = 'Support'): string {
    ensure_support_tables();
    $raw = uid_token(24);
    $hash = hash('sha256', $raw);
    db()->prepare('INSERT INTO staff_sessions (token_hash, role, staff_name, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 14 DAY))')
        ->execute([$hash, $role, $name]);
    return $raw;
}

function staff_from_token(?string $token = null): ?array {
    ensure_support_tables();
    $token = $token ?? staff_bearer_token();
    if (!$token) return null;
    $hash = hash('sha256', $token);
    $stmt = db()->prepare('SELECT * FROM staff_sessions WHERE token_hash = ? AND expires_at > NOW() LIMIT 1');
    $stmt->execute([$hash]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_staff(): array {
    $s = staff_from_token();
    if (!$s) json_out(['ok' => false, 'error' => 'Staff login required'], 401);
    return $s;
}

function support_get_or_create_thread(int $userId): array {
    ensure_support_tables();
    $stmt = db()->prepare('SELECT * FROM support_threads WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if ($row) {
        if ($row['status'] === 'closed') {
            db()->prepare("UPDATE support_threads SET status = 'open', updated_at = NOW() WHERE id = ?")->execute([(int)$row['id']]);
            $row['status'] = 'open';
        }
        return $row;
    }
    db()->prepare('INSERT INTO support_threads (user_id, status, last_message_at) VALUES (?, \'open\', NOW())')->execute([$userId]);
    $id = (int)db()->lastInsertId();
    $stmt = db()->prepare('SELECT * FROM support_threads WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

function support_list_messages(int $threadId): array {
    $stmt = db()->prepare('SELECT * FROM support_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC');
    $stmt->execute([$threadId]);
    return $stmt->fetchAll();
}

function support_public_thread(array $t, ?array $user = null): array {
    $onlineWindow = 90; // seconds
    $userOnline = false;
    if ($user && !empty($user['last_seen_at'])) {
        $userOnline = (time() - strtotime($user['last_seen_at'])) <= $onlineWindow;
    } elseif (!empty($t['user_last_seen_at'])) {
        $userOnline = (time() - strtotime($t['user_last_seen_at'])) <= $onlineWindow;
    }
    $staffOnline = !empty($t['staff_last_seen_at']) && (time() - strtotime($t['staff_last_seen_at'])) <= $onlineWindow;
    $userTyping = !empty($t['user_typing_at']) && (time() - strtotime($t['user_typing_at'])) <= 6;
    $staffTyping = !empty($t['staff_typing_at']) && (time() - strtotime($t['staff_typing_at'])) <= 6;
    return [
        'id' => (int)$t['id'],
        'userId' => (int)$t['user_id'],
        'status' => $t['status'],
        'userOnline' => $userOnline,
        'staffOnline' => $staffOnline,
        'userTyping' => $userTyping,
        'staffTyping' => $staffTyping,
        'lastMessageAt' => $t['last_message_at'],
        'createdAt' => $t['created_at'],
    ];
}

function support_map_message(array $m): array {
    $url = $m['attachment_url'] ?? null;
    if ($url) {
        $base = chat_attachment_basename((string)$url);
        if ($base !== '') {
            $url = chat_attachment_public_url($base);
        }
    }
    return [
        'id' => (int)$m['id'],
        'threadId' => (int)$m['thread_id'],
        'role' => $m['sender_role'],
        'senderId' => $m['sender_id'] !== null ? (int)$m['sender_id'] : null,
        'staffName' => $m['staff_name'] ?: 'Support',
        'body' => $m['body'],
        'attachmentUrl' => $url,
        'attachmentName' => $m['attachment_name'] ?? null,
        'attachmentMime' => $m['attachment_mime'] ?? null,
        'createdAt' => $m['created_at'],
    ];
}

function user_is_online(?string $lastSeen): bool {
    if (!$lastSeen) return false;
    return (time() - strtotime($lastSeen)) <= 90;
}

function touch_user_presence(int $userId): void {
    ensure_support_tables();
    try {
        db()->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?')->execute([$userId]);
    } catch (Throwable $e) {}
}
