# Deployment Guide

This guide explains the current Terraform and EC2 deployment flow. It uses placeholders only. Do not paste real API keys, tokens, passwords, SSH keys, `.env`, Terraform state, or private logs into documentation.

## Terraform Auto-Discovery

Terraform now requires fewer manual AWS IDs.

Auto-discovered or managed:

- Latest Amazon Linux 2023 AMI
- Default VPC
- First subnet in the default VPC
- Security group for SSH, HTTP, and HTTPS

Not opened publicly:

- Backend port `3000`

Nginx proxies browser traffic to `localhost:3000`.

## Required Private Variables

Create local environment variables, then generate `terraform.tfvars` with the helper script.

```bash
export TF_VAR_ec2_type="t3.micro"
export TF_VAR_ec2_name="ai-ops-assistant"
export TF_VAR_keypair="ai-ops-laura-new"
export TF_VAR_aws_owner="your-name"
export TF_VAR_groq_api_key="your-groq-api-key"
export TF_VAR_duckdns_domain="your-domain"
export TF_VAR_duckdns_token="your-duckdns-token"
export TF_VAR_admin_username="admin"
export TF_VAR_admin_password="your-admin-password"
export TF_VAR_user_username="user"
export TF_VAR_user_password="your-user-password"
export TF_VAR_auth_token_secret="your-long-random-secret"

./scripts/create_tfvars_from_env.sh
```

The script writes `terraform.tfvars` locally and does not print secret values. `terraform.tfvars` must stay ignored and uncommitted.

Find available EC2 key pair names:

```bash
aws ec2 describe-key-pairs --query "KeyPairs[*].KeyName" --output table
```

## Terraform Commands

```bash
terraform init
terraform fmt
terraform validate
terraform plan
terraform apply
```

Terraform provisions the EC2 instance and passes safe template values into `user-data.web.sh`. Plain admin/user passwords are provided as sensitive Terraform variables, then bcrypt hashes are generated on EC2 and written to the backend `.env`. Bcrypt hashes are not passed through Terraform templates.

## What User Data Configures

The EC2 bootstrap script:

- Installs Node.js, Nginx, Certbot, Git, PM2, and dependencies
- Clones the repository
- Runs backend `npm install`
- Generates admin and user bcrypt password hashes locally on EC2
- Writes backend `.env`
- Restores app data if available or initializes empty data files
- Builds a valid HTTP Nginx baseline
- Starts/restarts Nginx
- Updates DuckDNS
- Waits for DuckDNS to resolve to the current EC2 public IP
- Runs Certbot only when safe
- Starts backend with PM2 as `ec2-user`

## HTTP and HTTPS Behavior

HTTP is the baseline and should remain available even if Certbot fails.

HTTPS requires:

- DuckDNS pointing to the current EC2 public IP
- Nginx HTTP config passing `nginx -t`
- Certbot not being rate-limited by Let's Encrypt

If a certificate already exists, Certbot is skipped. If Certbot fails or is rate-limited, the app keeps HTTP available and logs a warning.

## GitHub Actions Deployment

GitHub Actions should only perform deployment actions such as:

- Pull latest code
- Install backend dependencies
- Restart PM2
- Restart/test Nginx
- Run a local backend health check

Store deploy values in GitHub Actions Secrets, such as:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`

Do not put secrets in workflow files.

## Diagnostics

After deployment, run:

```bash
./scripts/diagnose_deploy.sh your-domain.duckdns.org
```

The script checks:

- Current public IP
- DuckDNS resolved IP
- PM2 status
- `ws` dependency availability
- `curl http://localhost:3000/api/status`
- `nginx -t`
- `/ws` Nginx block
- Certbot certificate status

Use placeholders in shared logs and never paste secrets.
