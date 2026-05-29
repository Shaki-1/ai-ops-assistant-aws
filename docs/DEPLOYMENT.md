# Deployment Notes

## Private Terraform Variables

Do not commit `terraform.tfvars`. It contains private deployment values such as API keys, DuckDNS tokens, passwords, and JWT secrets.

Use `terraform.tfvars.example` as the placeholder template, then generate the real local file from environment variables:

```bash
export TF_VAR_ami_id="ami-xxxxxxxxxxxxxxxxx"
export TF_VAR_subnet_id="subnet-xxxxxxxxxxxxxxxxx"
export TF_VAR_main_sg_id="sg-xxxxxxxxxxxxxxxxx"
export TF_VAR_ec2_type="t3.micro"
export TF_VAR_ec2_name="ai-ops-assistant"
export TF_VAR_keypair="your-ec2-keypair-name"
export TF_VAR_aws_owner="your-name"
export TF_VAR_groq_api_key="your-private-groq-key"
export TF_VAR_duckdns_domain="your-duckdns-subdomain"
export TF_VAR_duckdns_token="your-private-duckdns-token"
export TF_VAR_admin_username="admin"
export TF_VAR_admin_password="your-private-admin-password"
export TF_VAR_user_username="user"
export TF_VAR_user_password="your-private-user-password"
export TF_VAR_auth_token_secret="your-long-random-secret"

./scripts/create_tfvars_from_env.sh
```

The script writes `terraform.tfvars` locally with restrictive permissions when supported. It does not print secret values.

## Apply

```bash
terraform init
terraform apply
```

## GitHub Actions Secrets

Store deploy credentials in GitHub Actions Secrets. Do not paste private keys or tokens into README files, workflow files, Terraform examples, or issue comments.

Typical deploy secrets:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`

## App Data Restore

EC2-local backups do not survive `terraform destroy`. To preserve tickets, timeline, and history across a rebuild, export the archive before destroy and restore it after apply:

```bash
./scripts/export_app_data.sh
scp ec2-user@YOUR_HOST:/home/ec2-user/backups/app-data/ai_ops_app_data_*.tar.gz .
./scripts/rebuild_and_restore.sh backups/app-data/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz
```
