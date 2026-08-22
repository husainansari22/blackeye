<?php
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
$uri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($uri, PHP_URL_PATH) ?: '';
$path = strtolower($path);

if (preg_match('#^/blog(/|$)#', $path)
    || preg_match('#^/blogs(/|$)#', $path)
    || preg_match('#^/blog-details(/|$)#', $path)
    || preg_match('#^/home(/|$)#', $path)
    || preg_match('#^/about(/|$)#', $path)
    || preg_match('#^/features(/|$)#', $path)
    || preg_match('#^/how-?it-?works(/|$)#', $path)
) {
    header('Location: https://acctventa.com/', true, 301);
    exit;
}

if (preg_match('#^/social-account#', $path)) {
    header('Location: https://acctventa.com/marketplace', true, 301);
    exit;
}

if (preg_match('#^/dashboard(/|$)#', $path)) {
    header('Location: https://acctventa.com/dashboard.html', true, 301);
    exit;
}

http_response_code(404);
header('Content-Type: text/html; charset=UTF-8');
readfile(__DIR__ . '/404.html');
