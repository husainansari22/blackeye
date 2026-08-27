<?php
declare(strict_types=1);

/**
 * Acctventa branded HTML email templates + send helper (Hostinger mail()).
 */

function mail_cfg(): array {
    $c = app_config();
    return [
        'from_email' => $c['mail_from'] ?? ($c['support_email'] ?? 'support@acctventa.com'),
        'from_name' => $c['mail_from_name'] ?? ($c['app_name'] ?? 'Acctventa'),
        'app_name' => $c['app_name'] ?? 'Acctventa',
        'app_url' => rtrim($c['app_url'] ?? 'https://acctventa.com', '/'),
        'support_email' => $c['support_email'] ?? 'support@acctventa.com',
        'support_telegram' => $c['support_telegram'] ?? 'https://t.me/acctventa',
        'brand' => '#0ea5e9',
        'brand_hover' => '#0284c7',
    ];
}

function email_layout(string $title, string $innerHtml, string $preheader = ''): string {
    $m = mail_cfg();
    $brand = $m['brand'];
    $app = htmlspecialchars($m['app_name'], ENT_QUOTES, 'UTF-8');
    $year = date('Y');
    $support = htmlspecialchars($m['support_email'], ENT_QUOTES, 'UTF-8');
    $tg = htmlspecialchars($m['support_telegram'], ENT_QUOTES, 'UTF-8');
    $url = htmlspecialchars($m['app_url'], ENT_QUOTES, 'UTF-8');
    $pre = htmlspecialchars($preheader, ENT_QUOTES, 'UTF-8');
    $titleEsc = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');

    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$titleEsc}</title>
  <!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#070a0f;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{$pre}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070a0f;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 12px;background:linear-gradient(135deg,#0c4a6e 0%,#111827 55%,#111827 100%);">
              <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#fff;">
                <span style="color:{$brand};">●</span> {$app}
              </div>
              <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Secure marketplace for digital accounts</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              {$innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #1f2937;background:#0b1220;">
              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.5;">
                Need help? <a href="mailto:{$support}" style="color:{$brand};text-decoration:none;">{$support}</a>
                · <a href="{$tg}" style="color:{$brand};text-decoration:none;">Telegram</a>
              </p>
              <p style="margin:0;font-size:11px;color:#64748b;">
                © {$year} {$app} · <a href="{$url}" style="color:#64748b;text-decoration:none;">{$url}</a><br>
                If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
}

function email_button(string $label, string $href): string {
    $m = mail_cfg();
    $brand = $m['brand'];
    $label = htmlspecialchars($label, ENT_QUOTES, 'UTF-8');
    $href = htmlspecialchars($href, ENT_QUOTES, 'UTF-8');
    return '<a href="' . $href . '" style="display:inline-block;background:' . $brand . ';color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:12px;box-shadow:0 8px 20px rgba(14,165,233,0.25);">' . $label . '</a>';
}

function send_app_mail(string $to, string $subject, string $html, string $textFallback = ''): bool {
    $m = mail_cfg();
    $fromEmail = $m['from_email'];
    $fromName = $m['from_name'];
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $boundary = 'acct_' . bin2hex(random_bytes(8));
    if ($textFallback === '') {
        $textFallback = trim(preg_replace('/\s+/', ' ', strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html))));
    }

    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'From: ' . sprintf('%s <%s>', $fromName, $fromEmail);
    $headers[] = 'Reply-To: ' . $m['support_email'];
    $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';
    $headers[] = 'X-Mailer: Acctventa-Mailer';

    $body = "--{$boundary}\r\n";
    $body .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
    $body .= $textFallback . "\r\n\r\n";
    $body .= "--{$boundary}\r\n";
    $body .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
    $body .= $html . "\r\n\r\n";
    $body .= "--{$boundary}--";

    return @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
}

function email_password_reset(string $name, string $resetUrl): array {
    $m = mail_cfg();
    $safeName = htmlspecialchars($name !== '' ? $name : 'there', ENT_QUOTES, 'UTF-8');
    $inner = '
      <h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3;color:#fff;font-weight:800;">Reset your password</h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#cbd5e1;">Hi ' . $safeName . ', we received a request to reset your ' . htmlspecialchars($m['app_name'], ENT_QUOTES, 'UTF-8') . ' account password. Tap the button below to choose a new one.</p>
      <div style="text-align:center;margin:28px 0;">' . email_button('Choose a new password', $resetUrl) . '</div>
      <div style="background:#0b1220;border:1px solid #1f2937;border-radius:14px;padding:14px 16px;margin:8px 0 16px;">
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">This link expires in <strong style="color:#e2e8f0;">30 minutes</strong> and can only be used once. If the button doesn’t work, copy this link:</p>
        <p style="margin:10px 0 0;font-size:11px;word-break:break-all;color:' . $m['brand'] . ';">' . htmlspecialchars($resetUrl, ENT_QUOTES, 'UTF-8') . '</p>
      </div>
      <p style="margin:0;font-size:12px;color:#64748b;">Didn’t ask for this? Your account is still safe — just ignore this email.</p>';
    $html = email_layout('Reset your password', $inner, 'Reset your Acctventa password — link expires in 30 minutes.');
    $text = "Hi {$name},\n\nReset your password: {$resetUrl}\n\nThis link expires in 30 minutes.\nIf you didn't request this, ignore this email.";
    return ['subject' => 'Reset your Acctventa password', 'html' => $html, 'text' => $text];
}

function email_welcome(string $name): array {
    $m = mail_cfg();
    $safeName = htmlspecialchars($name !== '' ? explode(' ', $name)[0] : 'there', ENT_QUOTES, 'UTF-8');
    $dash = $m['app_url'] . '/dashboard.html';
    $inner = '
      <h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3;color:#fff;font-weight:800;">Welcome to ' . htmlspecialchars($m['app_name'], ENT_QUOTES, 'UTF-8') . '</h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#cbd5e1;">Hey ' . $safeName . ', your account is ready. Browse the marketplace, list products, and trade with escrow protection.</p>
      <div style="text-align:center;margin:28px 0;">' . email_button('Open your dashboard', $dash) . '</div>
      <ul style="margin:0;padding-left:18px;color:#94a3b8;font-size:13px;line-height:1.7;">
        <li>Wallet starts at $0.00 — fund when you’re ready</li>
        <li>Free plan includes daily listing uploads</li>
        <li>Never share your password with anyone</li>
      </ul>';
    $html = email_layout('Welcome to Acctventa', $inner, 'Your Acctventa account is ready.');
    $text = "Welcome to Acctventa, {$name}!\nOpen your dashboard: {$dash}";
    return ['subject' => 'Welcome to Acctventa', 'html' => $html, 'text' => $text];
}

function email_password_changed(string $name): array {
    $safeName = htmlspecialchars($name !== '' ? $name : 'there', ENT_QUOTES, 'UTF-8');
    $inner = '
      <h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3;color:#fff;font-weight:800;">Password updated</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#cbd5e1;">Hi ' . $safeName . ', your Acctventa password was changed successfully. You can sign in with your new password anytime.</p>
      <p style="margin:0;font-size:12px;color:#64748b;">If this wasn’t you, contact support immediately.</p>';
    $html = email_layout('Password updated', $inner, 'Your Acctventa password was changed.');
    return ['subject' => 'Your Acctventa password was changed', 'html' => $html, 'text' => "Hi {$name}, your password was changed. If this wasn't you, contact support."];
}

function email_order_notice(string $name, string $title, string $role, string $amount, string $txid = '', string $releaseNote = ''): array {
    $safeName = htmlspecialchars($name !== '' ? $name : 'there', ENT_QUOTES, 'UTF-8');
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $safeAmount = htmlspecialchars($amount, ENT_QUOTES, 'UTF-8');
    $safeTx = htmlspecialchars($txid, ENT_QUOTES, 'UTF-8');
    $txLine = $safeTx !== ''
        ? '<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#94a3b8;">Transaction ID: <strong style="color:#fff;font-family:monospace;">' . $safeTx . '</strong></p>'
        : '';
    $dash = mail_cfg()['app_url'] . '/dashboard.html#orders' . ($txid !== '' ? '?txid=' . rawurlencode($txid) : '');
    if ($role === 'seller') {
        $headline = 'Congratulations — you made a sale!';
        $body = 'Great news! A buyer just purchased <strong style="color:#fff;">' . $safeTitle . '</strong> for <strong style="color:#0ea5e9;">$' . $safeAmount . '</strong>.';
        if ($releaseNote !== '') {
            $body .= ' ' . htmlspecialchars($releaseNote, ENT_QUOTES, 'UTF-8');
        }
        $subject = '🎉 Sale confirmed · ' . $title . ' · Acctventa';
        $extra = '
      <div style="margin:18px 0;padding:16px;border-radius:14px;background:rgba(14,165,233,0.12);border:1px solid rgba(14,165,233,0.35);">
        <p style="margin:0 0 6px;font-size:12px;font-weight:800;color:#0ea5e9;text-transform:uppercase;letter-spacing:0.04em;">What to do next</p>
        <p style="margin:0;font-size:13px;line-height:1.55;color:#cbd5e1;">Open the order chat inside Acctventa only. Never share WhatsApp or Telegram contacts — off-platform messages are blocked. Deliver login details in chat so the buyer can confirm.</p>
      </div>';
        $btn = email_button('View your sale', $dash);
    } else {
        $headline = 'Purchase confirmed';
        $body = 'Your order for <strong style="color:#fff;">' . $safeTitle . '</strong> (<strong style="color:#0ea5e9;">$' . $safeAmount . '</strong>) is confirmed. Open Orders to view credentials and chat with the seller.';
        $subject = 'Purchase confirmed · ' . $title . ' · Acctventa';
        $extra = '
      <div style="margin:18px 0;padding:16px;border-radius:14px;background:rgba(14,165,233,0.12);border:1px solid rgba(14,165,233,0.35);">
        <p style="margin:0 0 6px;font-size:12px;font-weight:800;color:#0ea5e9;text-transform:uppercase;letter-spacing:0.04em;">Buyer protection</p>
        <p style="margin:0;font-size:13px;line-height:1.55;color:#cbd5e1;">You have <strong style="color:#fff;">60 minutes</strong> to open a dispute if login fails or the seller stops responding. After that, contact Support for warranty review (24h).</p>
      </div>';
        $btn = email_button('Open your order', $dash);
    }
    $inner = '
      <h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3;color:#fff;font-weight:800;">' . $headline . '</h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#cbd5e1;">Hi ' . $safeName . ', ' . $body . '</p>
      ' . $txLine . $extra . '
      <div style="text-align:center;margin:24px 0;">' . $btn . '</div>';
    $html = email_layout($headline, $inner, $headline . ' on Acctventa');
    return ['subject' => $subject, 'html' => $html, 'text' => strip_tags($body) . ($txid !== '' ? ' TXID: ' . $txid : '')];
}

function email_order_status_update(string $name, string $title, string $statusLabel, string $txid = '', string $detail = ''): array {
    $safeName = htmlspecialchars($name !== '' ? $name : 'there', ENT_QUOTES, 'UTF-8');
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $safeStatus = htmlspecialchars($statusLabel, ENT_QUOTES, 'UTF-8');
    $safeTx = htmlspecialchars($txid, ENT_QUOTES, 'UTF-8');
    $safeDetail = htmlspecialchars($detail, ENT_QUOTES, 'UTF-8');
    $dash = mail_cfg()['app_url'] . '/dashboard.html#orders';
    $subject = 'Order update · ' . $statusLabel . ' · ' . $title;
    $inner = '
      <h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3;color:#fff;font-weight:800;">Order update</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#cbd5e1;">Hi ' . $safeName . ', your order <strong style="color:#fff;">' . $safeTitle . '</strong> is now <strong style="color:#0ea5e9;">' . $safeStatus . '</strong>.</p>
      ' . ($safeTx !== '' ? '<p style="margin:0 0 12px;font-size:13px;color:#94a3b8;">TXID: <strong style="color:#fff;font-family:monospace;">' . $safeTx . '</strong></p>' : '') . '
      ' . ($safeDetail !== '' ? '<p style="margin:0 0 18px;font-size:13px;line-height:1.55;color:#cbd5e1;">' . $safeDetail . '</p>' : '') . '
      <div style="text-align:center;margin:24px 0;">' . email_button('View order', $dash) . '</div>';
    $html = email_layout('Order update', $inner, 'Order status: ' . $statusLabel);
    return ['subject' => $subject, 'html' => $html, 'text' => 'Order ' . $title . ' is now ' . $statusLabel . ($txid !== '' ? ' TXID: ' . $txid : '')];
}
