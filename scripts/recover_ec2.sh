#!/bin/bash

# AI Ops Assistant — EC2 Recovery Script
# Run this from your local WSL terminal inside the Terraform project folder.
# It checks the EC2 state, refreshes the public DNS, tests ports, and optionally reboots the instance.

set -e

echo "=== AI Ops Assistant EC2 Recovery Helper ==="

PROJECT_DIR="/mnt/c/Users/User/Documents/APL-Instruktioner/Instruction/Groupwork/AI-applikation/ai-ops-assistant"
MY_SSH="${SSH_KEY:-$HOME/.ssh/ai-ops-laura-new.pem}"

if [ -d "$PROJECT_DIR" ]; then
  cd "$PROJECT_DIR"
else
  echo "Project directory not found:"
  echo "$PROJECT_DIR"
  echo "Edit PROJECT_DIR inside this script if your path changed."
  exit 1
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform command not found."
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws command not found."
  exit 1
fi

echo "Getting instance ID from Terraform state..."
MY_INSTANCE_ID=$(terraform state show aws_instance.ai_ops_assistant 2>/dev/null | grep '^id' | awk '{print $3}' | tr -d '"')

if [ -z "$MY_INSTANCE_ID" ]; then
  echo "Could not find instance ID from Terraform state."
  echo "Try: terraform output"
  exit 1
fi

echo "Instance ID: $MY_INSTANCE_ID"

echo "Checking instance state..."
aws ec2 describe-instances   --instance-ids "$MY_INSTANCE_ID"   --query "Reservations[].Instances[].{State:State.Name,PublicDNS:PublicDnsName,PublicIP:PublicIpAddress}"   --output table

MY_EC2=$(aws ec2 describe-instances   --instance-ids "$MY_INSTANCE_ID"   --query "Reservations[].Instances[].PublicDnsName"   --output text)

echo "Current DNS: $MY_EC2"

echo ""
echo "Testing ports..."
echo "SSH port 22:"
nc -vz "$MY_EC2" 22 || true

echo ""
echo "HTTP port 80:"
nc -vz "$MY_EC2" 80 || true

echo ""
echo "Choose an action:"
echo "1) Try SSH now"
echo "2) Reboot EC2"
echo "3) Stop/start EC2"
echo "4) Only print recovery commands"
echo "5) Exit"
read -rp "Enter choice [1-5]: " choice

case "$choice" in
  1)
    echo "Connecting with SSH..."
    ssh -o ConnectTimeout=20 -i "$MY_SSH" ec2-user@"$MY_EC2"
    ;;
  2)
    echo "Rebooting EC2..."
    aws ec2 reboot-instances --instance-ids "$MY_INSTANCE_ID"
    echo "Reboot sent. Wait 1-2 minutes, then rerun this script or SSH manually:"
    echo "ssh -i "$MY_SSH" ec2-user@"$MY_EC2""
    ;;
  3)
    echo "Stopping EC2..."
    aws ec2 stop-instances --instance-ids "$MY_INSTANCE_ID"
    aws ec2 wait instance-stopped --instance-ids "$MY_INSTANCE_ID"

    echo "Starting EC2..."
    aws ec2 start-instances --instance-ids "$MY_INSTANCE_ID"
    aws ec2 wait instance-running --instance-ids "$MY_INSTANCE_ID"

    MY_EC2=$(aws ec2 describe-instances       --instance-ids "$MY_INSTANCE_ID"       --query "Reservations[].Instances[].PublicDnsName"       --output text)

    echo "New DNS: $MY_EC2"
    echo "Try SSH:"
    echo "ssh -i "$MY_SSH" ec2-user@"$MY_EC2""
    ;;
  4)
    cat <<'CMDS'

After SSH into EC2, run:

sudo systemctl stop ollama
sudo systemctl disable ollama
sudo pkill -f ollama

df -h
free -h

sudo systemctl restart nginx
sudo systemctl status nginx

cd /home/ec2-user/ai-ops-assistant-aws/backend
pm2 restart ai-ops-backend --update-env || pm2 start server.js --name ai-ops-backend
pm2 save
pm2 status

curl http://localhost
curl http://localhost/api/status

CMDS
    ;;
  5)
    echo "Exiting."
    ;;
  *)
    echo "Invalid choice."
    exit 1
    ;;
esac
