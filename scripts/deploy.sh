#!/usr/bin/env bash
# Deploy to production AND re-point the clean domain.
#
# Two gotchas this exists to prevent:
#   1. `vercel --prod` alone fails with "Not authorized" on this machine — the CLI
#      defaults to the personal account, so --scope is mandatory.
#   2. eduos.vercel.app is a DEPLOYMENT alias, not a project domain (Vercel does not
#      allow *.vercel.app as a project domain). It therefore stays pinned to whatever
#      deployment it was last set to — a plain deploy would leave it on the old build.
set -euo pipefail

SCOPE=abdullah-basims-projects
DOMAIN=eduos.vercel.app

echo "→ deploying..."
URL=$(npx vercel --prod --yes --scope "$SCOPE" 2>&1 | python3 -c "import sys,json,re
t=sys.stdin.read()
m=re.search(r'\"url\":\s*\"([^\"]+)\"', t)
print(re.sub(r"^https?://", "", m.group(1)) if m else "")

[ -z "$URL" ] && { echo "✗ deploy failed — no URL returned"; exit 1; }
echo "→ deployed: https://$URL"

echo "→ pointing $DOMAIN at it..."
npx vercel alias set "$URL" "$DOMAIN" --scope "$SCOPE" >/dev/null
echo "→ live: https://$DOMAIN"

echo "→ verifying..."
node scripts/smoke.mjs "https://$DOMAIN" | tail -3
