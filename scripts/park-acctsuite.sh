#!/usr/bin/env bash
# Park acctsuite.com as static-only on the shared Hostinger plan.
# Prevents PHP there from starving Acctventa of LVE workers.
set -euo pipefail

TOKEN="${TOKEN:?TOKEN env required}"
USERNAME="${HOSTINGER_USER:-u343769360}"
DOMAIN="${HOSTINGER_DOMAIN:-acctsuite.com}"
API_BASE="https://developers.hostinger.com/api/hosting/v1/files/upload-urls"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$DOMAIN" != "acctsuite.com" && "${HOSTINGER_ALLOW_FOREIGN_DOMAIN:-}" != "1" ]]; then
  echo "REFUSING: park script is for acctsuite.com only (got $DOMAIN)" >&2
  exit 2
fi

cat >"$TMP/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Acctsuite — Coming soon</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 20% 0%, #16324a, #0b1220 55%, #070b12);
      color: #e8eef6;
    }
    main { text-align: center; padding: 2rem; max-width: 32rem; }
    h1 { font-size: clamp(1.8rem, 6vw, 2.6rem); letter-spacing: -0.03em; margin: 0 0 .6rem; }
    p { margin: 0; color: #9db0c7; line-height: 1.5; }
    .brand { color: #5ec8ff; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1><span class="brand">Acctsuite</span></h1>
    <p>Parked on static hosting so it cannot overload Acctventa on the shared server. The full app will launch on its own Hostinger plan.</p>
  </main>
</body>
</html>
HTML

cat >"$TMP/.htaccess" <<'HTA'
# Static park only — block PHP so this addon domain cannot burn shared LVE workers.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule \.php$ - [F,L]
</IfModule>
<FilesMatch "\.php$">
  Require all denied
</FilesMatch>
RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8
RemoveType .php .phtml .php3 .php4 .php5 .php7 .php8
DirectoryIndex index.html
HTA

cat >"$TMP/stub.php" <<'PHP'
<?php
http_response_code(503);
header('Content-Type: text/plain; charset=utf-8');
header('Retry-After: 3600');
echo "Acctsuite PHP is disabled on this shared host to protect Acctventa.\n";
exit;
PHP

upload_one() {
  local rel="$1" file="$2" size creds url auth_key rest_auth_key target
  size=$(stat -c%s "$file")
  echo "==> Uploading $rel ($size bytes)"
  creds=$(curl -sS -X POST "$API_BASE" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -d "{\"username\":\"${USERNAME}\",\"domain\":\"${DOMAIN}\"}")
  url=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['url'])" <<<"$creds")
  auth_key=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['auth_key'])" <<<"$creds")
  rest_auth_key=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['rest_auth_key'])" <<<"$creds")
  target="${url}/${rel}?override=true"
  curl -sS -D /tmp/tus-post.hdr -o /dev/null -X POST "$target" \
    -H "X-Auth: ${auth_key}" -H "X-Auth-Rest: ${rest_auth_key}" \
    -H 'Tus-Resumable: 1.0.0' -H "Upload-Length: ${size}" -H 'Upload-Offset: 0'
  curl -sS -D /tmp/tus-patch.hdr -o /dev/null -X PATCH "$target" \
    -H "X-Auth: ${auth_key}" -H "X-Auth-Rest: ${rest_auth_key}" \
    -H 'Tus-Resumable: 1.0.0' -H 'Content-Type: application/offset+octet-stream' \
    -H 'Upload-Offset: 0' --data-binary @"$file"
  grep -qE 'HTTP/[0-9.]+ 204' /tmp/tus-patch.hdr || { echo "PATCH failed for $rel" >&2; return 1; }
  echo "OK $rel"
}

upload_one "index.html" "$TMP/index.html"
upload_one ".htaccess" "$TMP/.htaccess"

curl -sS -G "https://developers.hostinger.com/api/hosting/v1/accounts/${USERNAME}/domains/${DOMAIN}/files" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Accept: application/json' \
  --data-urlencode "path=/" -o "$TMP/files.json" || true

python3 - <<PY >"$TMP/php_list.txt"
import json
try:
  d=json.load(open("$TMP/files.json"))
except Exception:
  raise SystemExit
for i in d.get("items",[]):
  p=i.get("path") or ""
  if p.endswith(".php"):
    print(p)
PY

while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  upload_one "$rel" "$TMP/stub.php" || true
done <"$TMP/php_list.txt"

curl -sS -X DELETE \
  -H "Authorization: Bearer ${TOKEN}" -H 'Accept: application/json' \
  "https://developers.hostinger.com/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/cache/clear" >/dev/null || true

echo "Acctsuite parked (static only)."
