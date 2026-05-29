#!/bin/bash

dnf update -y
dnf install -y nginx git nodejs20 npm certbot python3-certbot-nginx

systemctl enable nginx

if npm install -g pm2; then
  echo "PM2 installed globally."
else
  echo "ERROR: Failed to install PM2."
  exit 1
fi

cd /home/ec2-user
rm -rf ai-ops-assistant-aws
git clone https://github.com/Shaki-1/ai-ops-assistant-aws ai-ops-assistant-aws
cd /home/ec2-user/ai-ops-assistant-aws/backend

if npm install; then
  echo "Backend npm install completed."
else
  echo "ERROR: Backend npm install failed."
  exit 1
fi

if node -e "import('ws').then(()=>console.log('ws dependency available')).catch((error)=>{console.error(error.message); process.exit(1);})"; then
  echo "Backend ws dependency check passed."
else
  echo "ERROR: ws dependency is missing after npm install."
  exit 1
fi

ADMIN_PASSWORD_HASH=$(node -e "import('bcryptjs').then(async b=>console.log(await b.default.hash('${admin_password}', 10)))")
USER_PASSWORD_HASH=$(node -e "import('bcryptjs').then(async b=>console.log(await b.default.hash('${user_password}', 10)))")

cat > .env <<'ENVEOF'
AI_PROVIDER=groq
GROQ_API_KEY=${groq_api_key}
GROQ_MODEL=llama-3.1-8b-instant
PORT=3000

ADMIN_USERNAME=${admin_username}
USER_USERNAME=${user_username}
AUTH_TOKEN_SECRET=${auth_token_secret}
ENVEOF

printf '%s\n' "ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH" >> .env
printf '%s\n' "USER_PASSWORD_HASH=$USER_PASSWORD_HASH" >> .env

chown -R ec2-user:ec2-user /home/ec2-user/ai-ops-assistant-aws

pm2 startup systemd -u ec2-user --hp /home/ec2-user
systemctl enable pm2-ec2-user

if sudo -u ec2-user bash -lc '
  cd /home/ec2-user/ai-ops-assistant-aws/backend
  pm2 delete ai-ops-backend >/dev/null 2>&1 || true
  pm2 start server.js --name ai-ops-backend --update-env
  pm2 save
  pm2 status
'; then
  echo "Backend started with PM2 as ec2-user."
else
  echo "ERROR: PM2 failed to start ai-ops-backend as ec2-user."
  sudo -u ec2-user bash -lc "pm2 logs ai-ops-backend --lines 80 --nostream" || true
  exit 1
fi

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:3000/api/status >/tmp/ai-ops-backend-status.json; then
    echo "Backend API status check passed."
    break
  fi

  echo "Backend API status not ready yet, attempt $attempt."
  sleep 3
done

if ! curl -fsS http://localhost:3000/api/status >/tmp/ai-ops-backend-status.json; then
  echo "ERROR: Backend API did not respond on localhost:3000."
  sudo -u ec2-user bash -lc "pm2 status && pm2 logs ai-ops-backend --lines 80 --nostream" || true
  exit 1
fi

APP_DOMAIN="${duckdns_domain}.duckdns.org"
NGINX_CONF="/etc/nginx/conf.d/ai-ops-assistant.conf"
CERT_PATH="/etc/letsencrypt/live/${duckdns_domain}.duckdns.org/fullchain.pem"
CURRENT_PUBLIC_IP=$(curl -fsS https://checkip.amazonaws.com || curl -fsS http://169.254.169.254/latest/meta-data/public-ipv4 || true)
CURRENT_PUBLIC_IP=$(echo "$CURRENT_PUBLIC_IP" | tr -d '[:space:]')

echo "Current public IP: $CURRENT_PUBLIC_IP"
echo "Writing plain HTTP Nginx config for $APP_DOMAIN."

cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    server_name ${duckdns_domain}.duckdns.org;

    root /home/ec2-user/ai-ops-assistant-aws/frontend;
    index index.html;


    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /ws {
        proxy_pass http://localhost:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
    }
}
NGINXEOF

rm -f /etc/nginx/conf.d/default.conf

chmod o+x /home/ec2-user
chmod -R o+rx /home/ec2-user/ai-ops-assistant-aws/frontend

if nginx -t; then
  echo "Nginx config test passed."
else
  echo "Nginx config test failed. Generated config follows:"
  sed -n '1,220p' "$NGINX_CONF"
  exit 1
fi

systemctl restart nginx
if systemctl is-active --quiet nginx; then
  echo "Nginx is running with plain HTTP config."
else
  echo "Nginx failed to start. Generated config follows:"
  sed -n '1,220p' "$NGINX_CONF"
  systemctl status nginx --no-pager || true
  exit 1
fi

cat > /home/ec2-user/duckdns.sh <<DUCKEOF
#!/bin/bash
curl "https://www.duckdns.org/update?domains=${duckdns_domain}&token=${duckdns_token}&ip=$CURRENT_PUBLIC_IP" -o /home/ec2-user/duckdns.log
DUCKEOF

chmod +x /home/ec2-user/duckdns.sh
chown ec2-user:ec2-user /home/ec2-user/duckdns.sh

/home/ec2-user/duckdns.sh

DUCKDNS_RESOLVED_IP=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  DUCKDNS_RESOLVED_IP=$(getent ahostsv4 "$APP_DOMAIN" | awk 'NR == 1 {print $1}')
  if [ -n "$DUCKDNS_RESOLVED_IP" ]; then
    echo "DuckDNS resolved IP attempt $attempt: $DUCKDNS_RESOLVED_IP"
  else
    echo "DuckDNS resolved IP attempt $attempt: not resolved"
  fi

  if [ -n "$CURRENT_PUBLIC_IP" ] && [ "$DUCKDNS_RESOLVED_IP" = "$CURRENT_PUBLIC_IP" ]; then
    echo "DuckDNS resolves to the current public IP."
    break
  fi

  sleep 15
done

mkdir -p /home/ec2-user/ai-ops-assistant-aws/backups/history
chown -R ec2-user:ec2-user /home/ec2-user/ai-ops-assistant-aws/backups

chmod +x /home/ec2-user/ai-ops-assistant-aws/scripts/backup_history.sh
chmod +x /home/ec2-user/ai-ops-assistant-aws/scripts/diagnose_deploy.sh

cat > /etc/cron.d/ai-ops-history-backup <<CRONEOF
*/30 * * * * ec2-user /home/ec2-user/ai-ops-assistant-aws/scripts/backup_history.sh >> /home/ec2-user/ai-ops-assistant-aws/backups/history/backup.log 2>&1
CRONEOF

chmod 644 /etc/cron.d/ai-ops-history-backup

mkdir -p /home/ec2-user/.ssh
chmod 700 /home/ec2-user/.ssh

grep -qxF "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIQvO3e4CepfYYKNgHmXCFjUPLoDfrVD8Q3D3jWwkGd5 github-actions-aiops" /home/ec2-user/.ssh/authorized_keys || \
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIQvO3e4CepfYYKNgHmXCFjUPLoDfrVD8Q3D3jWwkGd5 github-actions-aiops" >> /home/ec2-user/.ssh/authorized_keys

chown -R ec2-user:ec2-user /home/ec2-user/.ssh
chmod 600 /home/ec2-user/.ssh/authorized_keys

if [ -f "$CERT_PATH" ]; then
  echo "Existing certificate found at $CERT_PATH. Skipping Certbot."
elif [ -z "$CURRENT_PUBLIC_IP" ]; then
  echo "Could not determine current public IP. Skipping Certbot. HTTP site remains available."
elif [ "$DUCKDNS_RESOLVED_IP" != "$CURRENT_PUBLIC_IP" ]; then
  echo "DuckDNS does not resolve to this instance yet. Skipping Certbot to avoid failed/rate-limited requests. HTTP site remains available."
elif ! nginx -t; then
  echo "Nginx config is not valid before Certbot. Skipping Certbot. HTTP site remains available."
elif ! systemctl is-active --quiet nginx; then
  echo "Nginx is not running before Certbot. Skipping Certbot. HTTP site remains available if Nginx can be restarted manually."
else
  echo "No existing certificate found and DuckDNS is ready. Running Certbot."
  cp "$NGINX_CONF" "$NGINX_CONF.http-backup"
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    -m admin@${duckdns_domain}.duckdns.org \
    -d ${duckdns_domain}.duckdns.org
  CERTBOT_STATUS=$?

  if [ "$CERTBOT_STATUS" -eq 0 ]; then
    echo "Certbot completed successfully."
    if nginx -t; then
      systemctl reload nginx
      echo "Nginx reloaded with HTTPS configuration."
    else
      echo "Nginx config failed after Certbot. Restoring HTTP config."
      cp "$NGINX_CONF.http-backup" "$NGINX_CONF"
      nginx -t && systemctl restart nginx
    fi
  else
    echo "Certbot failed or was rate-limited. Restoring/keeping HTTP site available."
    cp "$NGINX_CONF.http-backup" "$NGINX_CONF"
    nginx -t && systemctl restart nginx
  fi
fi
