# Post-Deploy Checklist & Recovery Guide

This document provides the standard verification and recovery workflow after running Terraform deployment commands.

---

# Infrastructure Deployment

## Initialize Terraform

```bash
terraform init
```

---

## Deploy Infrastructure

```bash
terraform apply
```

Type:

```text
yes
```

Terraform will automatically:

- Create the EC2 instance
- Install dependencies
- Install Node.js
- Install PM2
- Install Nginx
- Clone the GitHub repository
- Configure DuckDNS
- Configure HTTPS with Certbot
- Start the backend automatically

---

# Terraform Outputs

Retrieve EC2 information:

```bash
terraform output
```

Expected outputs:

```text
ec2_public_dns_name
ec2_public_ip
```

---

# Recreate Useful Shell Variables

If the terminal is closed or variables are lost, recreate them using:

```bash
MY_EC2=$(terraform output -json | jq -r .ec2_public_dns_name.value)
MY_IP=$(terraform output -json | jq -r .ec2_public_ip.value)
```

Verify:

```bash
echo $MY_EC2
echo $MY_IP
```

---

# SSH Connection

Connect to EC2:

```bash
ssh -i "$HOME/.ssh/id_rsa_level3" ec2-user@$MY_IP
```

Alternative using DNS:

```bash
ssh -i "$HOME/.ssh/id_rsa_level3" ec2-user@$MY_EC2
```

---

# Website Verification

## Test HTTP

```bash
curl -I http://shaki-aiops.duckdns.org
```

Expected:

```text
301 redirect to HTTPS
```

---

## Test HTTPS

```bash
curl -I https://shaki-aiops.duckdns.org
```

Expected:

```text
HTTP/1.1 200 OK
```

---

# Backend Verification

SSH into EC2 first.

## PM2 Status

```bash
pm2 status
```

Expected:

```text
ai-ops-backend online
```

---

## Backend Logs

```bash
pm2 logs ai-ops-backend --lines 20
```

---

## API Health Check

```bash
curl http://localhost:3000/api/status
```

---

# Nginx Verification

## Validate Configuration

```bash
sudo nginx -t
```

---

## Check Nginx Status

```bash
sudo systemctl status nginx --no-pager
```

---

## View Nginx Errors

```bash
sudo tail -n 40 /var/log/nginx/error.log
```

---

# DuckDNS Verification

## Check DuckDNS Script

```bash
cat /home/ec2-user/duckdns.sh
```

---

## Check DuckDNS Result

```bash
cat /home/ec2-user/duckdns.log
```

Expected:

```text
OK
```

---

# HTTPS Certificate Verification

## Check Certificates

```bash
sudo certbot certificates
```

---

## Manual Certbot Recovery

If HTTPS fails:

```bash
sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  -m admin@shaki-aiops.duckdns.org \
  -d shaki-aiops.duckdns.org
```

---

# Git Recovery Workflow

## Check Repository State

```bash
git status
```

---

## Pull Latest Changes

```bash
git pull origin main
```

---

## Push Changes

```bash
git add .
git commit -m "describe your changes"
git push
```

---

# Terraform Destruction

Destroy infrastructure:

```bash
terraform destroy
```

Type:

```text
yes
```

---

# Important Notes

## Files Saved Locally

The following files should remain local and should not contain production secrets in GitHub:

```text
terraform.tfvars
backend/.env
backend/history.json
duckdns.sh
```

---

# Common Problems & Fixes

## HTTPS Not Working

Possible causes:

- DNS propagation delay
- Certbot validation failed
- Port 443 blocked
- Nginx not running

Useful checks:

```bash
curl -I https://shaki-aiops.duckdns.org
sudo systemctl status nginx
sudo certbot certificates
```

---

## AI Backend Offline

Useful checks:

```bash
pm2 status
pm2 logs ai-ops-backend
```

Restart backend:

```bash
pm2 restart ai-ops-backend
```

---

## DuckDNS Not Updating

Run manually:

```bash
/home/ec2-user/duckdns.sh
cat /home/ec2-user/duckdns.log
```

---

# Current Deployment Status

The infrastructure currently supports:

- Automated EC2 deployment
- Automated backend deployment
- Automated HTTPS setup
- Automated DuckDNS updates
- PM2 auto-start after reboot
- Reproducible Terraform deployment

