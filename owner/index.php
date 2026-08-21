<?php
declare(strict_types=1);
session_start();
require __DIR__ . '/../api/bootstrap.php';

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

$cfg = app_config();
$error = '';
$flash = '';

if (isset($_GET['logout'])) {
    unset($_SESSION['owner_ok']);
    header('Location: /owner/');
    exit;
}

if (($_POST['form'] ?? '') === 'login') {
    $user = trim((string)($_POST['username'] ?? ''));
    $pass = (string)($_POST['password'] ?? '');
    if ($user === ($cfg['owner_username'] ?? 'owner') && $pass === ($cfg['owner_password'] ?? '')) {
        $_SESSION['owner_ok'] = true;
        header('Location: /owner/');
        exit;
    }
    $error = 'Invalid owner username or password.';
}

$authed = !empty($_SESSION['owner_ok']);

if ($authed && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $form = $_POST['form'] ?? '';
    try {
        if ($form === 'settings') {
            setting_set('min_deposit', (string)(float)$_POST['min_deposit']);
            setting_set('min_withdraw', (string)(float)$_POST['min_withdraw']);
            setting_set('withdraw_commission_rate', (string)((float)$_POST['withdraw_commission'] / 100));
            setting_set('deposit_fee_rate', (string)((float)$_POST['deposit_fee'] / 100));
            setting_set('support_telegram', trim((string)$_POST['support_telegram']));
            setting_set('support_email', trim((string)$_POST['support_email']));
            setting_set('payment_currency', strtoupper(trim((string)($_POST['payment_currency'] ?? 'NGN'))) === 'USD' ? 'USD' : 'NGN');
            setting_set('usd_ngn_rate', (string)max(1, (float)($_POST['usd_ngn_rate'] ?? 1600)));
            $flash = 'Platform settings saved.';
        }
        if ($form === 'plan') {
            $id = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$_POST['plan_id']));
            $stmt = db()->prepare('UPDATE plans SET name = ?, price = ?, daily_uploads = ?, approval_label = ? WHERE id = ?');
            $stmt->execute([
                trim((string)$_POST['name']),
                money_f($_POST['price']),
                (int)$_POST['daily_uploads'],
                trim((string)$_POST['approval_label']),
                $id,
            ]);
            if ($id === 'free') setting_set('free_daily_uploads', (string)(int)$_POST['daily_uploads']);
            $flash = 'Plan updated.';
        }
        if ($form === 'fx_rate') {
            setting_set('payment_currency', strtoupper(trim((string)($_POST['payment_currency'] ?? 'NGN'))) === 'USD' ? 'USD' : 'NGN');
            setting_set('usd_ngn_rate', (string)max(1, (float)($_POST['usd_ngn_rate'] ?? 1600)));
            $flash = 'Naira rate saved. New deposits will use this rate.';
        }
        if ($form === 'gateway') {
            $stmt = db()->prepare('UPDATE gateway_settings SET
                deposit_provider=?, deposit_enabled=?, deposit_public_key=?, deposit_secret_key=?, deposit_webhook=?, deposit_notes=?,
                withdraw_provider=?, withdraw_enabled=?, withdraw_public_key=?, withdraw_secret_key=?, withdraw_webhook=?, withdraw_notes=?
                WHERE id=1');
            $stmt->execute([
                $_POST['deposit_provider'], isset($_POST['deposit_enabled']) ? 1 : 0, $_POST['deposit_public_key'], $_POST['deposit_secret_key'], $_POST['deposit_webhook'], $_POST['deposit_notes'],
                $_POST['withdraw_provider'], isset($_POST['withdraw_enabled']) ? 1 : 0, $_POST['withdraw_public_key'], $_POST['withdraw_secret_key'], $_POST['withdraw_webhook'], $_POST['withdraw_notes'],
            ]);
            $flash = 'Gateway settings saved.';
        }
        if ($form === 'ban_user') {
            db()->prepare('UPDATE users SET is_banned = ? WHERE id = ?')->execute([(int)$_POST['banned'], (int)$_POST['user_id']]);
            $flash = 'User ban status updated.';
        }
        if ($form === 'verify_user') {
            db()->prepare('UPDATE users SET is_verified = ? WHERE id = ?')->execute([(int)$_POST['verified'], (int)$_POST['user_id']]);
            $flash = 'Verification updated.';
        }
        if ($form === 'adjust_balance') {
            $uid = (int)$_POST['user_id'];
            $amount = (float)$_POST['amount'];
            $note = trim((string)$_POST['note']);
            db()->prepare('UPDATE users SET balance = balance + ? WHERE id = ?')->execute([money_f($amount), $uid]);
            db()->prepare('INSERT INTO transactions (user_id, type, amount, status, note) VALUES (?, ?, ?, \'completed\', ?)')
                ->execute([$uid, $amount >= 0 ? 'deposit' : 'withdrawal', money_f(abs($amount)), 'Owner adjust: ' . $note]);
            $flash = 'Balance adjusted.';
        }
        if ($form === 'ad_status') {
            $status = $_POST['status'];
            $reason = trim((string)($_POST['reason'] ?? ''));
            db()->prepare('UPDATE ads SET status = ?, deny_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
                ->execute([$status, $reason, 'Owner', (int)$_POST['ad_id']]);
            $ad = db()->query('SELECT seller_id, title FROM ads WHERE id=' . (int)$_POST['ad_id'])->fetch();
            if ($ad) notify_user((int)$ad['seller_id'], 'Ad ' . $status, $reason !== '' ? $reason : ('Your listing "' . $ad['title'] . '" is now ' . $status), 'ad_review');
            $flash = 'Ad status updated.';
        }
        if ($form === 'tx_status') {
            db()->prepare('UPDATE transactions SET status = ? WHERE id = ?')->execute([$_POST['status'], (int)$_POST['tx_id']]);
            $flash = 'Transaction status updated.';
        }
        if ($form === 'order_status') {
            db()->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$_POST['status'], (int)$_POST['order_id']]);
            $flash = 'Order status updated.';
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$tab = $_GET['tab'] ?? 'overview';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Owner Admin — Acctventa</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config={theme:{extend:{colors:{brand:'#0ea5e9'}}}}</script>
</head>
<body class="bg-slate-100 text-slate-900 min-h-screen">
<?php if (!$authed): ?>
  <div class="min-h-screen flex items-center justify-center p-4">
    <form method="post" class="w-full max-w-sm bg-white rounded-2xl border p-6 space-y-4 shadow">
      <input type="hidden" name="form" value="login">
      <div class="text-center">
        <div class="w-12 h-12 mx-auto rounded-xl bg-brand text-white flex items-center justify-center font-bold text-xl mb-2">A</div>
        <h1 class="text-xl font-bold">Owner Admin</h1>
        <p class="text-xs text-slate-500">Full website control (users, money, ads, gateways)</p>
      </div>
      <?php if ($error): ?><p class="text-xs text-red-600"><?= h($error) ?></p><?php endif; ?>
      <div>
        <label class="text-xs text-slate-500">Username</label>
        <input name="username" value="owner" class="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm" required>
      </div>
      <div>
        <label class="text-xs text-slate-500">Password</label>
        <input name="password" type="password" class="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm" required>
      </div>
      <button class="w-full bg-brand text-white font-bold py-3 rounded-xl text-sm">Sign in</button>
      <a href="/" class="block text-center text-xs text-brand">← Back to website</a>
    </form>
  </div>
<?php else:
  // Stats
  $stats = [
    'users' => (int)db()->query('SELECT COUNT(*) c FROM users')->fetch()['c'],
    'ads_pending' => (int)db()->query("SELECT COUNT(*) c FROM ads WHERE status='pending'")->fetch()['c'],
    'orders' => (int)db()->query('SELECT COUNT(*) c FROM orders')->fetch()['c'],
    'withdraw_pending' => (int)db()->query("SELECT COUNT(*) c FROM transactions WHERE type='withdrawal' AND status='pending'")->fetch()['c'],
    'volume' => (float)db()->query("SELECT COALESCE(SUM(price),0) s FROM orders WHERE status='completed'")->fetch()['s'],
  ];
  $gw = db()->query('SELECT * FROM gateway_settings WHERE id=1')->fetch() ?: [];
?>
  <header class="bg-white border-b sticky top-0 z-10">
    <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
      <div class="font-bold flex items-center gap-2"><span class="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center text-sm">A</span> Owner Admin</div>
      <div class="flex gap-3 text-sm">
        <a href="/dashboard.html" class="text-slate-500">User app</a>
        <a href="?logout=1" class="text-red-500 font-medium">Log out</a>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 py-6 space-y-6">
    <?php if ($flash): ?><div class="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-3"><?= h($flash) ?></div><?php endif; ?>
    <?php if ($error): ?><div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3"><?= h($error) ?></div><?php endif; ?>

    <div class="flex gap-2 overflow-x-auto text-sm">
      <?php foreach (['overview'=>'Overview','users'=>'Users','ads'=>'Ads','orders'=>'Orders','wallet'=>'Wallet','gateways'=>'Gateways','settings'=>'Settings','plans'=>'Plans'] as $k=>$label): ?>
        <a href="?tab=<?= $k ?>" class="px-3 py-2 rounded-lg <?= $tab===$k?'bg-brand text-white':'bg-white border' ?>"><?= $label ?></a>
      <?php endforeach; ?>
    </div>

    <?php if ($tab === 'overview'): ?>
      <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="bg-white rounded-xl border p-4"><p class="text-xs text-slate-500">Users</p><p class="text-2xl font-extrabold"><?= $stats['users'] ?></p></div>
        <div class="bg-white rounded-xl border p-4"><p class="text-xs text-slate-500">Pending ads</p><p class="text-2xl font-extrabold"><?= $stats['ads_pending'] ?></p></div>
        <div class="bg-white rounded-xl border p-4"><p class="text-xs text-slate-500">Orders</p><p class="text-2xl font-extrabold"><?= $stats['orders'] ?></p></div>
        <div class="bg-white rounded-xl border p-4"><p class="text-xs text-slate-500">Pending withdrawals</p><p class="text-2xl font-extrabold"><?= $stats['withdraw_pending'] ?></p></div>
        <div class="bg-white rounded-xl border p-4"><p class="text-xs text-slate-500">Completed volume</p><p class="text-2xl font-extrabold">$<?= number_format($stats['volume'], 2) ?></p></div>
      </div>
      <div class="bg-sky-50 border border-sky-200 text-sky-900 text-sm rounded-xl p-4">
        This is your real Owner control panel (MySQL). Use it to manage every user, listing, order, withdrawal, fee, and payment gateway.
      </div>
    <?php endif; ?>

    <?php if ($tab === 'users'): $users = db()->query('SELECT * FROM users ORDER BY created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="bg-white rounded-xl border overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-500"><tr>
            <th class="p-3">ID</th><th class="p-3">Name</th><th class="p-3">Email</th><th class="p-3">Balance</th><th class="p-3">Plan</th><th class="p-3">Flags</th><th class="p-3">Actions</th>
          </tr></thead>
          <tbody>
          <?php foreach ($users as $u): ?>
            <tr class="border-t">
              <td class="p-3"><?= (int)$u['id'] ?></td>
              <td class="p-3 font-medium"><?= h($u['name']) ?></td>
              <td class="p-3"><?= h($u['email']) ?></td>
              <td class="p-3">$<?= number_format((float)$u['balance'], 2) ?></td>
              <td class="p-3"><?= h($u['plan']) ?></td>
              <td class="p-3"><?= (int)$u['is_banned']?'Banned ':'' ?><?= (int)$u['is_verified']?'Verified':'' ?></td>
              <td class="p-3 space-y-1 min-w-[220px]">
                <form method="post" class="flex gap-1 items-center">
                  <input type="hidden" name="form" value="ban_user">
                  <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
                  <input type="hidden" name="banned" value="<?= (int)$u['is_banned']?0:1 ?>">
                  <button class="px-2 py-1 rounded bg-slate-800 text-white"><?= (int)$u['is_banned']?'Unban':'Ban' ?></button>
                </form>
                <form method="post" class="flex gap-1 items-center">
                  <input type="hidden" name="form" value="verify_user">
                  <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
                  <input type="hidden" name="verified" value="<?= (int)$u['is_verified']?0:1 ?>">
                  <button class="px-2 py-1 rounded bg-emerald-600 text-white"><?= (int)$u['is_verified']?'Unverify':'Verify' ?></button>
                </form>
                <form method="post" class="flex gap-1 items-center">
                  <input type="hidden" name="form" value="adjust_balance">
                  <input type="hidden" name="user_id" value="<?= (int)$u['id'] ?>">
                  <input name="amount" type="number" step="0.01" placeholder="+/- amount" class="border rounded px-2 py-1 w-24">
                  <input name="note" placeholder="note" class="border rounded px-2 py-1 w-24">
                  <button class="px-2 py-1 rounded bg-brand text-white">Adjust</button>
                </form>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'ads'): $ads = db()->query('SELECT a.*, u.name seller_name, u.email seller_email FROM ads a JOIN users u ON u.id=a.seller_id ORDER BY a.created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="space-y-3">
        <?php foreach ($ads as $a): ?>
          <div class="bg-white border rounded-xl p-4 text-sm space-y-2">
            <div class="flex justify-between gap-3">
              <div>
                <p class="font-semibold"><?= h($a['title']) ?> <span class="text-xs text-slate-400">#<?= (int)$a['id'] ?></span></p>
                <p class="text-xs text-slate-500"><?= h($a['seller_name']) ?> · <?= h($a['seller_email']) ?> · <?= h($a['category']) ?> · <strong><?= h($a['status']) ?></strong></p>
                <p class="text-[11px] break-all text-slate-400"><?= h($a['preview_link']) ?></p>
                <?php if ($a['deny_reason']): ?><p class="text-xs text-red-600"><?= h($a['deny_reason']) ?></p><?php endif; ?>
              </div>
              <p class="font-bold text-brand">$<?= number_format((float)$a['price'], 2) ?></p>
            </div>
            <div class="flex flex-wrap gap-2">
              <form method="post"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="ad_id" value="<?= (int)$a['id'] ?>"><input type="hidden" name="status" value="active"><button class="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg">Approve</button></form>
              <form method="post" class="flex gap-1"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="ad_id" value="<?= (int)$a['id'] ?>"><input type="hidden" name="status" value="denied"><input name="reason" placeholder="deny reason" class="border rounded px-2 text-xs"><button class="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg">Deny</button></form>
              <form method="post"><input type="hidden" name="form" value="ad_status"><input type="hidden" name="ad_id" value="<?= (int)$a['id'] ?>"><input type="hidden" name="status" value="removed"><button class="text-xs bg-slate-700 text-white px-3 py-1.5 rounded-lg">Remove</button></form>
            </div>
          </div>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'orders'): $orders = db()->query('SELECT o.*, b.name buyer_name, s.name seller_name FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id ORDER BY o.created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="bg-white rounded-xl border overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-500"><tr><th class="p-3">ID</th><th class="p-3">Item</th><th class="p-3">Buyer</th><th class="p-3">Seller</th><th class="p-3">Price</th><th class="p-3">Status</th><th class="p-3">Set</th></tr></thead>
          <tbody>
          <?php foreach ($orders as $o): ?>
            <tr class="border-t">
              <td class="p-3"><?= h($o['public_id']) ?></td>
              <td class="p-3"><?= h($o['title']) ?></td>
              <td class="p-3"><?= h($o['buyer_name']) ?></td>
              <td class="p-3"><?= h($o['seller_name']) ?></td>
              <td class="p-3">$<?= number_format((float)$o['price'], 2) ?></td>
              <td class="p-3"><?= h($o['status']) ?></td>
              <td class="p-3">
                <form method="post" class="flex gap-1">
                  <input type="hidden" name="form" value="order_status">
                  <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
                  <select name="status" class="border rounded px-1">
                    <?php foreach (['pending','completed','cancelled','disputed'] as $st): ?>
                      <option <?= $o['status']===$st?'selected':'' ?>><?= $st ?></option>
                    <?php endforeach; ?>
                  </select>
                  <button class="bg-brand text-white px-2 rounded">Save</button>
                </form>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'wallet'): $txs = db()->query('SELECT t.*, u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="bg-white rounded-xl border overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-500"><tr><th class="p-3">ID</th><th class="p-3">User</th><th class="p-3">Type</th><th class="p-3">Amount</th><th class="p-3">Fee</th><th class="p-3">Status</th><th class="p-3">Note</th><th class="p-3">Update</th></tr></thead>
          <tbody>
          <?php foreach ($txs as $t): ?>
            <tr class="border-t">
              <td class="p-3"><?= (int)$t['id'] ?></td>
              <td class="p-3"><?= h($t['email']) ?></td>
              <td class="p-3"><?= h($t['type']) ?></td>
              <td class="p-3">$<?= number_format((float)$t['amount'], 2) ?></td>
              <td class="p-3">$<?= number_format((float)$t['fee'], 2) ?></td>
              <td class="p-3"><?= h($t['status']) ?></td>
              <td class="p-3 max-w-[180px] truncate"><?= h($t['note']) ?></td>
              <td class="p-3">
                <form method="post" class="flex gap-1">
                  <input type="hidden" name="form" value="tx_status">
                  <input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>">
                  <select name="status" class="border rounded px-1">
                    <?php foreach (['pending','completed','failed','cancelled'] as $st): ?>
                      <option <?= $t['status']===$st?'selected':'' ?>><?= $st ?></option>
                    <?php endforeach; ?>
                  </select>
                  <button class="bg-brand text-white px-2 rounded">Save</button>
                </form>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'gateways'): ?>
      <?php
        $fxRate = (float)setting_get('usd_ngn_rate', '1600');
        $fxCur = setting_get('payment_currency', 'NGN');
      ?>
      <form method="post" class="bg-sky-50 border border-sky-200 rounded-xl p-5 space-y-3 mb-4">
        <input type="hidden" name="form" value="fx_rate">
        <h2 class="font-bold text-lg text-slate-900">₦ Naira rate (live deposits)</h2>
        <p class="text-xs text-slate-600">Wallet balances stay in <strong>USD ($)</strong>. Flutterwave charges customers in Naira using this rate.</p>
        <div class="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label class="text-xs text-slate-500 font-medium">Charge currency</label>
            <select name="payment_currency" class="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">
              <option value="NGN" <?= $fxCur==='NGN'?'selected':'' ?>>NGN (Naira)</option>
              <option value="USD" <?= $fxCur==='USD'?'selected':'' ?>>USD (no convert)</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-500 font-medium">1 USD = how many ₦?</label>
            <input name="usd_ngn_rate" type="number" min="1" step="1" value="<?= h((string)$fxRate) ?>" class="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white font-semibold" required>
          </div>
          <button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save Naira rate</button>
        </div>
        <p class="text-[11px] text-slate-500">Example at ₦<?= number_format($fxRate) ?>: deposit <strong>$3.00</strong> → customer pays about <strong>₦<?= number_format(3 * $fxRate) ?></strong>.</p>
      </form>

      <form method="post" class="bg-white rounded-xl border p-5 space-y-4">
        <input type="hidden" name="form" value="gateway">
        <h2 class="font-bold text-lg">Payment gateways</h2>
        <div class="grid md:grid-cols-2 gap-4">
          <div class="border rounded-xl p-4 space-y-2">
            <h3 class="font-semibold">Deposit</h3>
            <select name="deposit_provider" class="w-full border rounded-xl px-3 py-2 text-sm">
              <?php foreach (['none','paystack','flutterwave','stripe','nowpayments'] as $p): ?>
                <option value="<?= $p ?>" <?= ($gw['deposit_provider']??'')===$p?'selected':'' ?>><?= $p ?></option>
              <?php endforeach; ?>
            </select>
            <label class="text-sm flex gap-2 items-center"><input type="checkbox" name="deposit_enabled" <?= !empty($gw['deposit_enabled'])?'checked':'' ?>> Enabled</label>
            <input name="deposit_public_key" value="<?= h($gw['deposit_public_key']??'') ?>" placeholder="Flutterwave Public Key (FLWPUBK_...)" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="deposit_secret_key" value="<?= h($gw['deposit_secret_key']??'') ?>" placeholder="Flutterwave Secret Key (FLWSECK_...) — required" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="deposit_webhook" value="<?= h($gw['deposit_webhook']??'') ?>" placeholder="https://acctventa.com/api/index.php?action=webhook.flutterwave" class="w-full border rounded-xl px-3 py-2 text-sm">
            <textarea name="deposit_notes" class="w-full border rounded-xl px-3 py-2 text-sm" rows="2" placeholder="Optional notes / encryption key"><?= h($gw['deposit_notes']??'') ?></textarea>
            <p class="text-[11px] text-slate-500">Use <strong>Settings → API Keys</strong> in Flutterwave (keys starting with FLWPUBK_ / FLWSECK_), not only V4 Client ID. Set webhook URL in Flutterwave to the same webhook above.</p>
          </div>
          <div class="border rounded-xl p-4 space-y-2">
            <h3 class="font-semibold">Withdraw / payout</h3>
            <select name="withdraw_provider" class="w-full border rounded-xl px-3 py-2 text-sm">
              <?php foreach (['none','paystack','flutterwave','stripe','nowpayments','manual'] as $p): ?>
                <option value="<?= $p ?>" <?= ($gw['withdraw_provider']??'')===$p?'selected':'' ?>><?= $p ?></option>
              <?php endforeach; ?>
            </select>
            <label class="text-sm flex gap-2 items-center"><input type="checkbox" name="withdraw_enabled" <?= !empty($gw['withdraw_enabled'])?'checked':'' ?>> Enabled</label>
            <input name="withdraw_public_key" value="<?= h($gw['withdraw_public_key']??'') ?>" placeholder="Public key" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="withdraw_secret_key" value="<?= h($gw['withdraw_secret_key']??'') ?>" placeholder="Secret key" class="w-full border rounded-xl px-3 py-2 text-sm">
            <input name="withdraw_webhook" value="<?= h($gw['withdraw_webhook']??'') ?>" placeholder="Webhook URL" class="w-full border rounded-xl px-3 py-2 text-sm">
            <textarea name="withdraw_notes" class="w-full border rounded-xl px-3 py-2 text-sm" rows="2" placeholder="Notes"><?= h($gw['withdraw_notes']??'') ?></textarea>
          </div>
        </div>
        <button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save gateways</button>
      </form>
    <?php endif; ?>

    <?php if ($tab === 'settings'): ?>
      <form method="post" class="bg-white rounded-xl border p-5 grid sm:grid-cols-2 gap-4">
        <input type="hidden" name="form" value="settings">
        <h2 class="font-bold text-lg sm:col-span-2">Platform fees & support</h2>
        <div class="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-4 grid sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <h3 class="font-bold text-sm text-slate-800">₦ Naira rate</h3>
            <p class="text-[11px] text-slate-500">Same control as Gateways tab. Changes apply to the next Flutterwave deposit.</p>
          </div>
          <div>
            <label class="text-xs text-slate-500">Flutterwave charge currency</label>
            <select name="payment_currency" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm bg-white">
              <?php $pc = setting_get('payment_currency', 'NGN'); ?>
              <option value="NGN" <?= $pc==='NGN'?'selected':'' ?>>NGN (Naira) — recommended</option>
              <option value="USD" <?= $pc==='USD'?'selected':'' ?>>USD</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-500">USD → NGN rate (e.g. 1600)</label>
            <input name="usd_ngn_rate" type="number" step="1" min="1" value="<?= h(setting_get('usd_ngn_rate','1600')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm bg-white">
            <p class="text-[11px] text-slate-400 mt-1">$3 deposit → ₦(3 × rate) on Flutterwave.</p>
          </div>
        </div>
        <div><label class="text-xs text-slate-500">Min deposit ($)</label><input name="min_deposit" type="number" step="0.01" value="<?= h(setting_get('min_deposit',3)) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Min withdraw ($)</label><input name="min_withdraw" type="number" step="0.01" value="<?= h(setting_get('min_withdraw',5)) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Withdraw commission (%)</label><input name="withdraw_commission" type="number" step="0.1" value="<?= h(((float)setting_get('withdraw_commission_rate',0.1))*100) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Deposit fee (%)</label><input name="deposit_fee" type="number" step="0.1" value="<?= h(((float)setting_get('deposit_fee_rate',0))*100) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Support Telegram</label><input name="support_telegram" value="<?= h(setting_get('support_telegram','')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Support email</label><input name="support_email" value="<?= h(setting_get('support_email','')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div class="sm:col-span-2"><button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save settings</button></div>
      </form>
    <?php endif; ?>

    <?php if ($tab === 'plans'): $plans = db()->query('SELECT * FROM plans ORDER BY price ASC')->fetchAll(); ?>
      <div class="space-y-3">
        <?php foreach ($plans as $p): ?>
          <form method="post" class="bg-white border rounded-xl p-4 grid sm:grid-cols-5 gap-3 items-end">
            <input type="hidden" name="form" value="plan">
            <input type="hidden" name="plan_id" value="<?= h($p['id']) ?>">
            <div class="sm:col-span-1"><p class="font-semibold"><?= h($p['id']) ?></p></div>
            <div><label class="text-xs">Name</label><input name="name" value="<?= h($p['name']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"></div>
            <div><label class="text-xs">Price</label><input name="price" type="number" step="0.01" value="<?= h($p['price']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"></div>
            <div><label class="text-xs">Daily uploads</label><input name="daily_uploads" type="number" value="<?= h($p['daily_uploads']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"></div>
            <div><label class="text-xs">Approval label</label><input name="approval_label" value="<?= h($p['approval_label']) ?>" class="w-full border rounded-lg px-2 py-2 text-sm"><button class="mt-2 w-full bg-brand text-white rounded-lg py-2 text-xs font-bold">Save</button></div>
          </form>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </main>
<?php endif; ?>
</body>
</html>
