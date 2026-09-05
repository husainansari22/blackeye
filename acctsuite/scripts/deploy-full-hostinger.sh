#!/usr/bin/env bash
# Full recursive deploy of acctsuite public files to Hostinger (acctsuite.com only).
set -euo pipefail
TOKEN="${TOKEN:?TOKEN env required}"
USERNAME="${HOSTINGER_USER:-u343769360}"
DOMAIN="${HOSTINGER_DOMAIN:-acctsuite.com}"
if [[ "${DOMAIN}" == "acctventa.com" ]]; then echo "REFUSING acctventa.com"; exit 1; fi
ROOT="${1:-/workspace/acctsuite}"
API_BASE="https://developers.hostinger.com/api/hosting/v1/files/upload-urls"
cd "$ROOT"

upload_one() {
  local rel="$1"
  local file="$ROOT/$rel"
  [[ -f "$file" ]] || return 0
  local size; size=$(stat -c%s "$file")
  echo "==> $rel ($size)"
  local creds url ak rk
  creds=$(curl -sS -X POST "$API_BASE" -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "{\"username\":\"${USERNAME}\",\"domain\":\"${DOMAIN}\"}")
  url=$(python3 -c "import json,sys; print(json.load(sys.stdin)['url'])" <<<"$creds")
  ak=$(python3 -c "import json,sys; print(json.load(sys.stdin)['auth_key'])" <<<"$creds")
  rk=$(python3 -c "import json,sys; print(json.load(sys.stdin)['rest_auth_key'])" <<<"$creds")
  local target="${url}/${rel}?override=true"
  curl -sS -D /tmp/tus-post.hdr -o /dev/null -X POST "$target" \
    -H "X-Auth: ${ak}" -H "X-Auth-Rest: ${rk}" -H 'Tus-Resumable: 1.0.0' \
    -H "Upload-Length: ${size}" -H 'Upload-Offset: 0'
  grep -qE 'HTTP/[0-9.]+ 201' /tmp/tus-post.hdr || { echo FAIL_POST "$rel"; return 1; }
  curl -sS -D /tmp/tus-patch.hdr -o /dev/null -X PATCH "$target" \
    -H "X-Auth: ${ak}" -H "X-Auth-Rest: ${rk}" -H 'Tus-Resumable: 1.0.0' \
    -H 'Content-Type: application/offset+octet-stream' -H 'Upload-Offset: 0' \
    --data-binary @"$file"
  grep -qE 'HTTP/[0-9.]+ 204' /tmp/tus-patch.hdr || { echo FAIL_PATCH "$rel"; return 1; }
}

# Collect deployable files (skip node_modules, git, secrets)
mapfile -t FILES < <(find . -type f \
  ! -path './node_modules/*' \
  ! -path './.git/*' \
  ! -name 'config.php' \
  ! -name '.DS_Store' \
  ! -name '*.map' \
  ! -path './scripts/*' \
  ! -path './tools/*' \
  | sed 's|^\./||' | sort)

echo "Uploading ${#FILES[@]} files..."
fail=0
for rel in "${FILES[@]}"; do
  upload_one "$rel" || fail=$((fail+1))
done
echo "Done. failures=$fail"
