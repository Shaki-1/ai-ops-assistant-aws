#!/bin/bash

set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 /path/to/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz"
  exit 1
fi

ARCHIVE="$1"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKUP_ROOT="${BACKUP_ROOT:-$APP_DIR/backups}"
BACKUP_DIR="$BACKUP_ROOT/app-data"

if [ ! -f "$ARCHIVE" ]; then
  echo "Archive not found: $ARCHIVE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
cp "$ARCHIVE" "$BACKUP_DIR/"

APP_DIR="$APP_DIR" BACKUP_ROOT="$BACKUP_ROOT" "$SCRIPT_DIR/restore_app_data.sh"

echo "Imported and restored app data from: $ARCHIVE"
