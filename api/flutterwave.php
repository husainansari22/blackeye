<?php
declare(strict_types=1);

/**
 * Flutterwave helpers (Standard v3 hosted checkout + transfer payouts).
 * Owner Admin → Gateways:
 *   Public key  = FLWPUBK_...  (or V4 Client ID — v3 secret preferred for checkout)
 *   Secret key  = FLWSECK_...  (required for live deposits)
 */

function gateway_row(): array {
    $row = db()->query('SELECT * FROM gateway_settings WHERE id = 1')->fetch();
    return $row ?: [];
}

function ensure_tx_reference_column(): void {
    try {
        db()->query('SELECT reference FROM transactions LIMIT 1');
    } catch (Throwable $e) {
        try {
            db()->exec('ALTER TABLE transactions ADD COLUMN reference VARCHAR(80) NULL AFTER note');
            db()->exec('CREATE INDEX idx_tx_reference ON transactions (reference)');
        } catch (Throwable $e2) {
            // ignore if already exists / no permission
        }
    }
}

function flw_http(string $method, string $url, ?array $payload, string $bearer): array {
    $ch = curl_init($url);
    $headers = [
        'Authorization: Bearer ' . $bearer,
        'Content-Type: application/json',
        'Accept: application/json',
    ];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 45,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    }
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        return ['ok' => false, 'http' => $code, 'error' => $err ?: 'Network error talking to Flutterwave'];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['ok' => false, 'http' => $code, 'error' => 'Invalid Flutterwave response', 'raw' => $raw];
    }
    $data['_http'] = $code;
    return $data;
}

function flw_secret(): string {
    $gw = gateway_row();
    return trim((string)($gw['deposit_secret_key'] ?? ''));
}

function flw_public(): string {
    $gw = gateway_row();
    return trim((string)($gw['deposit_public_key'] ?? ''));
}

function flw_withdraw_secret(): string {
    $gw = gateway_row();
    $s = trim((string)($gw['withdraw_secret_key'] ?? ''));
    return $s !== '' ? $s : flw_secret();
}

function flw_deposit_enabled(): bool {
    $gw = gateway_row();
    return !empty($gw['deposit_enabled']) && ($gw['deposit_provider'] ?? '') === 'flutterwave' && flw_secret() !== '';
}

function flw_withdraw_enabled(): bool {
    $gw = gateway_row();
    return !empty($gw['withdraw_enabled']) && in_array(($gw['withdraw_provider'] ?? ''), ['flutterwave', 'manual'], true);
}

function flw_currency(): string {
    return strtoupper((string)setting_get('payment_currency', app_config()['payment_currency'] ?? 'NGN'));
}

function usd_ngn_rate(): float {
    $rate = (float)setting_get('usd_ngn_rate', app_config()['usd_ngn_rate'] ?? 1600);
    return $rate > 0 ? $rate : 1600.0;
}

/** Site wallet is USD; Flutterwave charge may be NGN (or selected local currency converted to NGN). */
function flw_charge_amount(float $usdAmount, string $preferCode = 'NGN'): array {
    $currencies = wallet_currencies_get();
    $rate = usd_ngn_rate();
    $code = strtoupper($preferCode ?: 'NGN');
    foreach (($currencies['local'] ?? []) as $row) {
        if (strtoupper((string)($row['code'] ?? '')) === $code && !empty($row['enabled'])) {
            $rate = (float)($row['rate'] ?? $rate);
            break;
        }
    }
    // Flutterwave hosted checkout on this site charges NGN
    $currency = flw_currency();
    if ($currency === 'NGN') {
        $ngn = (int)round($usdAmount * $rate);
        if ($ngn < 100) $ngn = 100;
        return ['amount' => $ngn, 'currency' => 'NGN', 'usd' => $usdAmount, 'rate' => $rate, 'display' => $code];
    }
    return ['amount' => round($usdAmount, 2), 'currency' => $currency, 'usd' => $usdAmount, 'rate' => 1, 'display' => $code];
}

/**
 * Create hosted checkout link (Flutterwave Standard v3).
 */
function flw_create_checkout(array $user, float $usdAmount, string $txRef, string $preferCode = 'NGN'): array {
    $secret = flw_secret();
    if ($secret === '') {
        return ['ok' => false, 'error' => 'Flutterwave secret key missing in Owner Admin → Gateways'];
    }

    $charge = flw_charge_amount($usdAmount, $preferCode);
    $appUrl = rtrim((string)(app_config()['app_url'] ?? 'https://acctventa.com'), '/');
    $payload = [
        'tx_ref' => $txRef,
        'amount' => (string)$charge['amount'],
        'currency' => $charge['currency'],
        'redirect_url' => $appUrl . '/wallet-return.html',
        'customer' => [
            'email' => $user['email'],
            'name' => $user['name'],
            'phonenumber' => $user['phone'] ?: '0000000000',
        ],
        'customizations' => [
            'title' => (app_config()['app_name'] ?? 'Acctventa') . ' Wallet',
            'description' => 'Fund wallet $' . number_format($usdAmount, 2) . ($charge['currency'] === 'NGN' ? ' (₦' . number_format((float)$charge['amount'], 0) . ')' : ''),
            'logo' => $appUrl . '/img/logo.png',
        ],
        'meta' => [
            'user_id' => (int)$user['id'],
            'purpose' => 'wallet_deposit',
            'usd_amount' => $usdAmount,
            'charge_amount' => $charge['amount'],
            'charge_currency' => $charge['currency'],
            'usd_ngn_rate' => $charge['rate'],
        ],
    ];

    $res = flw_http('POST', 'https://api.flutterwave.com/v3/payments', $payload, $secret);
    if (($res['status'] ?? '') === 'success' && !empty($res['data']['link'])) {
        return [
            'ok' => true,
            'link' => $res['data']['link'],
            'tx_ref' => $txRef,
            'charge' => $charge,
        ];
    }

    $msg = $res['message'] ?? ($res['error'] ?? 'Could not start Flutterwave checkout');
    if (stripos($msg, 'Unauthorized') !== false || (int)($res['_http'] ?? 0) === 401) {
        $msg = 'Flutterwave rejected the secret key. In Flutterwave → Settings → API Keys, copy the Secret Key that starts with FLWSECK_ and paste it in Owner Admin → Gateways → Secret key (not only the V4 Client Secret).';
    }
    return ['ok' => false, 'error' => $msg, 'raw' => $res];
}

function flw_verify_by_id($transactionId): array {
    $secret = flw_secret();
    if ($secret === '') return ['ok' => false, 'error' => 'Missing secret key'];
    $id = rawurlencode((string)$transactionId);
    $res = flw_http('GET', 'https://api.flutterwave.com/v3/transactions/' . $id . '/verify', null, $secret);
    if (($res['status'] ?? '') === 'success' && ($res['data']['status'] ?? '') === 'successful') {
        return ['ok' => true, 'data' => $res['data']];
    }
    return ['ok' => false, 'error' => $res['message'] ?? 'Verification failed', 'raw' => $res];
}

function flw_verify_by_tx_ref(string $txRef): array {
    $secret = flw_secret();
    if ($secret === '') return ['ok' => false, 'error' => 'Missing secret key'];
    $res = flw_http('GET', 'https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' . rawurlencode($txRef), null, $secret);
    if (($res['status'] ?? '') === 'success' && ($res['data']['status'] ?? '') === 'successful') {
        return ['ok' => true, 'data' => $res['data']];
    }
    return ['ok' => false, 'error' => $res['message'] ?? 'Verification failed', 'raw' => $res];
}

/**
 * Credit wallet once for a successful Flutterwave deposit (idempotent by reference).
 * $amountPaid is what Flutterwave charged (often NGN). Wallet credit stays in USD from the pending tx.
 */
function credit_deposit_from_gateway(string $txRef, float $amountPaid, string $flwId = '', string $paidCurrency = ''): array {
    ensure_tx_reference_column();
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM transactions WHERE reference = ? LIMIT 1');
    $stmt->execute([$txRef]);
    $tx = $stmt->fetch();
    if (!$tx) {
        return ['ok' => false, 'error' => 'Deposit reference not found'];
    }
    if ($tx['status'] === 'completed') {
        return ['ok' => true, 'already' => true, 'user_id' => (int)$tx['user_id']];
    }
    if ($tx['type'] !== 'deposit') {
        return ['ok' => false, 'error' => 'Invalid transaction type'];
    }

    // Parse expected charge from note: charge=4800NGN|usd=3.00
    $expectedCharge = null;
    if (preg_match('/charge=([0-9.]+)([A-Z]{3})/i', (string)$tx['note'], $m)) {
        $expectedCharge = (float)$m[1];
        if ($paidCurrency === '') $paidCurrency = strtoupper($m[2]);
    }
    if ($expectedCharge !== null) {
        if ($amountPaid + 1 < $expectedCharge) { // allow ₦1 drift
            return ['ok' => false, 'error' => 'Paid amount mismatch'];
        }
    } else {
        // Legacy USD checkout path
        $expected = (float)$tx['amount'] + (float)$tx['fee'];
        if ($amountPaid + 0.01 < $expected) {
            return ['ok' => false, 'error' => 'Paid amount mismatch'];
        }
    }

    $pdo->beginTransaction();
    try {
        $upd = $pdo->prepare('UPDATE transactions SET status = \'completed\', note = ?, method = ? WHERE id = ? AND status = \'pending\'');
        $upd->execute([
            'Flutterwave confirmed' . ($flwId !== '' ? ' #' . $flwId : '') . ($paidCurrency !== '' ? ' ' . $paidCurrency . ' ' . $amountPaid : ''),
            'flutterwave',
            (int)$tx['id'],
        ]);
        if ($upd->rowCount() < 1) {
            $pdo->commit();
            return ['ok' => true, 'already' => true, 'user_id' => (int)$tx['user_id']];
        }
        $credited = (float)$tx['amount'];
        $pdo->prepare('UPDATE users SET balance = balance + ?, total_deposits = total_deposits + ? WHERE id = ?')
            ->execute([money_f($credited), money_f($credited), (int)$tx['user_id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    notify_user((int)$tx['user_id'], 'Deposit successful', 'Your wallet was funded with $' . money_f($credited), 'wallet');
    try {
        maybe_credit_referral_reward((int)$tx['user_id']);
    } catch (Throwable $e) {}
    return ['ok' => true, 'credited' => $credited, 'user_id' => (int)$tx['user_id']];
}
