#!/usr/bin/env bash
# Publish the static build to GitHub Pages (branch gh-pages). Synthetic data only.
# Usage (once the repo exists on GitHub):  bash scripts/deploy-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run zip
npm run build
touch dist/.nojekyll
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -R dist/. "$TMP"
cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git commit -qm "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -f "$REMOTE" gh-pages
echo "Pushed. Enable Pages (branch gh-pages) in the repo settings if not yet on."
