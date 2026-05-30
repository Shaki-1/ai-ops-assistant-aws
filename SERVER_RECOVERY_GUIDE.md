# AI Ops Assistant — EC2 Recovery Guide

This guide is for recovering the AWS EC2 server when the website becomes unreachable, SSH hangs, or the backend/frontend stops working.

## Main problem discovered

The `t3.micro` instance is too small for running Ollama reliably.

`t3.micro` is fine for:
- Nginx
- Node.js backend
- static frontend
- PM2

But it is not stable for:
- Ollama
- local LLM inference
- model downloads
- running AI model + web app at the same time

Common symptoms:
- SSH hangs
- website times out
- Nginx stops responding
- backend restarts
- website falls back to demo/mock mode
- disk becomes too full
- CPU/RAM usage becomes too high

## Quick recovery steps

Run these commands from your local WSL terminal inside the Terraform project folder.

### 1. Set local variables

```bash
cd "/mnt/c/Users/User/Documents/APL-Instruktioner/Instruction/Groupwork/AI-applikation/ai-ops-assistant"

MY_SSH="$HOME/.ssh/ai-ops-laura-new.pem"
MY_INSTANCE_ID=$(terraform state show aws_instance.ai_ops_assistant | grep '^id' | awk '{print $3}' | tr -d '"')
MY_EC2=$(aws ec2 describe-instances   --instance-ids "$MY_INSTANCE_ID"   --query "Reservations[].Instances[].PublicDnsName"   --output text)

echo "$MY_INSTANCE_ID"
echo "$MY_EC2"
```

### 2. Check if ports are reachable

```bash
nc -vz "$MY_EC2" 22
nc -vz "$MY_EC2" 80
```

Meaning:

```text
Port 22 works = SSH should be possible
Port 80 works = website should be reachable
Port 80 refused = Nginx is probably stopped
Port 22 hangs = EC2 may be overloaded
```

### 3. Reboot EC2 if SSH hangs

```bash
aws ec2 reboot-instances --instance-ids "$MY_INSTANCE_ID"
```

Wait 1–2 minutes.

### 4. If reboot is not enough, stop/start EC2

```bash
aws ec2 stop-instances --instance-ids "$MY_INSTANCE_ID"
aws ec2 wait instance-stopped --instance-ids "$MY_INSTANCE_ID"
aws ec2 start-instances --instance-ids "$MY_INSTANCE_ID"
aws ec2 wait instance-running --instance-ids "$MY_INSTANCE_ID"
```

After stop/start, refresh the DNS:

```bash
MY_EC2=$(aws ec2 describe-instances   --instance-ids "$MY_INSTANCE_ID"   --query "Reservations[].Instances[].PublicDnsName"   --output text)

echo "$MY_EC2"
```

### 5. SSH into the server

```bash
ssh -i "$MY_SSH" ec2-user@"$MY_EC2"
```

## Commands to run inside EC2

### 1. Disable Ollama for stability

```bash
sudo systemctl stop ollama
sudo systemctl disable ollama
sudo pkill -f ollama
```

### 2. Check disk and memory

```bash
df -h
free -h
```

If disk is almost full, remove Ollama model files:

```bash
sudo rm -rf /usr/share/ollama/.ollama/models
```

### 3. Restart Nginx

```bash
sudo systemctl restart nginx
sudo systemctl status nginx
```

### 4. Restart backend

```bash
cd /home/ec2-user/ai-ops-assistant-aws/backend

pm2 restart ai-ops-backend --update-env || pm2 start server.js --name ai-ops-backend

pm2 save
pm2 status
```

### 5. Test locally on EC2

```bash
curl http://localhost
curl http://localhost/api/status
```

Expected API result:

```text
"appStatus":"OK"
```

## If the website shows 502 Bad Gateway

This means Nginx is running but the backend is not responding.

Fix:

```bash
cd /home/ec2-user/ai-ops-assistant-aws/backend
pm2 restart ai-ops-backend --update-env || pm2 start server.js --name ai-ops-backend
curl http://localhost/api/status
```

## If the website shows 500 Internal Server Error

Check Nginx permissions and logs:

```bash
sudo tail -n 50 /var/log/nginx/error.log
```

If you see permission errors for `/home/ec2-user/.../frontend`, copy frontend files to Nginx public folder:

```bash
cd /home/ec2-user/ai-ops-assistant-aws
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r frontend/* /usr/share/nginx/html/
sudo systemctl restart nginx
```

## If demo mode appears again

Check backend environment:

```bash
cd /home/ec2-user/ai-ops-assistant-aws/backend
cat .env
```

For stable `t3.micro`, use demo mode or external API. For Ollama mode, the file should be:

```env
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
PORT=3000
```

But remember: Ollama can make `t3.micro` unstable.

## Recommended stable choice for t3.micro

Use the EC2 only for:
- Nginx
- Node backend
- frontend

Avoid running Ollama locally on t3.micro.

Better options:
- use a larger EC2 instance, such as `t3.medium`
- use an external API
- run Ollama locally on your PC instead of EC2
- keep demo/mock mode for school presentation if needed

## Final health check

Run from your local WSL terminal:

```bash
curl http://$MY_EC2
curl http://$MY_EC2/api/status
```

Run from EC2:

```bash
pm2 status
sudo systemctl status nginx
df -h
free -h
```
