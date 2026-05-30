#!/bin/bash

set -euo pipefail

APP_DIR="${APP_DIR:-/home/ec2-user/ai-ops-assistant-aws}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/ec2-user/backups}"
BACKUP_DIR="$BACKUP_ROOT/app-data"
DATA_DIR="$APP_DIR/backend/data"
HISTORY_FILE="$APP_DIR/backend/history.json"
DB_FILE="$DATA_DIR/ai_ops.db"

mkdir -p "$DATA_DIR"

LATEST_ARCHIVE=""
if [ -d "$BACKUP_DIR" ]; then
  LATEST_ARCHIVE=$(find "$BACKUP_DIR" -name "ai_ops_app_data_*.tar.gz" -type f | sort | tail -n 1)
fi

if [ -n "$LATEST_ARCHIVE" ]; then
  echo "Restoring app data from $LATEST_ARCHIVE"
  tar -xzf "$LATEST_ARCHIVE" -C "$APP_DIR"
else
  echo "No app data backup archive found. Creating default data files."
fi

[ -f "$DATA_DIR/tickets.json" ] || printf '[]\n' > "$DATA_DIR/tickets.json"
[ -f "$DATA_DIR/timeline.json" ] || printf '[]\n' > "$DATA_DIR/timeline.json"
[ -f "$HISTORY_FILE" ] || printf '[]\n' > "$HISTORY_FILE"

if [ -f "$DB_FILE" ]; then
  echo "SQLite app database is present: $DB_FILE"
else
  echo "SQLite app database not found. The backend will create it on next startup and migrate JSON files if present."
fi

if [ "$(id -u)" -eq 0 ] && id ec2-user >/dev/null 2>&1; then
  chown -R ec2-user:ec2-user "$APP_DIR/backend/data" "$HISTORY_FILE"
fi

echo "App data restore/default initialization complete."
cat <<'NOTE'
Reminder: EC2-local backups do not survive terraform destroy.
For real persistence, export/copy the archive outside EC2 before destroy and import it after apply.
NOTE
