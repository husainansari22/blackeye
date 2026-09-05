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

function flw_http(string $method, string $url, ?array $payload, string $bearer, int $timeoutSec = 20): array {
    $ch = curl_init($url);
    $headers = [
        'Authorization: Bearer ' . $bearer,
        'Content-Type: application/json',
        'Accept: application/json',
    ];
    $timeoutSec = max(5, min(45, $timeoutSec));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => min(8, $timeoutSec),
        CURLOPT_TIMEOUT => $timeoutSec,
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
 * $opts: redirect_url, title, description, purpose, meta (array)
 */
function flw_create_checkout(array $user, float $usdAmount, string $txRef, string $preferCode = 'NGN', array $opts = []): array {
    $secret = flw_secret();
    if ($secret === '') {
        return ['ok' => false, 'error' => 'Flutterwave secret key missing in Owner Admin → Gateways'];
    }

    $charge = flw_charge_amount($usdAmount, $preferCode);
    $appUrl = rtrim((string)(app_config()['app_url'] ?? 'https://acctventa.com'), '/');
    $purpose = (string)($opts['purpose'] ?? 'wallet_deposit');
    $title = (string)($opts['title'] ?? ((app_config()['app_name'] ?? 'Acctventa') . ' Wallet'));
    $description = (string)($opts['description'] ?? ('Fund wallet $' . number_format($usdAmount, 2) . ($charge['currency'] === 'NGN' ? ' (₦' . number_format((float)$charge['amount'], 0) . ')' : '')));
    $redirect = (string)($opts['redirect_url'] ?? ($appUrl . '/wallet-return.html'));
    $meta = array_merge([
        'user_id' => (int)$user['id'],
        'purpose' => $purpose,
        'usd_amount' => $usdAmount,
        'charge_amount' => $charge['amount'],
        'charge_currency' => $charge['currency'],
        'usd_ngn_rate' => $charge['rate'],
    ], is_array($opts['meta'] ?? null) ? $opts['meta'] : []);

    $payload = [
        'tx_ref' => $txRef,
        'amount' => (string)$charge['amount'],
        'currency' => $charge['currency'],
        'redirect_url' => $redirect,
        'customer' => [
            'email' => $user['email'],
            'name' => $user['name'],
            'phonenumber' => $user['phone'] ?: '0000000000',
        ],
        'customizations' => [
            'title' => $title,
            'description' => $description,
            'logo' => $appUrl . '/img/logo.png',
        ],
        'meta' => $meta,
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

function flw_secret_looks_valid(?string $secret = null): bool {
    $s = trim((string)($secret !== null ? $secret : flw_secret()));
    // Standard v3 secret: FLWSECK_TEST-... / FLWSECK_LIVE-... / FLWSECK-...
    return (bool)preg_match('/^FLWSECK(_(TEST|LIVE))?-[A-Za-z0-9]+/i', $s);
}

/** Lightweight ping used after Owner saves gateway keys. */
function flw_ping_secret(string $secret = ''): array {
    $secret = trim($secret !== '' ? $secret : flw_secret());
    if ($secret === '') {
        return ['ok' => false, 'error' => 'Secret key is empty'];
    }
    if (!flw_secret_looks_valid($secret)) {
        return [
            'ok' => false,
            'error' => 'Secret key format looks wrong. Paste the full Secret Key from Flutterwave → Settings → API Keys (starts with FLWSECK_TEST- or FLWSECK_LIVE-). Do not paste the encryption key or V4 Client Secret.',
        ];
    }
    // Banks endpoint is a cheap authenticated GET
    $res = flw_http('GET', 'https://api.flutterwave.com/v3/banks/NG', null, $secret, 12);
    if (($res['status'] ?? '') === 'success') {
        return ['ok' => true, 'message' => 'Flutterwave secret key works'];
    }
    $http = (int)($res['_http'] ?? $res['http'] ?? 0);
    $msg = (string)($res['message'] ?? $res['error'] ?? 'Flutterwave rejected this secret key');
    if ($http === 401 || stripos($msg, 'Unauthorized') !== false) {
        $msg = 'Flutterwave rejected the secret key (Unauthorized). Copy the LIVE Secret Key from your business account (FLWSECK_LIVE-…) and paste the full value — not truncated, not the public key, not the encryption hash.';
    }
    return ['ok' => false, 'error' => $msg, 'http' => $http, 'raw' => $res];
}

function flw_verify_by_id($transactionId): array {
    $secret = flw_secret();
    if ($secret === '') return ['ok' => false, 'error' => 'Missing secret key'];
    $id = rawurlencode((string)$transactionId);
    $res = flw_http('GET', 'https://api.flutterwave.com/v3/transactions/' . $id . '/verify', null, $secret, 15);
    if (($res['status'] ?? '') === 'success' && ($res['data']['status'] ?? '') === 'successful') {
        return ['ok' => true, 'data' => $res['data']];
    }
    $msg = $res['message'] ?? 'Verification failed';
    if ((int)($res['_http'] ?? 0) === 401 || stripos((string)$msg, 'Unauthorized') !== false) {
        $msg = 'Flutterwave secret key was rejected while verifying payment. Re-paste your business FLWSECK_LIVE key in Owner → Gateways.';
    }
    return ['ok' => false, 'error' => $msg, 'raw' => $res];
}

function flw_verify_by_tx_ref(string $txRef): array {
    $secret = flw_secret();
    if ($secret === '') return ['ok' => false, 'error' => 'Missing secret key'];
    $res = flw_http('GET', 'https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' . rawurlencode($txRef), null, $secret, 15);
    if (($res['status'] ?? '') === 'success' && ($res['data']['status'] ?? '') === 'successful') {
        return ['ok' => true, 'data' => $res['data']];
    }
    $msg = $res['message'] ?? 'Verification failed';
    if ((int)($res['_http'] ?? 0) === 401 || stripos((string)$msg, 'Unauthorized') !== false) {
        $msg = 'Flutterwave secret key was rejected while verifying payment. Re-paste your business FLWSECK_LIVE key in Owner → Gateways.';
    }
    return ['ok' => false, 'error' => $msg, 'raw' => $res];
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
    return ['ok' => true, 'credited' => $credited, 'user_id' => (int)$tx['user_id'], 'kind' => 'deposit'];
}

function ensure_plan_tx_type(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->exec("ALTER TABLE transactions MODIFY COLUMN type ENUM('deposit','withdrawal','sale','purchase','refund','commission','plan') NOT NULL");
    } catch (Throwable $e) {
        // ignore if already compatible / no permission
    }
}

/**
 * Activate a paid plan after Flutterwave confirms payment (idempotent by reference).
 */
function activate_plan_from_gateway(string $txRef, float $amountPaid, string $flwId = '', string $paidCurrency = ''): array {
    ensure_tx_reference_column();
    ensure_plan_tx_type();
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM transactions WHERE reference = ? LIMIT 1');
    $stmt->execute([$txRef]);
    $tx = $stmt->fetch();
    if (!$tx) {
        return ['ok' => false, 'error' => 'Plan payment reference not found'];
    }
    if ($tx['status'] === 'completed') {
        $u = $pdo->query('SELECT plan FROM users WHERE id=' . (int)$tx['user_id'])->fetch();
        return ['ok' => true, 'already' => true, 'user_id' => (int)$tx['user_id'], 'plan' => $u['plan'] ?? null, 'kind' => 'plan'];
    }
    if (($tx['type'] ?? '') !== 'plan') {
        return ['ok' => false, 'error' => 'Invalid plan transaction type'];
    }

    $planId = '';
    if (preg_match('/plan=([a-z0-9_]+)/i', (string)$tx['note'], $m)) {
        $planId = strtolower($m[1]);
    }
    if ($planId === '' || $planId === 'free') {
        return ['ok' => false, 'error' => 'Plan id missing on payment'];
    }
    $plan = plan_limits($planId);
    if (($plan['id'] ?? '') !== $planId) {
        return ['ok' => false, 'error' => 'Unknown plan'];
    }

    $expectedCharge = null;
    if (preg_match('/charge=([0-9.]+)([A-Z]{3})/i', (string)$tx['note'], $m)) {
        $expectedCharge = (float)$m[1];
        if ($paidCurrency === '') $paidCurrency = strtoupper($m[2]);
    }
    if ($expectedCharge !== null) {
        if ($amountPaid + 1 < $expectedCharge) {
            return ['ok' => false, 'error' => 'Paid amount mismatch'];
        }
    } else {
        $expected = (float)$tx['amount'];
        if ($amountPaid + 0.01 < $expected && $paidCurrency === 'USD') {
            return ['ok' => false, 'error' => 'Paid amount mismatch'];
        }
    }

    $pdo->beginTransaction();
    try {
        $upd = $pdo->prepare('UPDATE transactions SET status = \'completed\', note = ?, method = ? WHERE id = ? AND status = \'pending\'');
        $upd->execute([
            'Plan upgrade confirmed · plan=' . $planId . ($flwId !== '' ? ' · Flutterwave #' . $flwId : '') . ($paidCurrency !== '' ? ' · ' . $paidCurrency . ' ' . $amountPaid : ''),
            'flutterwave',
            (int)$tx['id'],
        ]);
        if ($upd->rowCount() < 1) {
            $pdo->commit();
            $u = $pdo->query('SELECT plan FROM users WHERE id=' . (int)$tx['user_id'])->fetch();
            return ['ok' => true, 'already' => true, 'user_id' => (int)$tx['user_id'], 'plan' => $u['plan'] ?? $planId, 'kind' => 'plan'];
        }
        $pdo->prepare('UPDATE users SET plan = ? WHERE id = ?')->execute([$planId, (int)$tx['user_id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $uploads = (int)($plan['daily_uploads'] ?? 0);
    notify_user(
        (int)$tx['user_id'],
        'Plan upgraded',
        'Your ' . ($plan['name'] ?? $planId) . ' plan is active — ' . $uploads . ' uploads / day.',
        'plan'
    );
    return [
        'ok' => true,
        'user_id' => (int)$tx['user_id'],
        'plan' => $planId,
        'planName' => $plan['name'] ?? $planId,
        'dailyUploads' => $uploads,
        'kind' => 'plan',
    ];
}

/**
 * Route a verified Flutterwave payment to deposit credit or plan activation.
 */
function settle_flutterwave_payment(string $txRef, float $amountPaid, string $flwId = '', string $paidCurrency = ''): array {
    ensure_tx_reference_column();
    $stmt = db()->prepare('SELECT type FROM transactions WHERE reference = ? LIMIT 1');
    $stmt->execute([$txRef]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['ok' => false, 'error' => 'Payment reference not found'];
    }
    $type = (string)($row['type'] ?? '');
    if ($type === 'plan') {
        return activate_plan_from_gateway($txRef, $amountPaid, $flwId, $paidCurrency);
    }
    return credit_deposit_from_gateway($txRef, $amountPaid, $flwId, $paidCurrency);
}

/** Nigerian (or other) bank list from Flutterwave for withdrawal forms. */
function flw_list_banks(string $country = 'NG'): array {
    $secret = flw_withdraw_secret();
    if ($secret === '') return ['ok' => false, 'error' => 'Flutterwave secret key missing', 'banks' => []];
    $country = strtoupper($country ?: 'NG');
    $res = flw_http('GET', 'https://api.flutterwave.com/v3/banks/' . rawurlencode($country), null, $secret);
    if (($res['status'] ?? '') !== 'success' || !is_array($res['data'] ?? null)) {
        return ['ok' => false, 'error' => $res['message'] ?? 'Could not load banks', 'banks' => []];
    }
    $banks = [];
    foreach ($res['data'] as $b) {
        if (!is_array($b)) continue;
        $code = (string)($b['code'] ?? '');
        $name = (string)($b['name'] ?? '');
        if ($code === '' || $name === '') continue;
        $banks[] = ['code' => $code, 'name' => $name];
    }
    usort($banks, static fn($a, $b) => strcasecmp($a['name'], $b['name']));
    return ['ok' => true, 'banks' => $banks];
}

/** Best-effort match of a free-text bank name to a Flutterwave bank code. */
function flw_resolve_bank_code(string $bankName, string $country = 'NG'): string {
    $bankName = trim($bankName);
    if ($bankName === '') return '';
    if (preg_match('/^\d{3,6}$/', $bankName)) return $bankName;
    $list = flw_list_banks($country);
    if (empty($list['ok'])) return '';
    $needle = strtolower($bankName);
    foreach ($list['banks'] as $b) {
        $name = strtolower((string)$b['name']);
        if ($name === $needle || strpos($name, $needle) !== false || strpos($needle, $name) !== false) {
            return (string)$b['code'];
        }
    }
    return '';
}

/**
 * Send a bank payout via Flutterwave Transfer API.
 * Amount is USD from our ledger; converted to NGN (or local) for the transfer.
 */
function flw_create_bank_transfer(array $opts): array {
    $secret = flw_withdraw_secret();
    if ($secret === '') {
        return ['ok' => false, 'error' => 'Flutterwave withdraw secret key missing in Owner Admin → Gateways'];
    }
    $accountNumber = preg_replace('/\s+/', '', (string)($opts['account_number'] ?? ''));
    $bankCode = trim((string)($opts['bank_code'] ?? ''));
    $usd = (float)($opts['usd_amount'] ?? 0);
    $reference = trim((string)($opts['reference'] ?? ''));
    $narration = trim((string)($opts['narration'] ?? 'Acctventa withdrawal'));
    $currency = strtoupper((string)($opts['currency'] ?? 'NGN'));
    if ($accountNumber === '' || $bankCode === '') {
        return ['ok' => false, 'error' => 'Bank code and account number are required for Flutterwave payout'];
    }
    if ($usd <= 0 || $reference === '') {
        return ['ok' => false, 'error' => 'Invalid payout amount or reference'];
    }
    if ($currency !== 'NGN') {
        // Currently we payout NGN via Flutterwave for African bank accounts.
        $currency = 'NGN';
    }
    $rate = usd_ngn_rate();
    $ngn = (int)round($usd * $rate);
    if ($ngn < 100) $ngn = 100;

    $payload = [
        'account_bank' => $bankCode,
        'account_number' => $accountNumber,
        'amount' => $ngn,
        'narration' => $narration,
        'currency' => $currency,
        'reference' => $reference,
        'debit_currency' => $currency,
    ];
    $res = flw_http('POST', 'https://api.flutterwave.com/v3/transfers', $payload, $secret);
    if (($res['status'] ?? '') === 'success' && !empty($res['data'])) {
        return [
            'ok' => true,
            'transfer' => $res['data'],
            'flw_id' => (string)($res['data']['id'] ?? ''),
            'status' => strtoupper((string)($res['data']['status'] ?? 'NEW')),
            'amount_ngn' => $ngn,
            'rate' => $rate,
        ];
    }
    $msg = $res['message'] ?? ($res['error'] ?? 'Flutterwave transfer failed');
    return ['ok' => false, 'error' => $msg, 'raw' => $res];
}

/**
 * Admin-approved withdrawal payout.
 * - Bank + Flutterwave withdraw enabled → auto-transfer
 * - Force manual / crypto / provider=manual → mark completed (you paid outside)
 */
function approve_withdrawal_payout(array $tx, string $actorNote = '', bool $forceManual = false): array {
    if (($tx['type'] ?? '') !== 'withdrawal') {
        return ['ok' => false, 'error' => 'Not a withdrawal'];
    }
    if (($tx['status'] ?? '') !== 'pending') {
        return ['ok' => false, 'error' => 'Withdrawal is not pending'];
    }
    $method = strtolower((string)($tx['method'] ?? 'bank'));
    $payoutUsd = (float)($tx['payout'] ?? $tx['amount'] ?? 0);
    $note = (string)($tx['note'] ?? '');
    $ref = (string)($tx['reference'] ?? ('wd_' . $tx['id']));

    $gw = gateway_row();
    $provider = strtolower((string)($gw['withdraw_provider'] ?? ''));
    $flwOn = !empty($gw['withdraw_enabled']) && $provider === 'flutterwave' && flw_withdraw_secret() !== '';

    if (!$forceManual && $method === 'bank' && $flwOn) {
        $bankCode = '';
        if (preg_match('/bankCode=([0-9A-Za-z]+)/', $note, $m)) {
            $bankCode = $m[1];
        }
        $account = '';
        if (preg_match('/·\s*([0-9]{8,20})\s*·/', $note, $m)) {
            $account = $m[1];
        }
        if ($account === '' && !empty($tx['payout_account'])) {
            $account = (string)$tx['payout_account'];
        }
        if ($bankCode === '' && !empty($tx['payout_bank_code'])) {
            $bankCode = (string)$tx['payout_bank_code'];
        }
        if ($bankCode === '' && !empty($tx['payout_bank'])) {
            $bankCode = flw_resolve_bank_code((string)$tx['payout_bank']);
        }
        if ($bankCode === '') {
            if (preg_match('/·\s*([^·]+)\s*$/', $note, $m)) {
                $bankCode = flw_resolve_bank_code(trim($m[1]));
            }
        }
        if ($account === '') {
            $parts = array_map('trim', explode('·', $note));
            foreach ($parts as $p) {
                if (preg_match('/^[0-9]{8,20}$/', $p)) {
                    $account = $p;
                    break;
                }
            }
        }
        if ($bankCode === '' || $account === '') {
            return [
                'ok' => false,
                'error' => 'Cannot auto-pay: missing bank code or account number. Edit the note to include bankCode=044 and the account number, or approve as manual.',
                'code' => 'missing_bank_details',
            ];
        }
        $transfer = flw_create_bank_transfer([
            'account_number' => $account,
            'bank_code' => $bankCode,
            'usd_amount' => $payoutUsd,
            'reference' => $ref,
            'narration' => 'Acctventa withdrawal ' . $ref,
            'currency' => 'NGN',
        ]);
        if (empty($transfer['ok'])) {
            return ['ok' => false, 'error' => $transfer['error'] ?? 'Flutterwave payout failed', 'raw' => $transfer['raw'] ?? null];
        }
        $flwId = (string)($transfer['flw_id'] ?? '');
        $flwStatus = strtoupper((string)($transfer['status'] ?? 'NEW'));
        $newNote = $note;
        if ($actorNote !== '') $newNote .= ' · ' . $actorNote;
        $newNote .= ' · Flutterwave transfer #' . ($flwId !== '' ? $flwId : 'ok')
            . ($flwId !== '' ? ' · flw_payout=' . $flwId : '')
            . ' · ₦' . number_format((float)$transfer['amount_ngn'], 0)
            . ' · status ' . $flwStatus;
        if (in_array($flwStatus, ['SUCCESSFUL', 'SUCCESS'], true)) {
            db()->prepare('UPDATE transactions SET status = \'completed\', note = ?, method = ? WHERE id = ? AND status = \'pending\'')
                ->execute([$newNote, 'flutterwave', (int)$tx['id']]);
            ensure_user_payout_columns();
            db()->prepare('UPDATE users SET payout_bank_locked = 1 WHERE id = ? AND payout_account != \'\'')
                ->execute([(int)$tx['user_id']]);
            notify_user(
                (int)$tx['user_id'],
                'Withdrawal paid',
                'Your withdrawal of $' . money_f($payoutUsd) . ' was approved and sent via Flutterwave.',
                'wallet'
            );
            return [
                'ok' => true,
                'mode' => 'flutterwave',
                'flwId' => $flwId,
                'amountNgn' => $transfer['amount_ngn'],
                'status' => $flwStatus,
            ];
        }
        db()->prepare('UPDATE transactions SET note = ?, method = ? WHERE id = ? AND status = \'pending\'')
            ->execute([$newNote, 'flutterwave', (int)$tx['id']]);
        ensure_user_payout_columns();
        db()->prepare('UPDATE users SET payout_bank_locked = 1 WHERE id = ? AND payout_account != \'\'')
            ->execute([(int)$tx['user_id']]);
        notify_user(
            (int)$tx['user_id'],
            'Withdrawal sending',
            'Your withdrawal of $' . money_f($payoutUsd) . ' was approved and is being paid via Flutterwave.',
            'wallet'
        );
        return [
            'ok' => true,
            'mode' => 'flutterwave',
            'flwId' => $flwId,
            'amountNgn' => $transfer['amount_ngn'],
            'status' => $flwStatus,
            'awaiting' => true,
        ];
    }

    // Manual / crypto / Flutterwave disabled → mark paid (you send money yourself)
    $newNote = $note;
    if ($actorNote !== '') $newNote .= ' · ' . $actorNote;
    $newNote .= $forceManual || $method === 'crypto' || !$flwOn
        ? ' · Marked paid manually'
        : ' · Marked paid';
    db()->prepare('UPDATE transactions SET status = \'completed\', note = ? WHERE id = ? AND status = \'pending\'')
        ->execute([$newNote, (int)$tx['id']]);
    if ($method === 'bank') {
        ensure_user_payout_columns();
        db()->prepare('UPDATE users SET payout_bank_locked = 1 WHERE id = ? AND payout_account != \'\'')
            ->execute([(int)$tx['user_id']]);
    }
    notify_user(
        (int)$tx['user_id'],
        'Withdrawal paid',
        'Your withdrawal of $' . money_f($payoutUsd) . ' was marked completed.',
        'wallet'
    );
    return ['ok' => true, 'mode' => 'manual'];
}

function flw_verify_transfer_by_id($transferId): array {
    $secret = flw_withdraw_secret();
    if ($secret === '') {
        return ['ok' => false, 'error' => 'Flutterwave withdraw secret key missing'];
    }
    $id = trim((string)$transferId);
    if ($id === '') {
        return ['ok' => false, 'error' => 'Missing transfer id'];
    }
    $res = flw_http('GET', 'https://api.flutterwave.com/v3/transfers/' . rawurlencode($id), null, $secret);
    if (($res['status'] ?? '') === 'success' && !empty($res['data'])) {
        return ['ok' => true, 'data' => $res['data']];
    }
    return ['ok' => false, 'error' => $res['message'] ?? 'Transfer verify failed', 'raw' => $res];
}

/**
 * True when a pending withdrawal is already sent to Flutterwave and waiting on bank result
 * (should not appear in the Owner "approve" queue again).
 */
function tx_is_flutterwave_payout_inflight(array $tx): bool {
    if (($tx['type'] ?? '') !== 'withdrawal') return false;
    $note = (string)($tx['note'] ?? '');
    return (bool)preg_match('/flw_payout=\d+/i', $note);
}

function flw_extract_payout_id(string $note): string {
    if (preg_match('/flw_payout=(\d+)/i', $note, $m)) {
        return $m[1];
    }
    if (preg_match('/Flutterwave transfer #(\d+)/i', $note, $m)) {
        return $m[1];
    }
    return '';
}

/**
 * Apply a Flutterwave transfer status onto a withdrawal row (idempotent).
 * SUCCESSFUL → completed; FAILED/CANCELLED → failed + wallet refund (once).
 */
function apply_flutterwave_transfer_status(array $tx, string $flwStatus, string $flwId = ''): array {
    $status = strtoupper(trim($flwStatus));
    $note = (string)($tx['note'] ?? '');
    $id = (int)($tx['id'] ?? 0);
    if ($id < 1) return ['ok' => false, 'error' => 'Invalid tx'];

    if (in_array($status, ['SUCCESSFUL', 'SUCCESS'], true)) {
        if (($tx['status'] ?? '') === 'completed') {
            return ['ok' => true, 'already' => true, 'status' => 'completed'];
        }
        $newNote = preg_replace('/\s*·\s*status\s+[A-Z_]+/i', '', $note);
        $newNote = rtrim((string)$newNote, " ·");
        if ($flwId !== '' && stripos($newNote, 'flw_payout=') === false) {
            $newNote .= ' · flw_payout=' . $flwId;
        }
        $newNote .= ' · status SUCCESSFUL';
        db()->prepare('UPDATE transactions SET status = \'completed\', note = ?, method = ? WHERE id = ?')
            ->execute([$newNote, 'flutterwave', $id]);
        if (($tx['status'] ?? '') === 'pending') {
            notify_user(
                (int)$tx['user_id'],
                'Withdrawal paid',
                'Your withdrawal of $' . money_f((float)($tx['payout'] ?? $tx['amount'] ?? 0)) . ' was sent via Flutterwave.',
                'wallet'
            );
        }
        return ['ok' => true, 'status' => 'completed'];
    }

    if (in_array($status, ['FAILED', 'CANCELLED', 'CANCELED'], true)) {
        if (in_array(($tx['status'] ?? ''), ['failed', 'cancelled'], true)) {
            return ['ok' => true, 'already' => true, 'status' => $tx['status']];
        }
        // Refund only if we had already deducted (normal withdraw flow) and not yet refunded.
        if (stripos($note, 'flw_refunded=1') === false && ($tx['status'] ?? '') !== 'cancelled') {
            ensure_wallet_ledger_columns();
            db()->prepare('UPDATE users SET balance = balance + ?, withdrawable_balance = withdrawable_balance + ?, total_withdrawals = GREATEST(0, total_withdrawals - ?) WHERE id = ?')
                ->execute([
                    money_f((float)$tx['amount']),
                    money_f((float)$tx['amount']),
                    money_f((float)$tx['amount']),
                    (int)$tx['user_id'],
                ]);
            $note .= ' · flw_refunded=1';
            notify_user(
                (int)$tx['user_id'],
                'Withdrawal failed',
                'Flutterwave could not pay out $' . money_f((float)$tx['amount']) . '. The amount was returned to your withdrawable balance.',
                'wallet'
            );
        }
        $newNote = preg_replace('/\s*·\s*status\s+[A-Z_]+/i', '', $note);
        $newNote = rtrim((string)$newNote, " ·") . ' · status ' . $status;
        db()->prepare('UPDATE transactions SET status = \'failed\', note = ? WHERE id = ?')
            ->execute([$newNote, $id]);
        return ['ok' => true, 'status' => 'failed', 'refunded' => true];
    }

    // NEW / PENDING / processing — keep awaiting auto-update
    $newNote = preg_replace('/\s*·\s*status\s+[A-Z_]+/i', '', $note);
    $newNote = rtrim((string)$newNote, " ·");
    if ($flwId !== '' && stripos($newNote, 'flw_payout=') === false) {
        $newNote .= ' · flw_payout=' . $flwId;
    }
    $newNote .= ' · status ' . ($status !== '' ? $status : 'PENDING');
    db()->prepare('UPDATE transactions SET note = ? WHERE id = ? AND status = \'pending\'')
        ->execute([$newNote, $id]);
    return ['ok' => true, 'status' => 'pending', 'flw' => $status];
}

/**
 * Verify pending Flutterwave deposits / plan checkouts and flip status without owner Save.
 */
function reconcile_pending_flutterwave_charges(int $limit = 40): array {
    ensure_tx_reference_column();
    ensure_plan_tx_type();
    if (!flw_secret_looks_valid()) {
        return ['checked' => 0, 'completed' => 0, 'failed' => 0, 'pending' => 0, 'errors' => ['Flutterwave secret key missing or invalid']];
    }
    $limit = max(1, min(20, $limit)); // keep wallet loads fast after key changes
    $stmt = db()->query(
        "SELECT * FROM transactions
         WHERE status = 'pending'
           AND type IN ('deposit','plan')
           AND reference IS NOT NULL AND reference != ''
           AND (
             method = 'flutterwave'
             OR note LIKE 'Awaiting Flutterwave%'
             OR note LIKE '%Flutterwave%'
           )
         ORDER BY id ASC
         LIMIT {$limit}"
    );
    $rows = $stmt ? $stmt->fetchAll() : [];
    $out = ['checked' => 0, 'completed' => 0, 'failed' => 0, 'pending' => 0, 'errors' => []];
    $now = time();
    foreach ($rows as $tx) {
        $out['checked']++;
        $ref = (string)($tx['reference'] ?? '');
        if ($ref === '') {
            $out['pending']++;
            continue;
        }
        $verified = flw_verify_by_tx_ref($ref);
        if (!empty($verified['ok']) && !empty($verified['data'])) {
            $data = $verified['data'];
            $flwStatus = strtolower((string)($data['status'] ?? ''));
            if ($flwStatus === 'successful') {
                $paid = (float)($data['amount'] ?? 0);
                $flwId = (string)($data['id'] ?? '');
                $paidCurrency = strtoupper((string)($data['currency'] ?? ''));
                try {
                    $settled = settle_flutterwave_payment($ref, $paid, $flwId, $paidCurrency);
                    if (!empty($settled['ok'])) $out['completed']++;
                    else {
                        $out['errors'][] = $ref . ': ' . ($settled['error'] ?? 'settle failed');
                        $out['pending']++;
                    }
                } catch (Throwable $e) {
                    $out['errors'][] = $ref . ': ' . $e->getMessage();
                    $out['pending']++;
                }
                continue;
            }
            if (in_array($flwStatus, ['failed', 'cancelled', 'canceled'], true)) {
                db()->prepare('UPDATE transactions SET status = \'failed\', note = ? WHERE id = ? AND status = \'pending\'')
                    ->execute([
                        rtrim((string)$tx['note'], " ·") . ' · Flutterwave ' . $flwStatus,
                        (int)$tx['id'],
                    ]);
                $out['failed']++;
                continue;
            }
        }

        // Abandoned checkout: no successful charge after 12h → auto-cancel (never credited)
        $created = strtotime((string)($tx['created_at'] ?? '')) ?: 0;
        if ($created > 0 && ($now - $created) > 12 * 3600) {
            db()->prepare('UPDATE transactions SET status = \'cancelled\', note = ? WHERE id = ? AND status = \'pending\'')
                ->execute([
                    rtrim((string)$tx['note'], " ·") . ' · Auto-cancelled (checkout expired)',
                    (int)$tx['id'],
                ]);
            $out['failed']++;
            continue;
        }
        $out['pending']++;
    }
    return $out;
}

/**
 * Poll Flutterwave for bank payouts that were approved but not yet SUCCESSFUL/FAILED.
 */
function reconcile_flutterwave_payouts(int $limit = 30): array {
    $limit = max(1, min(60, $limit));
    $stmt = db()->query(
        "SELECT * FROM transactions
         WHERE type = 'withdrawal'
           AND (
             (status = 'pending' AND note LIKE '%flw_payout=%')
             OR (status = 'completed' AND note LIKE '%flw_payout=%' AND note NOT LIKE '%status SUCCESSFUL%' AND note LIKE '%status %')
           )
         ORDER BY id DESC
         LIMIT {$limit}"
    );
    $rows = $stmt ? $stmt->fetchAll() : [];
    $out = ['checked' => 0, 'completed' => 0, 'failed' => 0, 'pending' => 0];
    foreach ($rows as $tx) {
        $out['checked']++;
        $flwId = flw_extract_payout_id((string)($tx['note'] ?? ''));
        if ($flwId === '') {
            $out['pending']++;
            continue;
        }
        $verified = flw_verify_transfer_by_id($flwId);
        if (empty($verified['ok'])) {
            $out['pending']++;
            continue;
        }
        $st = strtoupper((string)($verified['data']['status'] ?? ''));
        $applied = apply_flutterwave_transfer_status($tx, $st, $flwId);
        if (($applied['status'] ?? '') === 'completed') $out['completed']++;
        elseif (($applied['status'] ?? '') === 'failed') $out['failed']++;
        else $out['pending']++;
    }
    return $out;
}

/**
 * Throttled sweep used by Owner Wallet, webhooks, and cron.
 */
function flw_reconcile_pending(bool $force = false, int $minSeconds = 90): array {
    $last = (int)setting_get('flw_last_reconcile', '0');
    if (!$force && $last > 0 && (time() - $last) < $minSeconds) {
        return ['ok' => true, 'skipped' => true, 'last' => $last];
    }
    try {
        setting_set('flw_last_reconcile', (string)time());
    } catch (Throwable $e) {}
    $charges = ['checked' => 0, 'completed' => 0, 'failed' => 0, 'pending' => 0];
    $payouts = ['checked' => 0, 'completed' => 0, 'failed' => 0, 'pending' => 0];
    try {
        $charges = reconcile_pending_flutterwave_charges();
    } catch (Throwable $e) {
        $charges['error'] = $e->getMessage();
    }
    try {
        $payouts = reconcile_flutterwave_payouts();
    } catch (Throwable $e) {
        $payouts['error'] = $e->getMessage();
    }
    return ['ok' => true, 'charges' => $charges, 'payouts' => $payouts];
}
