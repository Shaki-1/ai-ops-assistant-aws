#!/bin/bash

dnf update -y
dnf install -y nginx git nodejs20 npm

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
GROQ_API_KEY=REPLACE_ME_AFTER_DEPLOYMENT
GROQ_MODEL=llama-3.1-8b-instant
PORT=3000
ENVEOF

pm2 start server.js --name ai-ops-backend
pm2 save

cat > /etc/nginx/conf.d/ai-ops-assistant.conf <<NGINXEOF
server {
    listen 80;
    server_name _;

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
systemctl restart nginx
