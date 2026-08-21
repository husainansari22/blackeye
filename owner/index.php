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
if ($authed) {
    try { migrate_legacy_support_email(); } catch (Throwable $e) {}
}

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
            $ngnRate = max(1, (float)($_POST['usd_ngn_rate'] ?? 1600));
            setting_set('usd_ngn_rate', (string)$ngnRate);
            $wc = wallet_currencies_get();
            foreach ($wc['local'] as &$row) {
                if (strtoupper((string)($row['code'] ?? '')) === 'NGN') $row['rate'] = $ngnRate;
            }
            unset($row);
            wallet_currencies_set($wc);
            $flash = 'Naira rate saved. New deposits & withdraws will use this rate.';
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
            $txId = (int)$_POST['tx_id'];
            $newStatus = (string)$_POST['status'];
            $tx = db()->prepare('SELECT * FROM transactions WHERE id = ?');
            $tx->execute([$txId]);
            $row = $tx->fetch();
            if ($row) {
                $old = $row['status'];
                // If cancelling/rejecting a pending withdrawal, refund the user
                if ($row['type'] === 'withdrawal' && $old === 'pending' && in_array($newStatus, ['cancelled', 'failed'], true)) {
                    db()->prepare('UPDATE users SET balance = balance + ?, total_withdrawals = GREATEST(0, total_withdrawals - ?) WHERE id = ?')
                        ->execute([money_f($row['amount']), money_f($row['amount']), (int)$row['user_id']]);
                    notify_user((int)$row['user_id'], 'Withdrawal declined', 'Your withdrawal of $' . money_f($row['amount']) . ' was declined and refunded to your wallet.', 'wallet');
                }
                if ($row['type'] === 'withdrawal' && $old === 'pending' && $newStatus === 'completed') {
                    notify_user((int)$row['user_id'], 'Withdrawal paid', 'Your withdrawal of $' . money_f($row['payout'] ?? $row['amount']) . ' was marked completed.', 'wallet');
                    // Lock bank details after first successful bank payout
                    if (strtolower((string)($row['method'] ?? '')) === 'bank') {
                        ensure_user_payout_columns();
                        db()->prepare('UPDATE users SET payout_bank_locked = 1 WHERE id = ? AND payout_account != \'\'')
                            ->execute([(int)$row['user_id']]);
                    }
                }
                // Approving a pending deposit credits the wallet (crypto / manual)
                if ($row['type'] === 'deposit' && $old === 'pending' && $newStatus === 'completed') {
                    db()->prepare('UPDATE users SET balance = balance + ?, total_deposits = total_deposits + ? WHERE id = ?')
                        ->execute([money_f($row['amount']), money_f($row['amount']), (int)$row['user_id']]);
                    notify_user((int)$row['user_id'], 'Deposit credited', 'Your deposit of $' . money_f($row['amount']) . ' was credited to your wallet.', 'wallet');
                }
                if (!empty($_POST['note_edit'])) {
                    db()->prepare('UPDATE transactions SET status = ?, note = ? WHERE id = ?')
                        ->execute([$newStatus, trim((string)$_POST['note_edit']), $txId]);
                } else {
                    db()->prepare('UPDATE transactions SET status = ? WHERE id = ?')->execute([$newStatus, $txId]);
                }
            }
            $flash = 'Transaction status updated.';
        }
        if ($form === 'currencies') {
            $localIn = $_POST['local'] ?? [];
            $cryptoIn = $_POST['crypto'] ?? [];
            if (!is_array($localIn) || !is_array($cryptoIn)) {
                throw new RuntimeException('Invalid currency form');
            }
            $local = [];
            foreach ($localIn as $row) {
                if (!is_array($row)) continue;
                $code = strtoupper(trim((string)($row['code'] ?? '')));
                if ($code === '') continue;
                $local[] = [
                    'code' => $code,
                    'name' => trim((string)($row['name'] ?? $code)),
                    'flag' => strtolower(trim((string)($row['flag'] ?? ''))),
                    'rate' => max(0.0001, (float)($row['rate'] ?? 1)),
                    'enabled' => !empty($row['enabled']),
                ];
            }
            $crypto = [];
            foreach ($cryptoIn as $row) {
                if (!is_array($row)) continue;
                $code = strtoupper(trim((string)($row['code'] ?? '')));
                if ($code === '') continue;
                $netsRaw = trim((string)($row['networks'] ?? ''));
                $nets = array_values(array_filter(array_map('trim', preg_split('/[,|]+/', $netsRaw) ?: [])));
                $crypto[] = [
                    'code' => $code,
                    'name' => trim((string)($row['name'] ?? $code)),
                    'networks' => $nets ?: ['TRC20'],
                    'enabled' => !empty($row['enabled']),
                ];
            }
            if (!$local) {
                throw new RuntimeException('Add at least one local currency');
            }
            wallet_currencies_set(['local' => $local, 'crypto' => $crypto]);
            $flash = 'Currency rates saved. Deposit & withdraw will use the new rates.';
        }
        if ($form === 'order_status') {
            $oid = (int)$_POST['order_id'];
            $newStatus = (string)$_POST['status'];
            $order = db()->prepare('SELECT * FROM orders WHERE id = ?');
            $order->execute([$oid]);
            $o = $order->fetch();
            if (!$o) throw new RuntimeException('Order not found');
            if ($newStatus === 'cancelled' && ($o['status'] ?? '') !== 'cancelled') {
                refund_order_with_debt($o, 'Owner admin');
                $flash = 'Order refunded: buyer credited, seller deducted (balance may go negative / owing).';
            } else {
                db()->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$newStatus, $oid]);
                $flash = 'Order status updated.';
            }
        }
        if ($form === 'owner_refund') {
            $oid = (int)$_POST['order_id'];
            $order = db()->prepare('SELECT * FROM orders WHERE id = ?');
            $order->execute([$oid]);
            $o = $order->fetch();
            if (!$o) throw new RuntimeException('Order not found');
            refund_order_with_debt($o, 'Owner refund');
            $flash = 'Refunded via owner. Seller debt allowed if balance was too low.';
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$tab = $_GET['tab'] ?? 'overview';
?>
<!DOCTYPE html>
<html lang="en" id="ownerHtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <title>Owner Admin — Acctventa</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config={darkMode:'class',theme:{extend:{colors:{brand:'#0ea5e9'}}}};
    (function(){try{var t=localStorage.getItem('acctventa_owner_theme')||'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/admin-app.css?v=20260821adv2">
  <style>
    body.av-app{font-family:"Plus Jakarta Sans",system-ui,sans-serif}
  </style>
</head>
<body class="av-app min-h-screen">
<?php if (!$authed): ?>
  <div class="min-h-screen flex items-center justify-center p-4">
    <form method="post" class="w-full max-w-sm av-card p-6 space-y-4">
      <input type="hidden" name="form" value="login">
      <div class="text-center">
        <div class="w-12 h-12 mx-auto rounded-xl bg-brand text-white flex items-center justify-center font-bold text-xl mb-2">A</div>
        <h1 class="text-xl font-bold">Owner Admin</h1>
        <p class="text-xs text-slate-500">Full website control (users, money, ads, gateways)</p>
      </div>
      <?php if ($error): ?><p class="text-xs text-red-600"><?= h($error) ?></p><?php endif; ?>
      <div>
        <label class="text-xs text-slate-500">Username</label>
        <input name="username" value="owner" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" required>
      </div>
      <div>
        <label class="text-xs text-slate-500">Password</label>
        <input name="password" type="password" class="mt-1 w-full border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2.5 text-base" required>
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
  <header class="av-topbar">
    <div class="av-topbar-inner">
      <div class="av-brand"><span class="av-brand-mark">A</span><span class="title truncate">Owner Admin</span></div>
      <div class="av-top-actions">
        <button type="button" id="ownerThemeBtn" onclick="toggleOwnerTheme()" class="av-icon-btn">Dark</button>
        <a href="/dashboard.html" class="av-link-btn">App</a>
        <a href="?logout=1" class="av-link-btn danger">Log out</a>
      </div>
    </div>
  </header>

  <main class="av-shell space-y-4 py-4">
    <?php if ($flash): ?><div class="av-ok text-sm px-4 py-3"><?= h($flash) ?></div><?php endif; ?>
    <?php if ($error): ?><div class="av-warn text-sm px-4 py-3"><?= h($error) ?></div><?php endif; ?>

    <div class="av-tabs">
      <?php foreach (['overview'=>'Overview','users'=>'Users','ads'=>'Ads','orders'=>'Orders','chats'=>'Order chats','reports'=>'Reports','wallet'=>'Wallet','support'=>'Support','currencies'=>'Currencies','gateways'=>'Gateways','settings'=>'Settings','plans'=>'Plans'] as $k=>$label): ?>
        <a href="?tab=<?= $k ?>" class="av-tab <?= $tab===$k?'av-tab-active':'' ?>"><?= $label ?></a>
      <?php endforeach; ?>
    </div>

    <?php if ($tab === 'overview'): ?>
      <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="av-stat"><p class="label">Users</p><p class="value"><?= $stats['users'] ?></p></div>
        <div class="av-stat"><p class="label">Pending ads</p><p class="value"><?= $stats['ads_pending'] ?></p></div>
        <div class="av-stat"><p class="label">Orders</p><p class="value"><?= $stats['orders'] ?></p></div>
        <div class="av-stat"><p class="label">Pending withdrawals</p><p class="value"><?= $stats['withdraw_pending'] ?></p></div>
        <div class="av-stat"><p class="label">Completed volume</p><p class="value">$<?= number_format($stats['volume'], 2) ?></p></div>
      </div>
      <div class="av-info text-sm p-4">
        This is your real Owner control panel (MySQL). Use it to manage every user, listing, order, withdrawal, fee, and payment gateway.
      </div>
    <?php endif; ?>

    <?php if ($tab === 'support'):
      ensure_support_tables();
      $staffToken = create_staff_session('owner', 'Owner Support');
    ?>
      <div class="av-card p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="font-bold text-lg av-text">Live Chat Support</h2>
            <p class="text-xs av-muted">Messaging-app layout — readable bubbles & images in light/dark.</p>
          </div>
          <button type="button" onclick="ownerEnableNotif()" class="av-icon-btn">Notifications</button>
        </div>
        <div class="av-chat-shell">
          <div class="av-chat-list">
            <div class="av-chat-list-head flex justify-between items-center">
              <span>Conversations</span>
              <button type="button" onclick="ownerLoadThreads()" class="av-icon-btn">Refresh</button>
            </div>
            <div id="ownerThreadList" class="flex-1 overflow-y-auto" style="max-height:55vh"></div>
          </div>
          <div class="av-chat-pane">
            <div id="ownerChatHeader" class="av-chat-pane-head">Select a conversation</div>
            <div id="ownerChatMsgs" class="av-chat-msgs"></div>
            <p id="ownerTyping" class="px-3 text-[11px] av-muted h-5"></p>
            <div class="av-composer">
              <input type="file" id="ownerSupportFile" class="hidden" accept="image/*,.pdf,.txt,.doc,.docx,.zip" onchange="onOwnerSupportFile(event)">
              <button type="button" class="av-icon-btn" onclick="document.getElementById('ownerSupportFile').click()">📎</button>
              <input id="ownerReply" type="text" placeholder="Type a reply…" oninput="ownerTyping()" onkeydown="if(event.key==='Enter'){ownerSend();}">
              <button type="button" onclick="ownerSend()" class="av-send">Send</button>
            </div>
            <p id="ownerSupportAttachHint" class="hidden px-3 pb-2 text-[10px] av-muted"></p>
          </div>
        </div>
      </div>
      <script>
        const OWNER_STAFF_TOKEN = <?= json_encode($staffToken) ?>;
        localStorage.setItem('acctventa_staff_token', OWNER_STAFF_TOKEN);
        let ownerActive = null;
        let ownerFp = '';
        let ownerAttach = null;
        function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
        function ownerAttachHtml(m){
          if(!m||!m.attachmentUrl) return '';
          const url=esc(m.attachmentUrl);
          const mime=String(m.attachmentMime||'');
          const isImg=mime.startsWith('image/')||/\.(png|jpe?g|gif|webp|heic)$/i.test(m.attachmentUrl||'');
          if(isImg) return `<a href="${url}" target="_blank" rel="noopener"><img class="av-attach" src="${url}" alt="${esc(m.attachmentName||'image')}"></a>`;
          return `<a class="av-file" href="${url}" target="_blank" rel="noopener">📎 ${esc(m.attachmentName||'file')}</a>`;
        }
        function onOwnerSupportFile(ev){
          const file=ev.target.files&&ev.target.files[0]; if(!file)return;
          if(file.size>8*1024*1024){alert('Max 8MB');ev.target.value='';return;}
          const reader=new FileReader();
          reader.onload=()=>{ownerAttach={dataUrl:reader.result,name:file.name}; const h=document.getElementById('ownerSupportAttachHint'); if(h){h.classList.remove('hidden');h.textContent='Attached: '+file.name;}};
          reader.readAsDataURL(file); ev.target.value='';
        }
        function ownerEnableNotif(){ if(!('Notification' in window)) return alert('Not supported'); Notification.requestPermission(); }
        function ownerNotify(t,b){ if(!('Notification' in window)||Notification.permission!=='granted')return; if(document.visibilityState==='visible')return; try{new Notification(t,{body:String(b||'').slice(0,120)});}catch(e){} }
        async function apiStaff(action, opts={}){
          const url = new URL('/api/index.php', location.origin);
          url.searchParams.set('action', action);
          if(opts.query) Object.entries(opts.query).forEach(([k,v])=>url.searchParams.set(k,v));
          const res = await fetch(url, {
            method: opts.method||'GET',
            headers: { 'Authorization':'Bearer '+OWNER_STAFF_TOKEN, 'X-Staff-Token': OWNER_STAFF_TOKEN, ...(opts.body?{'Content-Type':'application/json'}:{}) },
            body: opts.body?JSON.stringify(opts.body):undefined
          });
          const data = await res.json();
          if(!res.ok||data.ok===false) throw new Error(data.error||'Request failed');
          return data;
        }
        async function ownerLoadThreads(){
          try{
            const res = await apiStaff('support.threads');
            const threads = res.threads||[];
            const fp = threads.map(t=>t.id+':'+(t.lastMessageAt||'')+':'+(t.lastBody||'')).join('|');
            if(fp!==ownerFp && ownerFp && threads[0]) ownerNotify('New support message', (threads[0].userName||'User')+': '+(threads[0].lastBody||''));
            ownerFp = fp;
            const box = document.getElementById('ownerThreadList');
            if(!threads.length){ box.innerHTML='<p class="p-3 text-xs av-muted">No conversations yet.</p>'; return; }
            box.innerHTML = threads.map(t=>`<button type="button" onclick="ownerOpen(${t.id})" class="av-thread ${ownerActive===t.id?'is-active':''}">
              <div class="flex justify-between"><p class="name truncate">${esc(t.userName)}</p>${t.userOnline?'<span class="w-2 h-2 rounded-full bg-emerald-500 mt-1"></span>':''}</div>
              <p class="meta truncate">${esc(t.userEmail)}</p>
              <p class="preview truncate">${esc(t.lastBody||'No messages')}</p>
            </button>`).join('');
          }catch(e){ document.getElementById('ownerThreadList').innerHTML='<p class="p-3 text-xs" style="color:#ef4444">'+esc(e.message)+'</p>'; }
        }
        async function ownerOpen(id){
          ownerActive=id;
          try{
            const res = await apiStaff('support.messages',{query:{threadId:id}});
            const t=res.thread||{};
            document.getElementById('ownerChatHeader').innerHTML=esc(t.userName||'User')+' <span class="text-xs font-normal av-muted">'+esc(t.userEmail||'')+(t.userOnline?' · <span style="color:#10b981">Online</span>':'')+'</span>';
            document.getElementById('ownerTyping').textContent=t.userTyping?'User is typing…':'';
            const box=document.getElementById('ownerChatMsgs');
            const msgs=res.messages||[];
            box.innerHTML=msgs.length?msgs.map(m=>{const mine=m.role==='staff';return `<div class="av-bubble ${mine?'av-bubble-out':'av-bubble-in'}"><p class="who">${esc(mine?(m.staffName||'Support'):(t.userName||'User'))}</p><p class="body">${esc(m.body||'')}</p>${ownerAttachHtml(m)}</div>`;}).join(''):'<p class="text-center text-xs av-muted py-6">No messages yet.</p>';
            box.scrollTop=box.scrollHeight;
            ownerLoadThreads();
          }catch(e){alert(e.message);}
        }
        let ot;
        function ownerTyping(){ if(!ownerActive)return; clearTimeout(ot); apiStaff('support.typing',{method:'POST',body:{threadId:ownerActive,typing:true}}).catch(()=>{}); ot=setTimeout(()=>apiStaff('support.typing',{method:'POST',body:{threadId:ownerActive,typing:false}}).catch(()=>{}),1500); }
        async function ownerSend(){
          const input=document.getElementById('ownerReply');
          const text=(input.value||'').trim();
          if((!text&&!ownerAttach)||!ownerActive)return;
          try{
            const body={threadId:ownerActive,text:text||''};
            if(ownerAttach){body.attachment=ownerAttach.dataUrl;body.fileName=ownerAttach.name;}
            await apiStaff('support.send',{method:'POST',body});
            input.value=''; ownerAttach=null;
            const h=document.getElementById('ownerSupportAttachHint'); if(h){h.classList.add('hidden');h.textContent='';}
            ownerOpen(ownerActive);
          }catch(e){alert(e.message);}
        }
        ownerLoadThreads();
        setInterval(()=>{ ownerLoadThreads(); if(ownerActive) ownerOpen(ownerActive); }, 3000);
        ownerEnableNotif();
      </script>
    <?php endif; ?>

    <?php if ($tab === 'users'): $users = db()->query('SELECT * FROM users ORDER BY created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="av-table-wrap">
        <table class="w-full text-left text-xs">
          <thead><tr>
            <th class="p-3">ID</th><th class="p-3">Name</th><th class="p-3">Email</th><th class="p-3">Balance</th><th class="p-3">Plan</th><th class="p-3">Flags</th><th class="p-3">Actions</th>
          </tr></thead>
          <tbody>
          <?php foreach ($users as $u): ?>
            <tr class="border-t">
              <td class="p-3"><?= (int)$u['id'] ?></td>
              <td class="p-3 font-medium"><?= h($u['name']) ?></td>
              <td class="p-3"><?= h($u['email']) ?></td>
              <td class="p-3 <?= (float)$u['balance'] < 0 ? 'text-red-600 font-bold' : '' ?>">$<?= number_format((float)$u['balance'], 2) ?><?php if ((float)$u['balance'] < 0): ?> <span class="text-[10px]">(owing)</span><?php endif; ?></td>
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
          <div class="av-card  p-4 text-sm space-y-2">
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

    <?php if ($tab === 'orders'): $orders = db()->query('SELECT o.*, b.name buyer_name, s.name seller_name, s.balance seller_balance FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id ORDER BY o.created_at DESC LIMIT 200')->fetchAll(); ?>
      <div class="av-card  p-4 mb-3 space-y-2">
        <h2 class="font-bold">Find sale by Transaction ID</h2>
        <p class="text-xs text-slate-500">Search TXID / email / name, open buyer↔seller chat, then refund if needed (seller can go negative).</p>
        <div class="flex flex-wrap gap-2">
          <input id="ownerTxSearch" type="text" placeholder="TXID or email…" class="border dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2 text-base flex-1 min-w-[200px]">
          <button type="button" onclick="ownerSearchOrder()" class="bg-brand text-white font-bold px-4 py-2 rounded-xl text-sm">Search</button>
        </div>
        <div id="ownerTxResult" class="text-xs space-y-2"></div>
      </div>
      <div class="av-table-wrap">
        <table class="w-full text-left text-xs">
          <thead><tr><th class="p-3">TXID</th><th class="p-3">Item</th><th class="p-3">Buyer</th><th class="p-3">Seller</th><th class="p-3">Price</th><th class="p-3">Status</th><th class="p-3">Actions</th></tr></thead>
          <tbody>
          <?php foreach ($orders as $o): ?>
            <tr class="border-t dark:border-slate-800">
              <td class="p-3 font-mono"><?= h($o['public_id']) ?></td>
              <td class="p-3"><?= h($o['title']) ?></td>
              <td class="p-3"><?= h($o['buyer_name']) ?></td>
              <td class="p-3"><?= h($o['seller_name']) ?><?php if ((float)$o['seller_balance'] < 0): ?><br><span class="text-red-500">bal -$<?= number_format(abs((float)$o['seller_balance']), 2) ?></span><?php endif; ?></td>
              <td class="p-3">$<?= number_format((float)$o['price'], 2) ?></td>
              <td class="p-3"><?= h($o['status']) ?></td>
              <td class="p-3 space-y-1 min-w-[200px]">
                <form method="post" class="flex gap-1">
                  <input type="hidden" name="form" value="order_status">
                  <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
                  <select name="status" class="border dark:border-slate-700 dark:bg-slate-950 rounded px-1">
                    <?php foreach (['pending','completed','cancelled','disputed'] as $st): ?>
                      <option <?= $o['status']===$st?'selected':'' ?>><?= $st ?></option>
                    <?php endforeach; ?>
                  </select>
                  <button class="bg-brand text-white px-2 rounded">Save</button>
                </form>
                <?php if ($o['status'] !== 'cancelled'): ?>
                <form method="post" onsubmit="return confirm('Refund buyer and deduct seller (allows negative / owing)?')">
                  <input type="hidden" name="form" value="owner_refund">
                  <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
                  <button class="bg-red-500 text-white px-2 py-1 rounded text-[10px] font-bold">Refund buyer</button>
                </form>
                <?php endif; ?>
                <a class="text-brand underline text-[10px]" href="?tab=chats&order_id=<?= (int)$o['id'] ?>">View chat</a>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <script>
        async function ownerSearchOrder(){
          const q=(document.getElementById('ownerTxSearch').value||'').trim();
          const box=document.getElementById('ownerTxResult');
          if(!q){box.innerHTML='';return;}
          try{
            const token=localStorage.getItem('acctventa_staff_token')||'';
            if(!token){
              // create via support tab once — fallback fetch staff login not needed; use server-rendered link hint
            }
            const url=new URL('/api/index.php',location.origin);
            url.searchParams.set('action','staff.orders.search');
            url.searchParams.set('q',q);
            const res=await fetch(url,{headers:{'Authorization':'Bearer '+(localStorage.getItem('acctventa_staff_token')||''),'X-Staff-Token':(localStorage.getItem('acctventa_staff_token')||'')}});
            const data=await res.json();
            if(!res.ok||data.ok===false) throw new Error(data.error||'Search failed — open Support tab once to mint staff token, then retry');
            const rows=data.orders||[];
            if(!rows.length){box.innerHTML='<p class="text-slate-500">No matches.</p>';return;}
            box.innerHTML=rows.map(o=>`<div class="border dark:border-slate-700 rounded-lg p-2">
              <p class="font-mono font-bold">${esc(o.public_id)}</p>
              <p>${esc(o.title)} · ${esc(o.status)} · $${Number(o.price).toFixed(2)}</p>
              <p>Buyer: ${esc(o.buyer_name)} (${esc(o.buyer_email)}) · bal $${Number(o.buyer_balance).toFixed(2)}</p>
              <p>Seller: ${esc(o.seller_name)} (${esc(o.seller_email)}) · bal <span class="${Number(o.seller_balance)<0?'text-red-500 font-bold':''}">$${Number(o.seller_balance).toFixed(2)}</span></p>
              <a class="text-brand underline" href="?tab=chats&order_id=${o.id}">Open buyer/seller chat</a>
            </div>`).join('');
          }catch(e){box.innerHTML='<p class="text-red-500">'+esc(e.message)+'</p>';}
        }
        function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
      </script>
    <?php endif; ?>

    <?php if ($tab === 'chats'):
      ensure_marketplace_extras();
      $staffToken = create_staff_session('owner', 'Owner Support');
      $focusOrder = (int)($_GET['order_id'] ?? 0);
    ?>
      <div class="av-card p-4 space-y-3">
        <h2 class="font-bold text-lg av-text">All buyer ↔ seller chats</h2>
        <p class="text-xs av-muted">View any order thread by TXID to resolve disputes, then refund from Orders.</p>
        <div class="av-chat-shell">
          <div class="av-chat-list">
            <div class="av-chat-list-head flex justify-between items-center">
              <span>Threads</span>
              <button type="button" onclick="loadOrderChats()" class="av-icon-btn">Refresh</button>
            </div>
            <div id="orderChatList" class="overflow-y-auto" style="max-height:55vh"></div>
          </div>
          <div class="av-chat-pane">
            <div id="orderChatHeader" class="av-chat-pane-head">Select a chat</div>
            <div id="orderChatMsgs" class="av-chat-msgs"></div>
            <div id="orderChatActions" class="p-2 border-t hidden" style="border-color:var(--av-border)">
              <button type="button" id="orderChatRefundBtn" class="av-send" style="background:#ef4444">Refund buyer (allows seller debt)</button>
            </div>
          </div>
        </div>
      </div>
      <script>
        localStorage.setItem('acctventa_staff_token', <?= json_encode($staffToken) ?>);
        const FOCUS_ORDER = <?= (int)$focusOrder ?>;
        let activeOrderChat = null;
        function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
        async function apiStaff(action, opts={}){
          const url=new URL('/api/index.php',location.origin);
          url.searchParams.set('action',action);
          if(opts.query) Object.entries(opts.query).forEach(([k,v])=>url.searchParams.set(k,v));
          const tok=localStorage.getItem('acctventa_staff_token')||'';
          const res=await fetch(url,{method:opts.method||'GET',headers:{'Authorization':'Bearer '+tok,'X-Staff-Token':tok,...(opts.body?{'Content-Type':'application/json'}:{})},body:opts.body?JSON.stringify(opts.body):undefined});
          const data=await res.json();
          if(!res.ok||data.ok===false) throw new Error(data.error||'Failed');
          return data;
        }
        async function loadOrderChats(){
          const res=await apiStaff('staff.orders.chats');
          const box=document.getElementById('orderChatList');
          const chats=res.chats||[];
          if(!chats.length){box.innerHTML='<p class="p-3 text-xs text-slate-400">No order chats yet.</p>';return;}
          box.innerHTML=chats.map(c=>`<button type="button" onclick="openOrderChat(${c.id})" class="av-thread ${activeOrderChat===c.id?'is-active':''}">
            <p class="name font-mono">${esc(c.public_id)}</p>
            <p class="meta truncate">${esc(c.title)} · ${esc(c.status)}</p>
            <p class="meta">${esc(c.buyer_name)} ↔ ${esc(c.seller_name)} · ${c.message_count} msgs</p>
            <p class="preview truncate">${esc(c.last_body||'')}</p>
          </button>`).join('');
        }
        async function openOrderChat(id){
          activeOrderChat=id;
          const res=await apiStaff('staff.orders.get',{query:{orderId:id}});
          const o=res.order||{};
          document.getElementById('orderChatHeader').innerHTML=`<span class="font-mono">${esc(o.public_id)}</span> · ${esc(o.title)} · ${esc(o.status)}<br><span class="text-xs font-normal av-muted">${esc(o.buyer_name)} ↔ ${esc(o.seller_name)} · seller bal $${Number(o.seller_balance).toFixed(2)}</span>`;
          const msgs=res.messages||[];
          const box=document.getElementById('orderChatMsgs');
          box.className='av-chat-msgs';
          box.innerHTML=msgs.length?msgs.map(m=>{
            const mime=String(m.attachmentMime||'');
            const isImg=m.attachmentUrl&&(mime.startsWith('image/')||/\.(png|jpe?g|gif|webp)$/i.test(m.attachmentUrl));
            const att=m.attachmentUrl?(isImg?`<a href="${esc(m.attachmentUrl)}" target="_blank" rel="noopener"><img class="av-attach" src="${esc(m.attachmentUrl)}" alt=""></a>`:`<a class="av-file" href="${esc(m.attachmentUrl)}" target="_blank" rel="noopener">📎 ${esc(m.attachmentName||'file')}</a>`):'';
            return `<div class="av-bubble av-bubble-in"><p class="who">${esc(m.fromName)} · ${esc(m.fromEmail)}</p><p class="body">${esc(m.text||m.body||'')}</p>${att}</div>`;
          }).join(''):'<p class="text-xs av-muted text-center py-6">No messages</p>';
          const actions=document.getElementById('orderChatActions');
          actions.classList.toggle('hidden', o.status==='cancelled');
          document.getElementById('orderChatRefundBtn').onclick=async()=>{
            if(!confirm('Refund buyer and deduct seller (negative OK)?'))return;
            try{const r=await apiStaff('staff.orders.refund',{method:'POST',body:{orderId:id}});alert('Refunded. Seller balance: $'+Number(r.sellerBalance).toFixed(2)+(r.owing?' (owing $'+Number(r.owing).toFixed(2)+')':''));openOrderChat(id);}catch(e){alert(e.message);}
          };
          loadOrderChats();
        }
        loadOrderChats().then(()=>{ if(FOCUS_ORDER) openOrderChat(FOCUS_ORDER); }).catch(e=>alert(e.message));
      </script>
    <?php endif; ?>

    <?php if ($tab === 'reports'):
      ensure_marketplace_extras();
      $reports = [];
      try {
        $reports = db()->query("SELECT r.*, o.public_id, o.title, b.name AS buyer_name, s.name AS seller_name
          FROM seller_reports r
          JOIN orders o ON o.id = r.order_id
          JOIN users b ON b.id = r.reporter_id
          JOIN users s ON s.id = r.seller_id
          ORDER BY r.created_at DESC LIMIT 100")->fetchAll();
      } catch (Throwable $e) {}
    ?>
      <div class="av-table-wrap">
        <table class="w-full text-left text-xs">
          <thead><tr><th class="p-3">When</th><th class="p-3">TXID</th><th class="p-3">Buyer</th><th class="p-3">Seller</th><th class="p-3">Reason</th><th class="p-3">Open</th></tr></thead>
          <tbody>
          <?php if (!$reports): ?>
            <tr><td colspan="6" class="p-4 text-slate-400">No seller reports yet.</td></tr>
          <?php endif; ?>
          <?php foreach ($reports as $r): ?>
            <tr class="border-t dark:border-slate-800">
              <td class="p-3"><?= h($r['created_at']) ?></td>
              <td class="p-3 font-mono"><?= h($r['public_id']) ?></td>
              <td class="p-3"><?= h($r['buyer_name']) ?></td>
              <td class="p-3"><?= h($r['seller_name']) ?></td>
              <td class="p-3"><?= h($r['reason']) ?></td>
              <td class="p-3"><a class="text-brand underline" href="?tab=chats&order_id=<?= (int)$r['order_id'] ?>">Chat</a></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php endif; ?>

    <?php if ($tab === 'wallet'):
      $pendingWd = db()->query("SELECT t.*, u.email, u.name FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.type='withdrawal' AND t.status='pending' ORDER BY t.created_at ASC")->fetchAll();
      $pendingDep = db()->query("SELECT t.*, u.email, u.name FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.type='deposit' AND t.status='pending' ORDER BY t.created_at ASC")->fetchAll();
      $txs = db()->query('SELECT t.*, u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 200')->fetchAll();
    ?>
      <div class="av-warn p-4 mb-4">
        <h2 class="font-bold text-lg mb-1">Pending withdrawals (approve / reject)</h2>
        <p class="text-xs mb-3">Rejecting refunds the user’s wallet. Completing marks payout as paid. You can edit the note before saving.</p>
        <?php if (!$pendingWd): ?>
          <p class="text-sm">No pending withdrawals.</p>
        <?php else: ?>
          <div class="space-y-2">
          <?php foreach ($pendingWd as $t): ?>
            <div class="av-card  p-3 space-y-2">
              <div class="text-xs">
                <p class="font-bold text-sm"><?= h($t['name']) ?> · <?= h($t['email']) ?></p>
                <p>$<?= number_format((float)$t['amount'], 2) ?> · fee $<?= number_format((float)$t['fee'], 2) ?> · payout $<?= number_format((float)($t['payout'] ?? 0), 2) ?></p>
                <p class="text-slate-500 mt-1"><?= h($t['method']) ?></p>
                <p class="font-mono text-[10px] text-slate-400"><?= h($t['reference'] ?? '') ?></p>
              </div>
              <form method="post" class="space-y-2">
                <input type="hidden" name="form" value="tx_status">
                <input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>">
                <textarea name="note_edit" rows="2" class="w-full border rounded-lg px-2 py-1.5 text-xs" placeholder="Payout note / bank details"><?= h($t['note']) ?></textarea>
                <div class="flex flex-wrap gap-2">
                  <button name="status" value="completed" class="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg">Approve / Paid</button>
                  <button name="status" value="cancelled" class="bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-lg">Reject + refund</button>
                </div>
              </form>
            </div>
          <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </div>
      <div class="av-info p-4 mb-4">
        <h2 class="font-bold text-lg mb-1">Pending deposits (credit / reject)</h2>
        <p class="text-xs mb-3">Approving credits the user’s USD wallet (used for crypto deposits and manual overrides).</p>
        <?php if (!$pendingDep): ?>
          <p class="text-sm">No pending deposits.</p>
        <?php else: ?>
          <div class="space-y-2">
          <?php foreach ($pendingDep as $t): ?>
            <div class="av-card  p-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div class="text-xs">
                <p class="font-bold text-sm"><?= h($t['name']) ?> · <?= h($t['email']) ?></p>
                <p>$<?= number_format((float)$t['amount'], 2) ?> · <?= h($t['method']) ?></p>
                <p class="text-slate-500 mt-1"><?= h($t['note']) ?></p>
                <p class="font-mono text-[10px] text-slate-400"><?= h($t['reference'] ?? '') ?></p>
              </div>
              <div class="flex gap-2">
                <form method="post"><input type="hidden" name="form" value="tx_status"><input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>"><input type="hidden" name="status" value="completed"><button class="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg">Credit wallet</button></form>
                <form method="post"><input type="hidden" name="form" value="tx_status"><input type="hidden" name="tx_id" value="<?= (int)$t['id'] ?>"><input type="hidden" name="status" value="cancelled"><button class="bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-lg">Reject</button></form>
              </div>
            </div>
          <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </div>
      <div class="av-table-wrap">
        <table class="w-full text-left text-xs">
          <thead><tr><th class="p-3">ID</th><th class="p-3">User</th><th class="p-3">Type</th><th class="p-3">Amount</th><th class="p-3">Fee</th><th class="p-3">Status</th><th class="p-3">Note</th><th class="p-3">Update</th></tr></thead>
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

    <?php if ($tab === 'currencies'): $wc = wallet_currencies_get(); ?>
      <form method="post" class="space-y-4">
        <input type="hidden" name="form" value="currencies">
        <div class="av-card  p-5 space-y-3">
          <h2 class="font-bold text-lg">Deposit & withdraw rates</h2>
          <p class="text-xs text-slate-500">Edit the rate for each country (units per $1). These rates show on user Deposit and Withdraw screens.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-xs text-slate-500 border-b">
                <tr>
                  <th class="py-2 pr-2">Country</th>
                  <th class="py-2 pr-2">Code</th>
                  <th class="py-2 pr-2">1 USD =</th>
                  <th class="py-2 pr-2 text-center">On</th>
                </tr>
              </thead>
              <tbody>
              <?php foreach (($wc['local'] ?? []) as $i => $c): ?>
                <tr class="border-b border-slate-100">
                  <td class="py-3 pr-2">
                    <div class="flex items-center gap-2">
                      <?php if (!empty($c['flag'])): ?>
                        <img src="https://flagcdn.com/w40/<?= h($c['flag']) ?>.png" alt="" class="w-6 h-6 rounded-full object-cover">
                      <?php endif; ?>
                      <input type="hidden" name="local[<?= $i ?>][flag]" value="<?= h($c['flag'] ?? '') ?>">
                      <input type="hidden" name="local[<?= $i ?>][code]" value="<?= h($c['code'] ?? '') ?>">
                      <input name="local[<?= $i ?>][name]" value="<?= h($c['name'] ?? '') ?>" class="border rounded-lg px-2 py-1.5 text-sm w-36 sm:w-44">
                    </div>
                  </td>
                  <td class="py-3 pr-2 font-mono font-bold text-xs"><?= h($c['code'] ?? '') ?></td>
                  <td class="py-3 pr-2">
                    <input name="local[<?= $i ?>][rate]" type="number" step="0.01" min="0.01" value="<?= h((string)($c['rate'] ?? 1)) ?>" class="border rounded-lg px-2 py-1.5 text-sm w-28 font-semibold" required>
                  </td>
                  <td class="py-3 pr-2 text-center">
                    <input type="checkbox" name="local[<?= $i ?>][enabled]" value="1" class="accent-sky-500 w-4 h-4" <?= !empty($c['enabled']) ? 'checked' : '' ?>>
                  </td>
                </tr>
              <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        </div>

        <div class="av-card  p-5 space-y-3">
          <h2 class="font-bold text-lg">Crypto options</h2>
          <p class="text-xs text-slate-500">Networks are comma-separated (e.g. TRC20, BEP20, ERC20).</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-xs text-slate-500 border-b">
                <tr>
                  <th class="py-2 pr-2">Coin</th>
                  <th class="py-2 pr-2">Name</th>
                  <th class="py-2 pr-2">Networks</th>
                  <th class="py-2 pr-2 text-center">On</th>
                </tr>
              </thead>
              <tbody>
              <?php foreach (($wc['crypto'] ?? []) as $i => $c): ?>
                <tr class="border-b border-slate-100">
                  <td class="py-3 pr-2 font-mono font-bold text-xs">
                    <?= h($c['code'] ?? '') ?>
                    <input type="hidden" name="crypto[<?= $i ?>][code]" value="<?= h($c['code'] ?? '') ?>">
                  </td>
                  <td class="py-3 pr-2">
                    <input name="crypto[<?= $i ?>][name]" value="<?= h($c['name'] ?? '') ?>" class="border rounded-lg px-2 py-1.5 text-sm w-32">
                  </td>
                  <td class="py-3 pr-2">
                    <input name="crypto[<?= $i ?>][networks]" value="<?= h(implode(', ', $c['networks'] ?? [])) ?>" class="border rounded-lg px-2 py-1.5 text-sm w-48 sm:w-64">
                  </td>
                  <td class="py-3 pr-2 text-center">
                    <input type="checkbox" name="crypto[<?= $i ?>][enabled]" value="1" class="accent-sky-500 w-4 h-4" <?= !empty($c['enabled']) ? 'checked' : '' ?>>
                  </td>
                </tr>
              <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        </div>

        <button class="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm">Save rates</button>
      </form>
    <?php endif; ?>

    <?php if ($tab === 'gateways'): ?>
      <?php
        $fxRate = (float)setting_get('usd_ngn_rate', '1600');
        $fxCur = setting_get('payment_currency', 'NGN');
      ?>
      <form method="post" class="av-info p-5 space-y-3 mb-4">
        <input type="hidden" name="form" value="fx_rate">
        <h2 class="font-bold text-lg text-slate-900">Quick Naira rate</h2>
        <p class="text-xs text-slate-600">Wallet stays in <strong>USD ($)</strong>. For all country rates use <a href="?tab=currencies" class="text-brand font-semibold underline">Currencies</a>.</p>
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

      <form method="post" class="av-card  p-5 space-y-4">
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
      <form method="post" class="av-card  p-5 grid sm:grid-cols-2 gap-4">
        <input type="hidden" name="form" value="settings">
        <h2 class="font-bold text-lg sm:col-span-2">Platform fees & support</h2>
        <div class="sm:col-span-2 av-info p-4 grid sm:grid-cols-2 gap-3">
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
        <div><label class="text-xs text-slate-500">Support Telegram</label><input name="support_telegram" value="<?= h(setting_get('support_telegram','https://t.me/acctventa')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
        <div><label class="text-xs text-slate-500">Support email</label><input name="support_email" value="<?= h(setting_get('support_email','support@acctventa.com')) ?>" class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"></div>
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
<script>
function toggleOwnerTheme(){
  const html=document.documentElement;
  const dark=html.classList.toggle('dark');
  try{localStorage.setItem('acctventa_owner_theme', dark?'dark':'light');}catch(e){}
  const btn=document.getElementById('ownerThemeBtn');
  if(btn) btn.textContent=dark?'Light':'Dark';
}
(function(){
  const dark=document.documentElement.classList.contains('dark');
  const btn=document.getElementById('ownerThemeBtn');
  if(btn) btn.textContent=dark?'Light':'Dark';
})();
</script>
</body>
</html>
