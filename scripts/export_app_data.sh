#!/bin/bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKUP_ROOT="${BACKUP_ROOT:-$APP_DIR/backups}"

APP_DIR="$APP_DIR" BACKUP_ROOT="$BACKUP_ROOT" "$SCRIPT_DIR/backup_history.sh"

echo "Export archives are in: $BACKUP_ROOT/app-data"
echo "Copy the newest archive somewhere outside EC2 before terraform destroy."
