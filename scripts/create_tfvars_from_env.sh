#!/bin/bash

set -euo pipefail

REQUIRED_VARS=(
  TF_VAR_ec2_type
  TF_VAR_ec2_name
  TF_VAR_keypair
  TF_VAR_aws_owner
  TF_VAR_groq_api_key
  TF_VAR_duckdns_domain
  TF_VAR_duckdns_token
  TF_VAR_admin_username
  TF_VAR_admin_password
  TF_VAR_user_username
  TF_VAR_user_password
  TF_VAR_auth_token_secret
)

missing=()
for var_name in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    missing+=("$var_name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing required environment variables:"
  printf '  - %s\n' "${missing[@]}"
  echo "No terraform.tfvars file was created."
  exit 1
fi

escape_tf_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_var() {
  local tf_name="$1"
  local env_name="TF_VAR_$tf_name"
  printf '%-18s = "%s"\n' "$tf_name" "$(escape_tf_string "${!env_name}")"
}

umask 077
{
  write_var "ec2_type"
  write_var "ec2_name"
  write_var "keypair"
  write_var "aws_owner"
  write_var "groq_api_key"
  write_var "duckdns_domain"
  write_var "duckdns_token"
  write_var "admin_username"
  write_var "admin_password"
  write_var "user_username"
  write_var "user_password"
  write_var "auth_token_secret"
} > terraform.tfvars

chmod 600 terraform.tfvars 2>/dev/null || true

echo "terraform.tfvars created with ${#REQUIRED_VARS[@]} values."
echo "Secret values were not printed. Keep terraform.tfvars local and uncommitted."
