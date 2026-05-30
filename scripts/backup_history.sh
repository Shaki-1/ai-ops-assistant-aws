#!/bin/bash

set -euo pipefail

APP_DIR="${APP_DIR:-/home/ec2-user/ai-ops-assistant-aws}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/ec2-user/backups}"
BACKUP_DIR="$BACKUP_ROOT/app-data"
TMP_DIR=$(mktemp -d)
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
ARCHIVE="$BACKUP_DIR/ai_ops_app_data_$TIMESTAMP.tar.gz"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
mkdir -p "$TMP_DIR/backend/data"

copy_if_exists() {
  local source_file="$1"
  local target_file="$2"

  if [ -f "$source_file" ]; then
    mkdir -p "$(dirname "$target_file")"
    cp "$source_file" "$target_file"
    echo "Included $(basename "$source_file")"
  else
    echo "Skipped missing $(basename "$source_file")"
  fi
}

copy_if_exists "$APP_DIR/backend/data/tickets.json" "$TMP_DIR/backend/data/tickets.json"
copy_if_exists "$APP_DIR/backend/data/timeline.json" "$TMP_DIR/backend/data/timeline.json"
copy_if_exists "$APP_DIR/backend/data/ai_ops.db" "$TMP_DIR/backend/data/ai_ops.db"
copy_if_exists "$APP_DIR/backend/data/ai_ops.db-wal" "$TMP_DIR/backend/data/ai_ops.db-wal"
copy_if_exists "$APP_DIR/backend/data/ai_ops.db-shm" "$TMP_DIR/backend/data/ai_ops.db-shm"
copy_if_exists "$APP_DIR/backend/history.json" "$TMP_DIR/backend/history.json"

if find "$TMP_DIR" -type f | grep -q .; then
  tar -czf "$ARCHIVE" -C "$TMP_DIR" .
  echo "App data backup created: $ARCHIVE"
else
  echo "No app data files found to back up."
fi

find "$BACKUP_DIR" -name "ai_ops_app_data_*.tar.gz" -type f | sort | head -n -20 | xargs -r rm -f

cat <<'NOTE'
Note: /home/ec2-user/backups is local to this EC2 instance. Terraform destroy deletes it.
Copy archives off the instance before destroy for real persistence, for example:
scp ec2-user@YOUR_HOST:/home/ec2-user/backups/app-data/ai_ops_app_data_*.tar.gz .
NOTE
