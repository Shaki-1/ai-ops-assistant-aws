# AI Ops Assistant

![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-API-000000?style=for-the-badge&logo=express&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-App-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111827)
![HTML5](https://img.shields.io/badge/HTML5-Frontend-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-UI-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-Metrics-FF6384?style=for-the-badge&logo=chart.js&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-Live%20Updates-2563EB?style=for-the-badge)
![PM2](https://img.shields.io/badge/PM2-Process%20Manager-2B037A?style=for-the-badge&logo=pm2&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Reverse%20Proxy-009639?style=for-the-badge&logo=nginx&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-IaC-844FBA?style=for-the-badge&logo=terraform&logoColor=white)
![AWS EC2](https://img.shields.io/badge/AWS%20EC2-Compute-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-CI%2FCD-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)
![DuckDNS](https://img.shields.io/badge/DuckDNS-Dynamic%20DNS-F2B705?style=for-the-badge)
![Let's Encrypt](https://img.shields.io/badge/Let's%20Encrypt-Certbot-003A70?style=for-the-badge&logo=letsencrypt&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-GenAI-F55036?style=for-the-badge)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-Server-FCC624?style=for-the-badge&logo=linux&logoColor=111827)

AI Ops Assistant is a training-focused DevOps and server operations dashboard for analyzing logs, reviewing server health, simulating incidents, managing support tickets, and deploying a small AWS-hosted application with Terraform.

The project combines a static frontend, Node.js/Express backend, JWT-based role access, WebSocket live updates, Nginx reverse proxying, PM2 process management, DuckDNS, Certbot/Let's Encrypt, GitHub Actions deployment, and file-backed JSON storage.

No private values belong in this repository. Use placeholders in documentation and keep real `.env`, `terraform.tfvars`, SSH keys, Terraform state, API keys, tokens, and passwords out of Git.

## Current Features

- Admin/user login with RBAC
- `/api/me` session validation to prevent stale role/token state
- Log Analyzer and AI Troubleshooting Result panels
- Improved command/context classification for logs, command output, quick checks, simulations, and unknown-command errors
- Quick diagnostic checks with realistic diagnostic samples
- Collapsible Log Analyzer input panel
- Collapsible side operations panel
- Resource Dashboard with live CPU, RAM, disk, request, latency, and runtime metrics
- WebSocket live updates on `/ws` with REST polling fallback
- Operational Alerts with thresholds and AI alert explanation
- AI Metrics Insight
- Security Center with defensive-only checks
- Simulation Lab for safe incident training
- Inbox/ticket system for admin and limited users
- Unread ticket notifications and Mark as read
- Incident Timeline / Activity Feed
- AI-generated remediation plans
- Governance & Data Use guidance with local acknowledgement export
- Backup/export/import workflow for file-backed app data
- Terraform AWS EC2 deployment
- GitHub Actions deployment
- Deployment diagnostics script

## Architecture

```text
Browser
  |
  | Static frontend + WebSocket client
  v
Nginx reverse proxy
  |-- /        -> frontend files
  |-- /api/*   -> Node.js/Express on localhost:3000
  |-- /ws      -> WebSocket upgrade to localhost:3000/ws
  v
Node.js/Express backend managed by PM2
  |-- JWT auth and RBAC
  |-- AI analysis endpoints
  |-- metrics and alert engine
  |-- file-backed JSON storage
  v
Groq/OpenAI-compatible AI provider
```

Infrastructure and deployment pieces:

- Static frontend: `frontend/index.html`, `frontend/style.css`, `frontend/app.js`
- Backend: `backend/server.js`
- Auth: JWT bearer tokens with `/api/me` validation
- Live updates: WebSocket `/ws`
- Process manager: PM2
- Reverse proxy: Nginx
- DNS: DuckDNS
- HTTPS: Certbot/Let's Encrypt
- Infrastructure: Terraform EC2 using Amazon Linux 2023 auto-discovery
- CI/CD: GitHub Actions SSH deployment
- Data: local JSON files for tickets, timeline, history, alerts/runtime state

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Screenshots

The repository references planned screenshots under `docs/screenshots/`. If an image is not present yet, treat the filename as the expected capture target.

| Area | Screenshot |
|---|---|
| Login dark | `docs/screenshots/01-login-dark.png` |
| Login light | `docs/screenshots/02-login-light.png` |
| Admin analyzer | `docs/screenshots/03-admin-analyzer.png` |
| Limited user view | `docs/screenshots/04-user-limited-view.png` |
| Quick check analysis | `docs/screenshots/05-quick-check-analysis.png` |
| Resource Dashboard metrics | `docs/screenshots/06-resource-dashboard-metrics.png` |
| Operational Alerts | `docs/screenshots/07-operational-alerts.png` |
| AI Metrics Insight | `docs/screenshots/08-ai-metrics-insight.png` |
| Security Center | `docs/screenshots/09-security-center.png` |
| Simulation Lab | `docs/screenshots/10-simulation-lab.png` |
| Simulation analysis banner | `docs/screenshots/11-simulation-analysis-banner.png` |
| Admin Inbox | `docs/screenshots/12-admin-inbox.png` |
| User Inbox | `docs/screenshots/13-user-inbox.png` |
| Incident Timeline | `docs/screenshots/14-incident-timeline.png` |
| Remediation Plan | `docs/screenshots/15-remediation-plan.png` |
| Governance & Data Use | `docs/screenshots/16-governance-data-use.png` |
| Live connected | `docs/screenshots/17-live-connected.png` |
| Collapsed side panel | `docs/screenshots/18-collapsed-side-panel.png` |
| Collapsed input panel | `docs/screenshots/19-collapsed-input-panel.png` |
| Mobile layout | `docs/screenshots/20-mobile-layout.png` |
| GitHub Actions green | `docs/screenshots/21-github-actions-green.png` |
| Terraform apply output | `docs/screenshots/22-terraform-apply-output.png` |
| Deploy diagnostics output | `docs/screenshots/23-diagnose-deploy-output.png` |
| Backup export output | `docs/screenshots/24-backup-export-output.png` |

## Quick Start

```bash
git clone https://github.com/your-org/ai-ops-assistant-aws.git
cd ai-ops-assistant-aws
```

Create a local, untracked `terraform.tfvars` from environment variables:

```bash
export TF_VAR_ec2_type="t3.micro"
export TF_VAR_ec2_name="ai-ops-assistant"
export TF_VAR_keypair="your-ec2-keypair-name"
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

Terraform auto-discovers the latest Amazon Linux 2023 AMI, default VPC, default subnet, and creates a managed security group for SSH, HTTP, and HTTPS. Backend port `3000` is not opened publicly.

Find your EC2 key pair name:

```bash
aws ec2 describe-key-pairs --query "KeyPairs[*].KeyName" --output table
```

Deploy:

```bash
terraform init
terraform validate
terraform plan
terraform apply
```

After deployment, open:

```text
http://your-domain.duckdns.org
https://your-domain.duckdns.org
```

HTTPS depends on DuckDNS resolving to the EC2 public IP and Let's Encrypt rate limits. HTTP remains available if Certbot cannot issue a certificate.

## Useful Scripts

- `scripts/create_tfvars_from_env.sh`: create local `terraform.tfvars` from environment variables
- `scripts/diagnose_deploy.sh`: inspect public IP, DuckDNS, PM2, backend health, Nginx, WebSocket config, and Certbot
- `scripts/health_check_local.sh`: local backend health check helper
- `scripts/backup_history.sh`: EC2-side history/data backup helper
- `scripts/export_app_data.sh`: create an app-data archive
- `scripts/import_app_data.sh`: import app-data archive
- `scripts/restore_app_data.sh`: restore latest local archive or initialize empty data files
- `scripts/push_restore_app_data.sh`: copy a local archive to EC2 and import it
- `scripts/rebuild_and_restore.sh`: run Terraform apply, wait for SSH, then push/import app data

## Security Notes

- Do not commit real secrets.
- Keep `.env`, `backend/.env`, `terraform.tfvars`, Terraform state, SSH keys, and backup archives out of Git.
- Use `terraform.tfvars.example` only for placeholders.
- Store GitHub Actions deployment credentials as repository secrets.
- The app uses JWT/localStorage for training simplicity; production systems should prefer secure httpOnly cookies or a managed identity provider.
- Security Center is defensive-only. It does not perform port scans, exploitation, or intrusive tests.
- Logs may contain personal data or secrets. Only process content you are allowed to use.

## Limitations

- Storage is file-backed JSON, not a database.
- EC2-local data is lost after `terraform destroy` unless exported before destroy and imported after rebuild.
- HTTPS issuance depends on DuckDNS propagation and Let's Encrypt rate limits.
- Quick Checks are diagnostic/training samples unless a real collector agent is added.
- WebSocket is used for live updates, but REST polling remains the fallback.

## Roadmap

- SQLite or PostgreSQL persistence
- Real Linux collector agent
- Multi-server support
- PDF incident reports
- Full RBAC permissions panel
- Audit log dashboard

## Documentation

- [Features](docs/FEATURES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Post-Deployment Checklist](docs/POST_DEPLOYMENT_CHECKLIST.md)
- [Backup and Restore](docs/BACKUP_AND_RESTORE.md)
- [Security and Governance](docs/SECURITY_AND_GOVERNANCE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Project Summary Guide](docs/PROJECT_SUMMARY_GUIDE.md)

## License

This project is intended for educational, DevOps learning, and defensive operations training.
