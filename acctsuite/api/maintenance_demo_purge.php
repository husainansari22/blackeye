<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
$secret = 'as-purge-20260905-kelvin';
$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$token = (string)($body['token'] ?? $_GET['token'] ?? $_POST['token'] ?? '');
if (!hash_equals($secret, $token)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}
$action = (string)($body['action'] ?? $_GET['action'] ?? 'list');
if ($action === 'list') {
    $rows = db()->query('SELECT id, name, email, created_at, is_banned, is_verified, balance FROM users ORDER BY id ASC LIMIT 500')->fetchAll();
    echo json_encode(['ok' => true, 'users' => $rows], JSON_PRETTY_PRINT);
    exit;
}
if ($action === 'purge_demos') {
    $deleted = owner_purge_demo_users();
    echo json_encode(['ok' => true, 'deleted' => $deleted], JSON_PRETTY_PRINT);
    exit;
}
http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown action']);
