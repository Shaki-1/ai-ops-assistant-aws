#!/bin/bash

dnf update -y
dnf install -y nginx git nodejs20 npm certbot python3-certbot-nginx

systemctl enable nginx
systemctl start nginx

npm install -g pm2

cd /home/ec2-user
rm -rf ai-ops-assistant-aws
git clone https://github.com/Shaki-1/ai-ops-assistant-aws ai-ops-assistant-aws
cd /home/ec2-user/ai-ops-assistant-aws/backend
npm install

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

sudo -u ec2-user bash -lc '
  cd /home/ec2-user/ai-ops-assistant-aws/backend
  pm2 start server.js --name ai-ops-backend --update-env
  pm2 save
'

pm2 startup systemd -u ec2-user --hp /home/ec2-user
systemctl enable pm2-ec2-user


cat > /etc/nginx/conf.d/ai-ops-assistant.conf <<NGINXEOF
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
}
NGINXEOF

rm -f /etc/nginx/conf.d/default.conf

chmod o+x /home/ec2-user
chmod -R o+rx /home/ec2-user/ai-ops-assistant-aws/frontend

systemctl restart nginx

cat > /home/ec2-user/duckdns.sh <<DUCKEOF

#!/bin/bash
curl "https://www.duckdns.org/update?domains=${duckdns_domain}&token=${duckdns_token}&ip=" -o /home/ec2-user/duckdns.log
DUCKEOF

chmod +x /home/ec2-user/duckdns.sh
chown ec2-user:ec2-user /home/ec2-user/duckdns.sh

/home/ec2-user/duckdns.sh

mkdir -p /home/ec2-user/ai-ops-assistant-aws/backups/history
chown -R ec2-user:ec2-user /home/ec2-user/ai-ops-assistant-aws/backups

chmod +x /home/ec2-user/ai-ops-assistant-aws/scripts/backup_history.sh

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



CERT_PATH="/etc/letsencrypt/live/${duckdns_domain}.duckdns.org/fullchain.pem"

if [ -f "$CERT_PATH" ]; then
  echo "Existing certificate found at $CERT_PATH. Skipping Certbot."
else
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    -m admin@${duckdns_domain}.duckdns.org \
    -d ${duckdns_domain}.duckdns.org || echo "Certbot failed or rate-limited. HTTP site remains available."
fi
