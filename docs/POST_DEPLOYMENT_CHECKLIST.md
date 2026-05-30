# Post-Deployment Checklist

Run these checks after Terraform apply, GitHub Actions deploy, or manual recovery.

Use placeholders in shared notes and do not paste secrets.

## EC2 and Backend

```bash
pm2 status
pm2 logs ai-ops-backend --lines 50 --nostream
curl -fsS http://localhost:3000/api/status
```

Expected:

- PM2 shows `ai-ops-backend` online
- `/api/status` returns JSON
- Backend runs on port `3000` locally only

## Nginx

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo grep -n "location /ws" /etc/nginx/conf.d/ai-ops-assistant.conf
```

Expected:

- `nginx -t` succeeds
- Nginx is active
- `/api` proxy exists
- `/ws` proxy exists with WebSocket upgrade headers

## DuckDNS

```bash
curl -fsS https://checkip.amazonaws.com
getent hosts your-domain.duckdns.org
```

Expected:

- DuckDNS resolves to the current EC2 public IP

## Certbot and HTTPS

```bash
sudo certbot certificates
curl -I http://your-domain.duckdns.org
curl -I https://your-domain.duckdns.org
```

Expected:

- HTTP responds
- HTTPS responds if certificate issuance succeeded
- If Certbot is rate-limited, HTTP still works

## Application Login

Test in the browser:

- Admin login works
- Limited user login works
- `/api/me` restores correct role after refresh
- Invalid or expired token returns to login

## WebSocket and Fallback

Check the header live status:

- `Live connected` when `/ws` works
- `Live fallback` when WebSocket is unavailable but REST API works
- No repeated console warning spam

## Resource Dashboard

Admin checks:

- Metrics load
- Charts update
- Operational Alerts panel loads
- AI Metrics Insight works or fails gracefully
- Alert acknowledgement works

## Security Center

Admin checks:

- HTTPS/API/metrics/auth status cards populate
- Defensive guidance renders
- AI explanation works or falls back gracefully

## Inbox and Tickets

Admin and user checks:

- User can create ticket
- Admin can see and reply
- User can see admin-created messages/replies
- Mark as read clears unread badge
- Delete behavior respects permissions

## Incident Timeline

Admin checks:

- Timeline opens
- Events are recorded for analysis, tickets, alerts, simulation, login, and AI actions
- Filters work

## Backup Export

Before destructive rebuilds:

```bash
./scripts/export_app_data.sh
```

Copy the archive off EC2 before `terraform destroy`.

## Diagnostic Script

```bash
./scripts/diagnose_deploy.sh your-domain.duckdns.org
```

Use the output to confirm public IP, DuckDNS, PM2, backend health, Nginx, WebSocket config, and Certbot.
