<?php
http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['ok'=>false,'error'=>'Gone']);
