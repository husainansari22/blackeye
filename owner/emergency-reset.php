<?php
declare(strict_types=1);
/**
 * Emergency Owner Admin password reset — upload to public_html/owner/emergency-reset.php
 * Uses owner_password from api/config.php (re-reads file, bypasses PHP opcache).
 */
session_start();

function h($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function read_config_fresh(): array {
    $path = __DIR__ . '/../api/config.php';
    if (!is_file($path)) {
        return ['_error' => 'Missing api/config.php'];
    }
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($path, true);
    }
    clearstatcache(true, $path);
    $cfg = require $path;
    return is_array($cfg) ? $cfg : ['_error' => 'config.php must return an array'];
}

$cfg = read_config_fresh();
$configError = (string)($cfg['_error'] ?? '');
$ownerUser = (string)($cfg['owner_username'] ?? 'owner');
$configPass = (string)($cfg['owner_password'] ?? '');
$configLen = strlen($configPass);

$error = '';
$flash = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $configError === '') {
    require __DIR__ . '/../api/bootstrap.php';
    $master = trim((string)($_POST['master_password'] ?? ''));
    $next = trim((string)($_POST['new_password'] ?? ''));
    $confirm = trim((string)($_POST['confirm_password'] ?? ''));

    $cfg = read_config_fresh();
    $configPass = (string)($cfg['owner_password'] ?? '');
    $configLen = strlen($configPass);

    if ($configPass === '' || !hash_equals($configPass, $master)) {
        $error = 'Master password does not match owner_password in api/config.php (server sees ' . $configLen . ' characters).';
    } elseif (strlen($next) < 6) {
        $error = 'New password must be at least 6 characters.';
    } elseif ($next !== $confirm) {
        $error = 'New password and confirmation do not match.';
    } else {
        owner_password_set($next);
        admin_password_set($next);
        $_SESSION['owner_ok'] = true;
        header('Location: /owner/');
        exit;
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Owner password reset | Acctventa</title>
  <meta name="robots" content="noindex,nofollow">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
  <div class="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
    <div class="text-center">
      <h1 class="text-xl font-bold">Emergency owner reset</h1>
      <p class="text-xs text-slate-400 mt-1">Syncs Owner Admin + Website Admin passwords on the server</p>
    </div>
    <?php if ($configError !== ''): ?>
      <p class="text-xs text-red-400"><?= h($configError) ?></p>
    <?php else: ?>
      <p class="text-xs text-slate-400">Server reads username <strong class="text-white"><?= h($ownerUser) ?></strong> and <strong class="text-white"><?= (int)$configLen ?></strong> character <code class="text-sky-400">owner_password</code> from api/config.php. If the length is wrong, your Hostinger edit did not apply — fix the file, then try again.</p>
    <?php endif; ?>
    <?php if ($error !== ''): ?><p class="text-xs text-red-400"><?= h($error) ?></p><?php endif; ?>
    <form method="post" class="space-y-3">
      <div>
        <label class="text-xs text-slate-400">owner_password from config.php</label>
        <input name="master_password" type="password" autocomplete="off" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-base" required>
      </div>
      <div>
        <label class="text-xs text-slate-400">New password (min 6)</label>
        <input name="new_password" type="password" autocomplete="new-password" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-base" minlength="6" required>
      </div>
      <div>
        <label class="text-xs text-slate-400">Confirm new password</label>
        <input name="confirm_password" type="password" autocomplete="new-password" class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-base" minlength="6" required>
      </div>
      <button type="submit" class="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl text-sm">Reset &amp; open Owner Admin</button>
    </form>
    <p class="text-[11px] text-slate-500 leading-relaxed">config.php line must look exactly like:<br><code class="text-sky-300">'owner_password' =&gt; 'YourPasswordHere',</code><br>Not the MySQL <code>db_pass</code> field. Delete this file after you sign in.</p>
    <a href="/owner/" class="block text-center text-xs text-sky-400">← Back to Owner login</a>
  </div>
</body>
</html>
