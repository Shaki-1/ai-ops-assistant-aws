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

cat > .env <<ENVEOF
AI_PROVIDER=groq
GROQ_API_KEY=${groq_api_key}
GROQ_MODEL=llama-3.1-8b-instant
PORT=3000
ENVEOF

pm2 start server.js --name ai-ops-backend
pm2 save

pm2 startup systemd -u ec2-user --hp /home/ec2-user
env PATH=$PATH:/usr/bin pm2 save

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


certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  -m admin@shaki-aiops.duckdns.org \
  -d ${duckdns_domain}.duckdns.org
