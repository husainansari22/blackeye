<?php
declare(strict_types=1);
/**
 * One-time installer: open https://acctventa.com/api/install.php
 * Delete this file after success.
 */
require __DIR__ . '/bootstrap.php';
header('Content-Type: text/html; charset=utf-8');
function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

$done = false;
$error = '';
$logs = [];
$cfg = app_config();

try {
    $pdo = db();
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    if ($sql === false) throw new RuntimeException('schema.sql missing');

    // Remove line comments then split statements
    $lines = preg_split('/\R/', $sql);
    $buf = '';
    foreach ($lines as $line) {
        $trim = ltrim($line);
        if ($trim === '' || strpos($trim, '--') === 0) continue;
        $buf .= $line . "\n";
    }
    $statements = array_filter(array_map('trim', explode(';', $buf)));
    foreach ($statements as $statement) {
        if ($statement === '') continue;
        $pdo->exec($statement);
        $logs[] = substr(preg_replace('/\s+/', ' ', $statement), 0, 90) . '...';
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS api_sessions (
      token CHAR(64) PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX(user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    setting_set('installed', '1');
    setting_set('min_deposit', (string)$cfg['min_deposit']);
    setting_set('min_withdraw', (string)$cfg['min_withdraw']);
    setting_set('withdraw_commission_rate', (string)$cfg['withdraw_commission_rate']);
    setting_set('sales_commission_rate', (string)($cfg['sales_commission_rate'] ?? 0.22));
    setting_set('referral_reward_amount', (string)($cfg['referral_reward_amount'] ?? 5));
    setting_set('referral_min_deposit', (string)($cfg['referral_min_deposit'] ?? 50));
    setting_set('deposit_fee_rate', (string)$cfg['deposit_fee_rate']);
    setting_set('support_telegram', (string)$cfg['support_telegram']);
    setting_set('support_email', (string)$cfg['support_email']);
    setting_set('free_daily_uploads', (string)$cfg['free_daily_uploads']);
    $done = true;
} catch (Throwable $e) {
    $error = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acctventa API Install</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f1f5f9;margin:0;padding:24px}
    .card{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
    .ok{color:#059669}.err{color:#dc2626}
    a{color:#0284c7} code{background:#f1f5f9;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Acctventa Backend Install</h1>
    <?php if ($done): ?>
      <p class="ok"><strong>Success.</strong> Database tables are ready.</p>
      <ol>
        <li>Open Owner Admin: <a href="/owner/"><code>/owner/</code></a></li>
        <li>Login: <code><?= h($cfg['owner_username']) ?></code> / password in <code>api/config.php</code></li>
        <li><strong>Delete</strong> <code>api/install.php</code> after this works</li>
      </ol>
    <?php else: ?>
      <p class="err"><strong>Install failed:</strong> <?= h($error) ?></p>
      <p>Confirm MySQL name/user/password in <code>api/config.php</code> match Hostinger exactly.</p>
      <p>Current config user: <code><?= h($cfg['db_user']) ?></code> · database: <code><?= h($cfg['db_name']) ?></code></p>
      <p>If access denied, edit <code>db_user</code> in Hostinger (sometimes it matches the DB name, sometimes it ends with <code>_</code>).</p>
    <?php endif; ?>
    <?php if ($logs): ?><details><summary>SQL log</summary><pre><?= h(implode("\n", $logs)) ?></pre></details><?php endif; ?>
  </div>
</body>
</html>
