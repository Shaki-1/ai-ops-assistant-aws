#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
NODE_BIN="${NODE_BIN:-node}"

cd "$ROOT_DIR"

echo "== Required files =="
test -f backend/server.js
test -f frontend/app.js
test -f backend/package.json
test -f .github/workflows/deploy.yml
test -f scripts/backup_history.sh
test -f scripts/restore_app_data.sh
echo "Required files found."

echo "== Syntax checks =="
"$NODE_BIN" --check backend/server.js
"$NODE_BIN" --check frontend/app.js

echo "== Dependency checks =="
grep -q '"ws"' backend/package.json && echo "ws dependency present."
if [ -d backend/node_modules ]; then
  echo "backend/node_modules present."
else
  echo "backend/node_modules not present; run npm install in backend before runtime tests."
fi

echo "== Secret hygiene checks =="
if git ls-files | grep -E '(^|/)\\.env$|backend/\\.env|terraform\\.tfstate|terraform\\.tfvars|\\.pem$|node_modules|backups/' >/dev/null; then
  echo "Tracked sensitive/runtime files detected:"
  git ls-files | grep -E '(^|/)\\.env$|backend/\\.env|terraform\\.tfstate|terraform\\.tfvars|\\.pem$|node_modules|backups/' || true
  exit 1
fi
echo "No obvious tracked .env/state/key/runtime files found."

echo "== Script checks =="
for script in scripts/backup_history.sh scripts/restore_app_data.sh scripts/export_app_data.sh scripts/import_app_data.sh scripts/diagnose_deploy.sh; do
  test -f "$script"
  echo "Found $script"
done

if command -v npm >/dev/null 2>&1 && [ -f backend/package.json ]; then
  echo "== npm audit --omit=dev =="
  (cd backend && npm audit --omit=dev) || true
else
  echo "npm not available; skipping npm audit."
fi

echo "Local health check complete."
