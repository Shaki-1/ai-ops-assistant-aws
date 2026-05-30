#!/bin/bash

set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 /path/to/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz"
  exit 1
fi

ARCHIVE="$1"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/ai-ops-laura-new.pem}"
SSH_USER="${SSH_USER:-ec2-user}"

if [ ! -f "$ARCHIVE" ]; then
  echo "Archive not found: $ARCHIVE"
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY"
  echo "Set SSH_KEY=/path/to/key if your key is elsewhere."
  exit 1
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform command not found."
  exit 1
fi

EC2_HOST=$(terraform output -raw ec2_public_ip 2>/dev/null || true)

if [ -z "$EC2_HOST" ]; then
  echo "Could not read EC2 public IP from terraform output ec2_public_ip."
  exit 1
fi

ARCHIVE_NAME=$(basename "$ARCHIVE")
REMOTE_ARCHIVE="/home/$SSH_USER/$ARCHIVE_NAME"

echo "Copying $ARCHIVE to $SSH_USER@$EC2_HOST:$REMOTE_ARCHIVE"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$ARCHIVE" "$SSH_USER@$EC2_HOST:$REMOTE_ARCHIVE"

echo "Waiting for application scripts on EC2."
for attempt in $(seq 1 30); do
  if ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$SSH_USER@$EC2_HOST" "test -f /home/ec2-user/ai-ops-assistant-aws/scripts/import_app_data.sh" >/dev/null 2>&1; then
    echo "Application restore script is available."
    break
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "Application restore script did not become available. Cloud-init may still be running or failed."
    exit 1
  fi

  echo "Application restore script not ready yet, attempt $attempt."
  sleep 10
done

echo "Importing app data and restarting backend on EC2."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$EC2_HOST" "
  set -e
  cd /home/ec2-user/ai-ops-assistant-aws
  chmod +x ./scripts/import_app_data.sh ./scripts/restore_app_data.sh
  ./scripts/import_app_data.sh '$REMOTE_ARCHIVE'
  pm2 restart ai-ops-backend --update-env
  pm2 status
"

echo "App data restore completed for $EC2_HOST."
