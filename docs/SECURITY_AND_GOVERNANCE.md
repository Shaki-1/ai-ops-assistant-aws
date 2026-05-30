# Security and Governance

AI Ops Assistant is a defensive operations and training application. It must not store or expose private values in the Git repository.

## Secret Handling

Never commit:

- `.env`
- `backend/.env`
- `terraform.tfvars`
- Terraform state files
- SSH private keys
- API keys
- DuckDNS tokens
- JWT/auth secrets
- Passwords
- Private logs or customer data
- Backup archives containing runtime data

Use placeholders such as `your-groq-api-key`, `your-duckdns-token`, `your-ssh-key`, and `your-domain.duckdns.org`.

## Repository Safety

`.gitignore` should protect:

- `.env`
- `backend/.env`
- `terraform.tfvars`
- `*.tfstate`
- `*.tfstate.*`
- `.terraform/`
- `backups/`
- `node_modules/`
- private key patterns

`terraform.tfvars.example` is tracked with placeholders only. Real values should be generated locally by `scripts/create_tfvars_from_env.sh`.

## Authentication and RBAC

The backend supports:

- Admin user
- Limited user
- JWT bearer tokens
- `/api/me` session validation
- Role-aware middleware
- Admin-only endpoints for metrics, alerts, timeline, full history, report generation, and safe commands
- User-accessible analyzer, simulation training, and ticket submission

The frontend validates saved tokens through `/api/me` before restoring views or starting live updates. It does not trust stale `localStorage.userRole` as the source of truth.

This is a training app that stores JWTs in localStorage. A production system should prefer secure httpOnly cookies or a managed identity provider.

## WebSocket Auth

WebSocket clients connect to `/ws` with a validated JWT. Invalid or expired tokens close the connection and return the UI to login. If WebSocket is blocked by the network or proxy, the app keeps REST polling as fallback.

## Defensive Security Features

- Security headers through Express
- JSON body size limits
- Login and AI request rate limits
- Defensive-only Security Center checks
- No real port scanning from the frontend
- No exploitation logic
- No offensive actions
- Backend port `3000` should remain private behind Nginx

## Responsible Log Handling

Logs may contain personal data, credentials, private IPs, hostnames, tokens, or customer information. Use only logs you are allowed to process. Remove secrets before submitting content to AI features.

AI output is guidance. Administrators must manually verify suggestions before running commands or changing infrastructure.

## Governance & Data Use Page

The app includes a Governance & Data Use view for responsible use guidance and local acknowledgement history. Acknowledgements are stored in browser localStorage only and can be manually exported by the user.
