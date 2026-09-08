#!/usr/bin/env bash
# Deploy to production AND re-point the clean domain.
#
# Two gotchas this exists to prevent:
#   1. `vercel --prod` alone fails "Not authorized" on this machine — the CLI defaults
#      to the personal account, so --scope is mandatory.
#   2. eduos.vercel.app is a DEPLOYMENT alias, not a project domain (Vercel does not
#      allow *.vercel.app as a project domain). It stays pinned to whatever deployment
#      it was last set to, so a plain deploy would leave it serving the old build.
set -euo pipefail

SCOPE=abdullah-basims-projects
DOMAIN=eduos.vercel.app

echo "-> deploying..."
RAW=$(npx vercel --prod --yes --scope "$SCOPE" 2>&1)
URL=$(printf '%s' "$RAW" | sed -n 's/.*"url": *"\([^"]*\)".*/\1/p' | head -1 | sed 's#^https\?://##')

if [ -z "$URL" ]; then
  echo "x deploy failed - no URL returned"
  printf '%s\n' "$RAW" | tail -20
  exit 1
fi
echo "-> deployed: https://$URL"

echo "-> pointing $DOMAIN at it..."
npx vercel alias set "$URL" "$DOMAIN" --scope "$SCOPE" >/dev/null
echo "-> live: https://$DOMAIN"

echo "-> verifying..."
node scripts/smoke.mjs "https://$DOMAIN" | tail -3
