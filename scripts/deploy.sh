#!/usr/bin/env bash
# Deploy to production safely: build → smoke the NEW deployment on its own URL → only then
# promote it and re-point the clean domain. A failing build never reaches users.
#
# Gotchas this exists to prevent:
#   1. The CLI defaults to the personal account, so --scope is mandatory.
#   2. eduos.vercel.app is a DEPLOYMENT alias, not a project domain (Vercel does not allow
#      *.vercel.app as a project domain). It stays pinned to whatever deployment it was last
#      set to, so a plain deploy would leave it serving the old build.
#   3. `--prod` alone promotes immediately. `--skip-domain` builds a production deployment
#      without assigning domains, so it can be verified first.
set -euo pipefail

SCOPE=abdullah-basims-projects
DOMAIN=eduos.vercel.app
VERCEL="$(command -v vercel || echo 'npx vercel')"

PREVIOUS=$($VERCEL inspect "$DOMAIN" --scope "$SCOPE" 2>&1 | sed -n 's/.*url[[:space:]]*\(https:\/\/[^[:space:]]*\).*/\1/p' | head -1)
echo "-> rollback target (currently live): ${PREVIOUS:-unknown}"

echo "-> building production deployment (not yet promoted)..."
RAW=$($VERCEL deploy --prod --skip-domain --yes --scope "$SCOPE" 2>&1)
URL=$(printf '%s\n' "$RAW" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | grep -v "$DOMAIN" | tail -1)

if [ -z "$URL" ]; then
  echo "x deploy failed - no URL returned"
  printf '%s\n' "$RAW" | tail -20
  exit 1
fi
echo "-> built: $URL"

echo "-> smoke-testing the new deployment before anyone sees it..."
if ! node scripts/smoke.mjs "$URL" | tail -3; then
  echo "x smoke FAILED on $URL — nothing was promoted; $DOMAIN still serves ${PREVIOUS:-the previous build}"
  exit 1
fi

echo "-> promoting and pointing $DOMAIN at it..."
$VERCEL promote "$URL" --yes --scope "$SCOPE" >/dev/null
$VERCEL alias set "$URL" "$DOMAIN" --scope "$SCOPE" >/dev/null
echo "-> live: https://$DOMAIN"
echo "-> rollback: $VERCEL promote ${PREVIOUS:-<previous-url>} --scope $SCOPE && $VERCEL alias set ${PREVIOUS:-<previous-url>} $DOMAIN --scope $SCOPE"
