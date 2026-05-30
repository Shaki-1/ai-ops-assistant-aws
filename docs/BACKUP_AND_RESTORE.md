# Backup and Restore

AI Ops Assistant stores app data in SQLite at `backend/data/ai_ops.db`. Legacy JSON files can still be imported for compatibility, but the SQLite database is the primary persistence file.

## Important Limitation

Backups stored only on EC2 do not survive `terraform destroy`. Copy archives off the instance before destroying infrastructure.

## Data Covered

Backup/import scripts are intended to cover:

- `backend/data/tickets.json`
- `backend/data/timeline.json`
- `backend/history.json`
- `backend/data/ai_ops.db`
- SQLite WAL/SHM sidecar files when present

They must not include:

- `.env`
- `terraform.tfvars`
- SSH keys
- Terraform state
- `node_modules`
- API keys or tokens

## Scripts

### `scripts/backup_history.sh`

EC2-side helper for backing up existing app history/data. Use it when maintaining the running server.

### `scripts/export_app_data.sh`

Creates a timestamped app-data archive. Run this before destructive rebuilds.

```bash
./scripts/export_app_data.sh
```

Example archive name:

```text
ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz
```

### `scripts/import_app_data.sh`

Imports a selected archive on the target machine.

```bash
./scripts/import_app_data.sh /home/ec2-user/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz
```

### `scripts/restore_app_data.sh`

Restores the latest local EC2 backup if present. If no backup exists, it initializes empty/default JSON fallback files; the backend creates `backend/data/ai_ops.db` on startup and migrates existing JSON files when present.

### `scripts/push_restore_app_data.sh`

Copies a local archive to the current EC2 instance and imports it.

```bash
SSH_KEY="$HOME/.ssh/your-ssh-key" ./scripts/push_restore_app_data.sh backups/app-data/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz
```

The script uses Terraform output where possible to find the current EC2 public IP.

### `scripts/rebuild_and_restore.sh`

Runs Terraform apply, waits for SSH, then pushes/imports a local archive.

```bash
SSH_KEY="$HOME/.ssh/your-ssh-key" ./scripts/rebuild_and_restore.sh backups/app-data/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz
```

## Recommended Rebuild Workflow

Before destroy:

```bash
ssh -i ~/.ssh/your-ssh-key ec2-user@your-ec2-ip
cd /home/ec2-user/ai-ops-assistant-aws
./scripts/export_app_data.sh
```

Copy archive locally:

```bash
scp -i ~/.ssh/your-ssh-key ec2-user@your-ec2-ip:/home/ec2-user/backups/app-data/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz backups/app-data/
```

Rebuild and restore:

```bash
terraform apply
SSH_KEY="$HOME/.ssh/your-ssh-key" ./scripts/push_restore_app_data.sh backups/app-data/ai_ops_app_data_YYYY-MM-DD_HH-MM-SS.tar.gz
```

## Future Improvement

Use S3, PostgreSQL, managed backups, or another external durable store for persistence beyond the local EC2 filesystem.
