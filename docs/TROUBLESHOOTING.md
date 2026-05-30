# Troubleshooting

This guide lists common issues and safe checks. Do not paste secrets or private logs into shared tickets or documentation.

## Server Offline

Check local backend health on EC2:

```bash
curl -fsS http://localhost:3000/api/status
pm2 status
pm2 logs ai-ops-backend --lines 50 --nostream
```

If PM2 is offline, restart:

```bash
pm2 restart ai-ops-backend --update-env
```

## Live Fallback

`Live fallback` means REST is being used because WebSocket is unavailable. If `/api/status` works, the app can still function.

Check Nginx `/ws` proxy:

```bash
sudo grep -n "location /ws" /etc/nginx/conf.d/ai-ops-assistant.conf
sudo nginx -t
```

## WebSocket Reconnecting

Confirm:

- Browser uses `ws://` on HTTP and `wss://` on HTTPS
- Backend has the `ws` package installed
- Nginx has WebSocket upgrade headers
- Saved token is valid through `/api/me`

```bash
cd /home/ec2-user/ai-ops-assistant-aws/backend
npm ls ws --omit=dev
```

## HTTPS Unavailable

HTTP should still work. Check:

```bash
curl -I http://your-domain.duckdns.org
sudo certbot certificates
sudo nginx -t
```

## Certbot Rate Limit

Let's Encrypt may rate-limit repeated requests. The deployment keeps HTTP available and should skip Certbot when a certificate already exists.

Wait for the rate limit window or use a staging/test certificate flow for repeated experiments.

## Nginx Failed

```bash
sudo nginx -t
sudo cat /etc/nginx/conf.d/ai-ops-assistant.conf
sudo systemctl status nginx --no-pager
```

Common causes:

- Unescaped Nginx variables in generated config
- Invalid `/ws` block
- Certbot partial HTTPS config after failed issuance

## PM2 Failed

```bash
pm2 status
pm2 logs ai-ops-backend --lines 100 --nostream
cd /home/ec2-user/ai-ops-assistant-aws/backend
npm install
node --check server.js
pm2 restart ai-ops-backend --update-env
```

## Login Failed

Check backend `.env` on EC2 without printing secrets:

```bash
grep -E "ADMIN_USERNAME|USER_USERNAME|ADMIN_PASSWORD_HASH|USER_PASSWORD_HASH|AUTH_TOKEN_SECRET" /home/ec2-user/ai-ops-assistant-aws/backend/.env
```

Do not share the output if it contains hashes or secrets.

The user-data script should generate bcrypt hashes on EC2 from sensitive Terraform variables.

## Stale Token or Role

If the browser has old localStorage values after an auth change or rebuild, `/api/me` should reject invalid tokens and restore the role from the backend.

Manual browser cleanup:

```text
localStorage.removeItem("authToken")
localStorage.removeItem("userRole")
localStorage.removeItem("username")
```

Then log in again.

## 403 Forbidden

403 usually means the token is valid but the role is not allowed. Limited users should not call admin-only endpoints such as:

- `/api/metrics`
- `/api/alerts`
- `/api/timeline`
- `/api/tickets/admin`

The frontend should hide admin-only views after `/api/me` validation.

## Missing `ws`

```bash
cd /home/ec2-user/ai-ops-assistant-aws/backend
npm install
npm ls ws --omit=dev
pm2 restart ai-ops-backend --update-env
```

## GitHub Actions Failed

Check deploy logs for:

- SSH connection
- Git pull
- `npm install`
- PM2 restart
- Nginx restart
- Health check retries

Health checks should use localhost/127.0.0.1 on EC2 and avoid requiring local restore archives.

## Terraform Missing Variables

Regenerate local `terraform.tfvars`:

```bash
./scripts/create_tfvars_from_env.sh
```

Terraform now auto-discovers AMI, default VPC, subnet, and creates the security group, so `ami_id`, `subnet_id`, and `main_sg_id` should not be required.

## Data Restore Issues

If tickets/timeline/history are missing after rebuild, confirm whether an archive was exported before destroy.

```bash
./scripts/restore_app_data.sh
./scripts/import_app_data.sh /home/ec2-user/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz
```

Remember: EC2-local backups do not survive `terraform destroy`.

## Full Diagnostic Helper

```bash
./scripts/diagnose_deploy.sh your-domain.duckdns.org
```
