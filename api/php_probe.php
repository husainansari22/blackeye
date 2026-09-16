<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode([
    'ok' => true,
    'php' => PHP_VERSION,
    'time' => gmdate('c'),
    'sapi' => PHP_SAPI,
]);
