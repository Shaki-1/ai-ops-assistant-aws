# Architecture

AI Ops Assistant uses a small, production-like web architecture that is simple enough for training but realistic enough to exercise deployment, auth, metrics, alerts, and recovery workflows.

## High-Level Flow

```text
User browser
  |
  | HTTPS or HTTP
  v
Nginx on EC2
  |-- /      -> static frontend
  |-- /api/  -> Express backend on localhost:3000
  |-- /ws    -> WebSocket upgrade to localhost:3000/ws
  v
Node.js/Express backend managed by PM2
  |
  | AI provider requests
  v
Groq/OpenAI-compatible API
```

## Frontend

The frontend is static HTML, CSS, and JavaScript:

- Login screen
- Analyzer view
- Resource Dashboard
- Security Center
- Simulation Lab
- Inbox/My Tickets
- Incident Timeline
- Governance & Data Use

It uses REST APIs for actions and WebSocket updates for live metrics, alerts, inbox unread count, and timeline events. REST polling remains available as fallback.

## Backend

The backend is Node.js with Express. It provides:

- JWT login
- `/api/me` token/session validation
- RBAC middleware
- Protected metrics and alert endpoints
- AI troubleshooting and remediation endpoints
- Ticket endpoints
- Timeline endpoints
- SQLite persistence with legacy JSON migration
- WebSocket server on `/ws`

PM2 keeps the backend running as `ec2-user`.

## Nginx

Nginx serves static frontend files and proxies:

- `/api/` to `http://localhost:3000/api/`
- `/ws` to `http://localhost:3000/ws`

The WebSocket block must include upgrade headers:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
```

Backend port `3000` is not exposed publicly.

## Terraform

Terraform provisions the EC2 instance and related AWS resources:

- Latest Amazon Linux 2023 AMI auto-discovery
- Default VPC lookup
- Default subnet lookup
- Managed security group for ports 22, 80, and 443
- EC2 instance user-data bootstrap

Private values are passed through sensitive variables and local `terraform.tfvars`, which must not be committed.

## DuckDNS and Certbot

DuckDNS maps a friendly domain to the current EC2 public IP. Certbot issues a Let's Encrypt certificate only after DNS points to the current instance and Nginx HTTP is valid.

If HTTPS cannot be issued, HTTP remains available.

## GitHub Actions

The deploy workflow connects to EC2 over SSH and performs a safe deploy:

- Pull repository
- Install dependencies
- Restart PM2
- Test/restart Nginx
- Run backend health check

It should not depend on local backup archives or print secrets.

## Data Storage

The project uses a local SQLite database at `backend/data/ai_ops.db` for:

- Tickets
- Timeline
- History
- Alerts

Legacy JSON files are migrated on startup if present. For long-term production use, move the database to managed external storage or PostgreSQL.
