#!/bin/bash

set -u

DOMAIN="${1:-shaki-aiops.duckdns.org}"
NGINX_CONF="/etc/nginx/conf.d/ai-ops-assistant.conf"
BACKEND_DIR="/home/ec2-user/ai-ops-assistant-aws/backend"

print_section() {
  echo
  echo "== $1 =="
}

print_section "Public IP"
CURRENT_PUBLIC_IP=$(curl -fsS https://checkip.amazonaws.com 2>/dev/null || curl -fsS http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
CURRENT_PUBLIC_IP=$(echo "$CURRENT_PUBLIC_IP" | tr -d '[:space:]')
echo "Current public IP: ${CURRENT_PUBLIC_IP:-unknown}"

print_section "DuckDNS"
DUCKDNS_RESOLVED_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR == 1 {print $1}')
echo "Domain: $DOMAIN"
echo "Resolved IP: ${DUCKDNS_RESOLVED_IP:-not resolved}"

if [ -n "$CURRENT_PUBLIC_IP" ] && [ "$DUCKDNS_RESOLVED_IP" = "$CURRENT_PUBLIC_IP" ]; then
  echo "DuckDNS status: matches this instance"
else
  echo "DuckDNS status: does not match this instance yet"
fi

print_section "PM2"
if command -v pm2 >/dev/null 2>&1; then
  sudo -u ec2-user bash -lc "pm2 status" || true
else
  echo "pm2 is not installed"
fi

print_section "Backend dependency check"
if [ -d "$BACKEND_DIR" ]; then
  cd "$BACKEND_DIR" || exit 1
  if node -e "import('ws').then(()=>console.log('ws dependency: available')).catch((error)=>{console.error('ws dependency: missing - ' + error.message); process.exit(1);})"; then
    true
  else
    true
  fi
else
  echo "Backend directory missing: $BACKEND_DIR"
fi

print_section "Backend API"
curl -fsS http://localhost:3000/api/status || echo "Backend API status check failed"
echo

print_section "Nginx"
nginx -t || true

if [ -f "$NGINX_CONF" ]; then
  if grep -q "location /ws" "$NGINX_CONF"; then
    echo "/ws block: present"
  else
    echo "/ws block: missing"
  fi

  if grep -q "proxy_set_header Upgrade" "$NGINX_CONF"; then
    echo "WebSocket upgrade header: present"
  else
    echo "WebSocket upgrade header: missing"
  fi
else
  echo "Nginx config missing: $NGINX_CONF"
fi

print_section "Certbot"
if command -v certbot >/dev/null 2>&1; then
  certbot certificates || true
else
  echo "certbot is not installed"
fi

