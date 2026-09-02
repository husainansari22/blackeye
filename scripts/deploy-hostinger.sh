#!/usr/bin/env bash
# Upload files to acctventa.com public_html via Hostinger TUS API.
set -euo pipefail

TOKEN="${TOKEN:?TOKEN env required}"
USERNAME="${HOSTINGER_USER:-u343769360}"
DOMAIN="${HOSTINGER_DOMAIN:-acctventa.com}"
API_BASE="https://developers.hostinger.com/api/hosting/v1/files/upload-urls"

upload_one() {
  local rel="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    echo "MISSING: $file" >&2
    return 1
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
  url=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['url'])" <<<"$creds")
  auth_key=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['auth_key'])" <<<"$creds")
  rest_auth_key=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['rest_auth_key'])" <<<"$creds")

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
    --data-binary "@${file}"

  if ! grep -qE 'HTTP/[0-9.]+ 204' /tmp/tus-patch.hdr; then
    echo "TUS PATCH failed for $rel" >&2
    head -5 /tmp/tus-patch.hdr >&2
    return 1
  fi
  offset=$(grep -i '^Upload-Offset:' /tmp/tus-patch.hdr | awk '{print $2}' | tr -d '\r')
  if [[ -n "$offset" && "$offset" != "$size" ]]; then
    echo "TUS PATCH offset mismatch ($offset != $size) for $rel" >&2
    return 1
  fi
  echo "OK $rel"

  # Verify file landed (TUS can report success before file is visible)
  local listed
  listed=$(curl -sS -G "https://developers.hostinger.com/api/hosting/v1/accounts/${USERNAME}/domains/${DOMAIN}/files" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Accept: application/json' \
    --data-urlencode "path=/${rel%/*}" 2>/dev/null || true)
  local base="${rel##*/}"
  if [[ "$base" == .* ]]; then
    return 0
  fi
  if ! python3 -c "import json,sys; d=json.load(sys.stdin); names=[i.get('name') for i in d.get('items',[])]; sys.exit(0 if '${base}' in names else 1)" <<<"$listed" 2>/dev/null; then
    echo "WARN: $rel not visible in file listing yet — retrying once" >&2
    sleep 2
    upload_one "$rel" "$file" && return 0
    echo "VERIFY FAILED: $rel missing after upload" >&2
    return 1
  fi
}

ROOT="${1:-/workspace}"
cd "$ROOT"

FILES=(
  "api/marketplace_extras.php"
  "api/support.php"
  "api/index.php"
  "js/staff-inbox.js"
  "js/dashboard-app.js"
  "dashboard.html"
  "owner/index.php"
  "css/admin-app.css"
)

for rel in "${FILES[@]}"; do
  upload_one "$rel" "$ROOT/$rel"
done

echo "Deploy complete."
