#!/usr/bin/env bash
# Upload AcctSuite public files to Hostinger (acctsuite.com only).
# SAFETY: never deploy to acctventa.com
set -euo pipefail

TOKEN="${TOKEN:?TOKEN env required}"
USERNAME="${HOSTINGER_USER:-u343769360}"
DOMAIN="${HOSTINGER_DOMAIN:-acctsuite.com}"
if [[ "${DOMAIN}" == "acctventa.com" || "${HOSTINGER_DOMAIN:-}" == "acctventa.com" ]]; then
  echo "REFUSING to deploy to acctventa.com" >&2
  exit 1
fi

API_BASE="https://developers.hostinger.com/api/hosting/v1/files/upload-urls"
ROOT="${1:-/workspace/acctsuite}"
cd "$ROOT"

upload_one() {
  local rel="$1"
  local file="$ROOT/$rel"
  if [[ ! -f "$file" ]]; then
    echo "SKIP missing: $rel" >&2
    return 0
  fi
  local size
  size=$(stat -c%s "$file")
  echo "==> Uploading $rel ($size bytes)"

  local creds url auth_key rest_auth_key
  creds=$(curl -sS -X POST "$API_BASE" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -d "{\"username\":\"${USERNAME}\",\"domain\":\"${DOMAIN}\"}")
  url=$(python3 -c "import json,sys; print(json.load(sys.stdin)['url'])" <<<"$creds")
  auth_key=$(python3 -c "import json,sys; print(json.load(sys.stdin)['auth_key'])" <<<"$creds")
  rest_auth_key=$(python3 -c "import json,sys; print(json.load(sys.stdin)['rest_auth_key'])" <<<"$creds")

  local target="${url}/${rel}?override=true"
  curl -sS -D /tmp/tus-post.hdr -o /dev/null -X POST "$target" \
    -H "X-Auth: ${auth_key}" \
    -H "X-Auth-Rest: ${rest_auth_key}" \
    -H 'Tus-Resumable: 1.0.0' \
    -H "Upload-Length: ${size}" \
    -H 'Upload-Offset: 0'
  if ! grep -qE 'HTTP/[0-9.]+ 201' /tmp/tus-post.hdr; then
    echo "TUS POST failed for $rel" >&2
    head -5 /tmp/tus-post.hdr >&2
    return 1
  fi

  curl -sS -D /tmp/tus-patch.hdr -o /dev/null -X PATCH "$target" \
    -H "X-Auth: ${auth_key}" \
    -H "X-Auth-Rest: ${rest_auth_key}" \
    -H 'Tus-Resumable: 1.0.0' \
    -H 'Content-Type: application/offset+octet-stream' \
    -H 'Upload-Offset: 0' \
    --data-binary @"$file"
  if ! grep -qE 'HTTP/[0-9.]+ 204' /tmp/tus-patch.hdr; then
    echo "TUS PATCH failed for $rel" >&2
    head -5 /tmp/tus-patch.hdr >&2
    return 1
  fi
  echo "OK $rel"
}

BUMP="bagA4fix"

FILES=(
  "site.webmanifest"
  "index.html"
  "dashboard.html"
  "listing.html"
  "marketplace.html"
  "seller.html"
  "sell.html"
  "company.html"
  "privacy.html"
  "terms.html"
  "guidelines.html"
  "reset.html"
  "wallet-return.html"
  "owner-login-as.html"
  "apple-touch-icon.png"
  "apple-touch-icon-precomposed.png"
  "apple-touch-icon-180x180.png"
  "favicon.ico"
  "favicon.svg"
  "favicon-16x16.png"
  "favicon-32x32.png"
  "favicon-48.png"
  "favicon-48x48.png"
  "favicon-96x96.png"
  "css/tailwind.css"
  "css/admin-app.css"
  "css/profile.css"
  "css/kyc.css"
  "css/legal.css"
  "css/ui-toast.css"
  "css/mobile-form.css"
  "js/theme-init.js"
  "js/marketplace-catalog.js"
  "js/acctsuite.js"
  "js/api-client.js"
  "js/api-sync.js"
  "js/kyc-app.js"
  "js/av-confirm.js"
  "js/commerce-ui.js"
  "js/listing-modal.js"
  "js/dashboard-app.js"
  "js/ui-toast.js"
  "js/mobile-form.js"
  "js/staff-alerts.js"
  "js/staff-inbox.js"
  "img/brand/logo-mark-violet.svg"
  "img/brand/logo-bag.svg"
  "img/brand/icon-192.png"
  "img/brand/icon-512.png"
  "admin/index.html"
  "auth/login/index.html"
  "auth/sign-in/index.html"
  "auth/sign-up/index.html"
  "login/index.html"
  "register/index.html"
  "signup/index.html"
  "browse/index.html"
  "user/login/index.html"
  "user/sign-in/index.html"
  "user/sign-up/index.html"
  "user/signup/index.html"
  "user/register/index.html"
  "api/index.php"
  "api/bootstrap.php"
  "api/marketplace_extras.php"
  "api/commerce_features.php"
  "api/mail.php"
  "api/flutterwave.php"
  "api/install.php"
  "api/schema.sql"
  "owner/index.php"
)

# Cache-bust asset query strings in HTML
python3 - <<PY
from pathlib import Path
import re
bump = "$BUMP"
root = Path("$ROOT")
for p in root.rglob("*.html"):
    if "node_modules" in p.parts:
        continue
    t = p.read_text(encoding="utf-8")
    t2 = re.sub(r"(\\.(?:js|css)\\?v=)[^\"&\\s]+", r"\\1" + bump, t)
    t2 = re.sub(r"(logo-mark-violet\\.svg\\?v=)[^\"&\\s]+", r"\\1" + bump, t2)
    if t2 != t:
        p.write_text(t2, encoding="utf-8")
        print("bumped", p.relative_to(root))
PY

fail=0
for rel in "${FILES[@]}"; do
  upload_one "$rel" || fail=$((fail+1))
done

echo "Deploy finished. failures=$fail"
exit "$fail"
