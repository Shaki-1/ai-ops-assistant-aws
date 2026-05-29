# Security And Governance

## Secret Handling

Never commit real secrets. Keep these values in local environment variables, local `terraform.tfvars`, EC2 `.env`, or GitHub Actions Secrets:

- API keys
- DuckDNS tokens
- JWT/auth secrets
- Admin or user passwords
- SSH private keys
- Terraform state files

`terraform.tfvars` is intentionally ignored by Git. Use `terraform.tfvars.example` for placeholders only.

## AI Data Use

Do not paste secrets, passwords, private keys, API keys, or confidential customer data into the analyzer. Logs may contain personal data and operationally sensitive information. Use only logs and content you are allowed to process.

AI output is operational guidance, not an automatic change plan. Review all recommendations and commands before use.

## Defensive Operations Boundary

This project is for defensive troubleshooting and training. It must not perform offensive scanning, exploitation, destructive changes, or credential exposure. Safe commands should be read-only or clearly scoped service checks.

## GitHub Actions

GitHub Actions deploy should only pull the repo, install dependencies, restart PM2/Nginx, and run local health checks. It must not depend on local backup archives or print secrets.
