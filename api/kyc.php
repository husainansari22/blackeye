<?php
declare(strict_types=1);

/**
 * Business KYC — document upload, camera-vs-screenshot AI screen, owner review.
 */

function ensure_kyc_tables(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    db()->exec("CREATE TABLE IF NOT EXISTS kyc_submissions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'needs_review',
      business_name VARCHAR(190) NOT NULL DEFAULT '',
      business_username VARCHAR(120) NOT NULL DEFAULT '',
      registration_number VARCHAR(120) NOT NULL DEFAULT '',
      business_type VARCHAR(80) NOT NULL DEFAULT '',
      industry VARCHAR(120) NOT NULL DEFAULT '',
      business_address TEXT,
      contact_person VARCHAR(190) NOT NULL DEFAULT '',
      contact_title VARCHAR(120) NOT NULL DEFAULT '',
      contact_email VARCHAR(190) NOT NULL DEFAULT '',
      contact_phone VARCHAR(60) NOT NULL DEFAULT '',
      owner_name VARCHAR(190) NOT NULL DEFAULT '',
      ownership_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
      owner_address TEXT,
      owner_dob VARCHAR(40) NOT NULL DEFAULT '',
      bank_account VARCHAR(80) NOT NULL DEFAULT '',
      bank_name VARCHAR(120) NOT NULL DEFAULT '',
      tax_id VARCHAR(80) NOT NULL DEFAULT '',
      doc_cac_url VARCHAR(500) NOT NULL DEFAULT '',
      doc_cac_name VARCHAR(190) NOT NULL DEFAULT '',
      doc_reg_url VARCHAR(500) NOT NULL DEFAULT '',
      doc_reg_name VARCHAR(190) NOT NULL DEFAULT '',
      doc_id_url VARCHAR(500) NOT NULL DEFAULT '',
      doc_id_name VARCHAR(190) NOT NULL DEFAULT '',
      doc_address_url VARCHAR(500) NOT NULL DEFAULT '',
      doc_address_name VARCHAR(190) NOT NULL DEFAULT '',
      ai_summary TEXT,
      ai_json MEDIUMTEXT,
      reject_reason VARCHAR(500) NOT NULL DEFAULT '',
      reviewed_by VARCHAR(80) NOT NULL DEFAULT '',
      reviewed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (status),
      CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $dir = dirname(__DIR__) . '/uploads/kyc';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|phar)$\">\nDeny from all\n</FilesMatch>\n");
    }
}

function save_kyc_document(string $data, string $filename = '', string $mimeHint = ''): array {
    ensure_kyc_tables();
    $mime = $mimeHint;
    $bin = '';
    if (preg_match('#^data:([^;]+);base64,(.+)$#s', $data, $m)) {
        $mime = $m[1];
        $bin = base64_decode($m[2], true);
    } else {
        $bin = base64_decode($data, true);
    }
    if ($bin === false || $bin === '') {
        throw new RuntimeException('Invalid document data');
    }
    if (strlen($bin) > 6 * 1024 * 1024) {
        throw new RuntimeException('Document too large (max 6MB)');
    }
    $mime = strtolower(trim($mime ?: 'application/octet-stream'));
    $allowed = [
        'image/jpeg' => 'jpg', 'image/jpg' => 'jpg', 'image/png' => 'png',
        'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heif',
        'application/pdf' => 'pdf',
    ];
    if (!isset($allowed[$mime])) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detected = $finfo->buffer($bin) ?: '';
        if (isset($allowed[$detected])) {
            $mime = $detected;
        } else {
            throw new RuntimeException('Use a camera photo (JPEG/PNG/WebP) or PDF, max 6MB.');
        }
    }
    $ext = $allowed[$mime];
    $safeName = preg_replace('/[^a-zA-Z0-9._-]+/', '_', basename($filename ?: ('doc.' . $ext)));
    if ($safeName === '' || $safeName === '_') $safeName = 'doc.' . $ext;
    $stored = bin2hex(random_bytes(14)) . '.' . $ext;
    $path = dirname(__DIR__) . '/uploads/kyc/' . $stored;
    if (file_put_contents($path, $bin) === false) {
        throw new RuntimeException('Could not save document');
    }
    return [
        'url' => '/uploads/kyc/' . $stored,
        'name' => $safeName,
        'mime' => $mime,
        'path' => $path,
        'bin' => $bin,
    ];
}

/**
 * DocScan AI — camera photo vs screenshot/edited, plus blur check.
 * Uses EXIF, software tags, dimensions, and Laplacian variance (GD).
 */
function kyc_analyze_document(string $bin, string $mime, string $label, ?array $clientHints = null): array {
    $score = 55;
    $flags = [];
    $isImage = str_starts_with($mime, 'image/');
    $blurScore = null;
    $hasCameraExif = false;
    $looksScreenshot = false;

    if (!$isImage) {
        // PDF — cannot run vision heuristics; send to manual review
        $flags[] = 'PDF uploaded — queued for manual document review';
        $score = 60;
        return [
            'label' => $label,
            'verdict' => 'needs_review',
            'score' => $score,
            'blurScore' => null,
            'flags' => $flags,
            'message' => 'Document accepted for manual review.',
        ];
    }

    $w = 0;
    $h = 0;
    $info = @getimagesizefromstring($bin);
    if (is_array($info)) {
        $w = (int)($info[0] ?? 0);
        $h = (int)($info[1] ?? 0);
    }

    // EXIF (JPEG)
    if (function_exists('exif_read_data') && (str_contains($mime, 'jpeg') || str_contains($mime, 'jpg'))) {
        $tmp = tempnam(sys_get_temp_dir(), 'kycx');
        if ($tmp) {
            file_put_contents($tmp, $bin);
            $exif = @exif_read_data($tmp, 'ANY_TAG', true);
            @unlink($tmp);
            if (is_array($exif)) {
                $make = (string)($exif['IFD0']['Make'] ?? $exif['MAKE'] ?? '');
                $model = (string)($exif['IFD0']['Model'] ?? $exif['MODEL'] ?? '');
                $soft = strtolower((string)($exif['IFD0']['Software'] ?? $exif['COMPUTED']['Software'] ?? ''));
                $dto = (string)($exif['EXIF']['DateTimeOriginal'] ?? '');
                if ($make !== '' || $model !== '' || $dto !== '') {
                    $hasCameraExif = true;
                    $score += 28;
                    $flags[] = 'Camera EXIF detected' . ($make || $model ? (' (' . trim($make . ' ' . $model) . ')') : '');
                }
                foreach (['screenshot', 'snipping', 'snagit', 'lightshot', 'skitch', 'greenshot', 'sharex'] as $bad) {
                    if ($soft !== '' && str_contains($soft, $bad)) {
                        $looksScreenshot = true;
                        $score -= 45;
                        $flags[] = 'Editing/screenshot software tag: ' . $soft;
                    }
                }
            }
        }
    }

    // Client-side hints (from device camera capture / canvas analysis)
    if (is_array($clientHints)) {
        if (!empty($clientHints['fromCameraCapture'])) {
            $score += 12;
            $flags[] = 'Captured via device camera';
        }
        if (!empty($clientHints['hasExif'])) {
            $hasCameraExif = true;
            $score += 8;
        }
        if (isset($clientHints['blurScore'])) {
            $blurScore = (float)$clientHints['blurScore'];
        }
        if (!empty($clientHints['suspectedScreenshot'])) {
            $looksScreenshot = true;
            $score -= 35;
            $flags[] = 'Client DocScan flagged screenshot characteristics';
        }
    }

    // Common phone screenshot aspect / exact sizes
    $screenshotSizes = [
        [1170, 2532], [1284, 2778], [1125, 2436], [1242, 2688],
        [1080, 2400], [1080, 2340], [1440, 3200], [750, 1334],
        [828, 1792], [1242, 2208],
    ];
    foreach ($screenshotSizes as [$sw, $sh]) {
        if (($w === $sw && $h === $sh) || ($w === $sh && $h === $sw)) {
            $looksScreenshot = true;
            $score -= 30;
            $flags[] = "Exact device screenshot resolution ({$w}×{$h})";
            break;
        }
    }

    // Tiny or oddly small images for ID/CAC
    if ($w > 0 && $h > 0 && ($w * $h) < 180000) {
        $score -= 15;
        $flags[] = 'Image resolution is low for document verification';
    }

    // Server-side blur via Laplacian variance
    if ($blurScore === null && function_exists('imagecreatefromstring')) {
        $blurScore = kyc_laplacian_variance($bin);
        if ($blurScore !== null) {
            if ($blurScore < 40) {
                $score -= 18;
                $flags[] = 'Image appears blurry (sharpness ' . round($blurScore, 1) . ')';
            } elseif ($blurScore > 120) {
                $score += 6;
                $flags[] = 'Image sharpness looks good';
            }
        }
    } elseif ($blurScore !== null) {
        if ($blurScore < 40) {
            $score -= 18;
            $flags[] = 'Image appears blurry (sharpness ' . round($blurScore, 1) . ')';
        } elseif ($blurScore > 120) {
            $score += 6;
        }
    }

    // PNG without EXIF + very clean edges often screenshots
    if (str_contains($mime, 'png') && !$hasCameraExif && empty($clientHints['fromCameraCapture'])) {
        $score -= 10;
        $flags[] = 'PNG without camera metadata — common for screenshots';
    }

    $score = max(0, min(100, $score));
    $verdict = 'needs_review';
    $message = 'Document queued for manual review.';

    if ($looksScreenshot || $score < 35) {
        $verdict = 'reject';
        $message = 'This looks like a screenshot or edited image. Please retake a clear photo of the physical document with your device camera.';
    } elseif ($blurScore !== null && $blurScore < 45 && $score >= 35) {
        $verdict = 'blurry_review';
        $message = 'Document looks authentic but is blurry. Sent to manual review.';
    } elseif ($hasCameraExif || !empty($clientHints['fromCameraCapture'])) {
        $verdict = 'needs_review';
        $message = 'Camera photo accepted. Pending owner verification.';
    }

    return [
        'label' => $label,
        'verdict' => $verdict,
        'score' => $score,
        'blurScore' => $blurScore,
        'flags' => $flags,
        'message' => $message,
        'width' => $w,
        'height' => $h,
    ];
}

function kyc_laplacian_variance(string $bin): ?float {
    if (!function_exists('imagecreatefromstring')) return null;
    $im = @imagecreatefromstring($bin);
    if (!$im) return null;
    $w = imagesx($im);
    $h = imagesy($im);
    if ($w < 8 || $h < 8) {
        imagedestroy($im);
        return null;
    }
    $tw = min(320, $w);
    $th = max(8, (int)round($h * ($tw / $w)));
    $small = imagecreatetruecolor($tw, $th);
    imagecopyresampled($small, $im, 0, 0, 0, 0, $tw, $th, $w, $h);
    imagedestroy($im);

    $gray = [];
    for ($y = 0; $y < $th; $y++) {
        $row = [];
        for ($x = 0; $x < $tw; $x++) {
            $rgb = imagecolorat($small, $x, $y);
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;
            $row[] = 0.299 * $r + 0.587 * $g + 0.114 * $b;
        }
        $gray[] = $row;
    }
    imagedestroy($small);

    $vals = [];
    for ($y = 1; $y < $th - 1; $y++) {
        for ($x = 1; $x < $tw - 1; $x++) {
            $lap = -4 * $gray[$y][$x]
                + $gray[$y][$x - 1] + $gray[$y][$x + 1]
                + $gray[$y - 1][$x] + $gray[$y + 1][$x];
            $vals[] = $lap;
        }
    }
    $n = count($vals);
    if ($n < 10) return null;
    $mean = array_sum($vals) / $n;
    $var = 0.0;
    foreach ($vals as $v) {
        $d = $v - $mean;
        $var += $d * $d;
    }
    return $var / $n;
}

function kyc_latest_for_user(int $userId): ?array {
    ensure_kyc_tables();
    $stmt = db()->prepare('SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY id DESC LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function kyc_public_row(?array $row): ?array {
    if (!$row) return null;
    return [
        'id' => (int)$row['id'],
        'status' => $row['status'],
        'businessName' => $row['business_name'],
        'rejectReason' => $row['reject_reason'] ?? '',
        'aiSummary' => $row['ai_summary'] ?? '',
        'createdAt' => $row['created_at'],
        'reviewedAt' => $row['reviewed_at'],
        'docs' => [
            'cac' => $row['doc_cac_url'] ?: null,
            'registration' => $row['doc_reg_url'] ?: null,
            'idCard' => $row['doc_id_url'] ?: null,
            'proofOfAddress' => $row['doc_address_url'] ?: null,
        ],
    ];
}

function kyc_status_for_user(array $u): array {
    ensure_kyc_tables();
    $verified = (int)($u['is_verified'] ?? 0) === 1;
    $latest = kyc_latest_for_user((int)$u['id']);
    $status = 'none';
    if ($verified) {
        $status = 'verified';
    } elseif ($latest) {
        $status = (string)$latest['status'];
    }
    return [
        'isVerified' => $verified,
        'kycStatus' => $status,
        'submission' => kyc_public_row($latest),
    ];
}

function kyc_submit(array $u, array $payload): array {
    ensure_kyc_tables();
    $uid = (int)$u['id'];
    if ((int)($u['is_verified'] ?? 0) === 1) {
        throw new RuntimeException('Your business is already verified.');
    }
    $latest = kyc_latest_for_user($uid);
    if ($latest && in_array($latest['status'], ['needs_review', 'blurry_review', 'pending'], true)) {
        throw new RuntimeException('You already have a KYC application under review.');
    }

    $req = [
        'businessName' => trim((string)($payload['businessName'] ?? '')),
        'businessUsername' => trim((string)($payload['businessUsername'] ?? '')),
        'registrationNumber' => trim((string)($payload['registrationNumber'] ?? '')),
        'businessType' => trim((string)($payload['businessType'] ?? '')),
        'industry' => trim((string)($payload['industry'] ?? '')),
        'businessAddress' => trim((string)($payload['businessAddress'] ?? '')),
        'contactPerson' => trim((string)($payload['contactPerson'] ?? '')),
        'contactTitle' => trim((string)($payload['contactTitle'] ?? '')),
        'contactEmail' => trim((string)($payload['contactEmail'] ?? '')),
        'contactPhone' => trim((string)($payload['contactPhone'] ?? '')),
        'ownerName' => trim((string)($payload['ownerName'] ?? '')),
        'ownershipPct' => (float)($payload['ownershipPct'] ?? 100),
        'ownerAddress' => trim((string)($payload['ownerAddress'] ?? '')),
        'ownerDob' => trim((string)($payload['ownerDob'] ?? '')),
        'bankAccount' => trim((string)($payload['bankAccount'] ?? '')),
        'bankName' => trim((string)($payload['bankName'] ?? '')),
        'taxId' => trim((string)($payload['taxId'] ?? '')),
    ];

    foreach (['businessName', 'registrationNumber', 'businessType', 'industry', 'businessAddress', 'contactPerson', 'contactEmail', 'contactPhone', 'ownerName', 'bankAccount', 'bankName'] as $k) {
        if ($req[$k] === '') {
            throw new RuntimeException('Please complete all required business KYC fields.');
        }
    }

    $docsIn = $payload['documents'] ?? [];
    if (!is_array($docsIn)) $docsIn = [];
    $needed = ['cac' => 'CAC / Certificate of Incorporation', 'idCard' => 'Valid ID card'];
    $optional = ['registration' => 'Business registration document', 'proofOfAddress' => 'Proof of address'];
    $saved = [];
    $analyses = [];

    foreach ($needed as $key => $label) {
        $doc = $docsIn[$key] ?? null;
        if (!is_array($doc) || empty($doc['data'])) {
            throw new RuntimeException($label . ' is required. Upload a clear camera photo.');
        }
        $file = save_kyc_document((string)$doc['data'], (string)($doc['name'] ?? $key), (string)($doc['mime'] ?? ''));
        $hint = is_array($doc['ai'] ?? null) ? $doc['ai'] : null;
        $analysis = kyc_analyze_document($file['bin'], $file['mime'], $label, $hint);
        unset($file['bin'], $file['path']);
        $saved[$key] = $file;
        $analyses[$key] = $analysis;
        if ($analysis['verdict'] === 'reject') {
            throw new RuntimeException($label . ': ' . $analysis['message']);
        }
    }

    foreach ($optional as $key => $label) {
        $doc = $docsIn[$key] ?? null;
        if (!is_array($doc) || empty($doc['data'])) continue;
        $file = save_kyc_document((string)$doc['data'], (string)($doc['name'] ?? $key), (string)($doc['mime'] ?? ''));
        $hint = is_array($doc['ai'] ?? null) ? $doc['ai'] : null;
        $analysis = kyc_analyze_document($file['bin'], $file['mime'], $label, $hint);
        unset($file['bin'], $file['path']);
        $saved[$key] = $file;
        $analyses[$key] = $analysis;
        if ($analysis['verdict'] === 'reject') {
            throw new RuntimeException($label . ': ' . $analysis['message']);
        }
    }

    $status = 'needs_review';
    foreach ($analyses as $a) {
        if (($a['verdict'] ?? '') === 'blurry_review') {
            $status = 'blurry_review';
            break;
        }
    }

    $summaryParts = [];
    foreach ($analyses as $a) {
        $summaryParts[] = ($a['label'] ?? 'Doc') . ': score ' . ($a['score'] ?? 0) . ' — ' . ($a['message'] ?? '');
    }
    $aiSummary = implode("\n", $summaryParts);

    $stmt = db()->prepare('INSERT INTO kyc_submissions (
        user_id, status, business_name, business_username, registration_number, business_type, industry, business_address,
        contact_person, contact_title, contact_email, contact_phone,
        owner_name, ownership_pct, owner_address, owner_dob,
        bank_account, bank_name, tax_id,
        doc_cac_url, doc_cac_name, doc_reg_url, doc_reg_name, doc_id_url, doc_id_name, doc_address_url, doc_address_name,
        ai_summary, ai_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $uid, $status,
        $req['businessName'], $req['businessUsername'], $req['registrationNumber'], $req['businessType'], $req['industry'], $req['businessAddress'],
        $req['contactPerson'], $req['contactTitle'], $req['contactEmail'], $req['contactPhone'],
        $req['ownerName'], money_f($req['ownershipPct']), $req['ownerAddress'], $req['ownerDob'],
        $req['bankAccount'], $req['bankName'], $req['taxId'],
        $saved['cac']['url'] ?? '', $saved['cac']['name'] ?? '',
        $saved['registration']['url'] ?? '', $saved['registration']['name'] ?? '',
        $saved['idCard']['url'] ?? '', $saved['idCard']['name'] ?? '',
        $saved['proofOfAddress']['url'] ?? '', $saved['proofOfAddress']['name'] ?? '',
        $aiSummary, json_encode(['docs' => $analyses], JSON_UNESCAPED_UNICODE),
    ]);

    $msg = $status === 'blurry_review'
        ? 'Documents look authentic but one or more are blurry. Our team will review manually.'
        : 'Business KYC submitted. DocScan AI screened your uploads — pending owner review.';
    try {
        notify_user($uid, 'Business KYC submitted', $msg, 'kyc');
    } catch (Throwable $e) {}

    return kyc_status_for_user($u);
}
