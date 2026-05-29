#!/bin/bash

set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 /path/to/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz"
  exit 1
fi

ARCHIVE="$1"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa_level3}"
SSH_USER="${SSH_USER:-ec2-user}"

if [ ! -f "$ARCHIVE" ]; then
  echo "Archive not found: $ARCHIVE"
  exit 1
fi

echo "Running terraform apply."
terraform apply

echo "Waiting for EC2 public IP from terraform output."
EC2_HOST=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  EC2_HOST=$(terraform output -raw ec2_public_ip 2>/dev/null || true)
  if [ -n "$EC2_HOST" ]; then
    break
  fi
  echo "EC2 IP not available yet, attempt $attempt."
  sleep 10
done

if [ -z "$EC2_HOST" ]; then
  echo "Could not read EC2 public IP from terraform output ec2_public_ip."
  exit 1
fi

echo "Waiting for SSH on $EC2_HOST."
for attempt in $(seq 1 30); do
  if ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$SSH_USER@$EC2_HOST" "echo ssh-ready" >/dev/null 2>&1; then
    echo "SSH is reachable."
    break
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "SSH did not become reachable."
    exit 1
  fi

  echo "SSH not ready yet, attempt $attempt."
  sleep 10
done

"$(dirname "$0")/push_restore_app_data.sh" "$ARCHIVE"

echo "Restore workflow complete."
echo "App URL: http://$EC2_HOST"
