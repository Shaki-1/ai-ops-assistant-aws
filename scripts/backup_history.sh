#!/bin/bash

set -e

APP_DIR="/home/ec2-user/ai-ops-assistant-aws"
HISTORY_FILE="$APP_DIR/backend/history.json"
BACKUP_DIR="$APP_DIR/backups/history"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$HISTORY_FILE" ]; then
  echo "No history.json file found. Nothing to back up."
  exit 0
fi

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/history_$TIMESTAMP.json.gz"

gzip -c "$HISTORY_FILE" > "$BACKUP_FILE"

echo "History backup created: $BACKUP_FILE"
