# AI Ops Assistant

**AI Ops Assistant** is a modern, professional web dashboard designed to help junior network technicians and system administrators safely diagnose system logs, review server health, generate educational troubleshooting playbooks, and draft formal incident reports. 

The tool uses a **Node.js/Express backend** powered by **OpenAI GenAI APIs** (or local mock equivalents) and a **custom dark-slate enterprise frontend** designed with zero external runtime dependencies.

---

## Key Features

1. **Server Health Telemetry**: Live polling of host resources, tracking uptime, RAM allocation, and local disk space metrics directly.
2. **AI Log Analyzer**: High-precision JSON parsing of syslog, auth.log, journalctl, Nginx error.log, or custom application trace logs. Returns clear summaries, severity classification, root causes, security warnings, and diagnostic confidence metrics.
3. **Safety-First Command Generator**: Generates safe, non-destructive check and verification scripts. Backed by system-prompt guidelines AND a backend regex gateway filter that blocks hazardous operations (e.g. `rm -rf`, `mkfs`, `dd`, `chmod 777 /`) and replaces them with warnings.
4. **Professional Incident Report Compiler**: Outputs formal, client-ready markdown reports suitable for executive review.
5. **No-Code Offline Demo Capability**: Operates in fully interactive mock mode if an API key is not supplied, allowing developers to immediately test typical incident templates (Nginx 502, SSH Bruteforce, Linux memory spikes, Apache 403 blocks).

---

## Architectural Layout

```
                        [ Junior Administrator Web Interface ]
                         /                  |               \
                        /                   |                \
        [ GET /api/status ]      [ POST /api/analyze-log ]  [ POST /generate-* ]
                      |                     |                    |
                      v                     v                    v
         [ Server Diagnostics ]     [ OpenAI LLM API ]   [ Safety Regular Expression Gateway ]
         (RAM, Disk, Uptime)       (JSON Structured)     (Blocks destructive commands)
```

---

## Technical Project Structure

```
ai-ops-assistant/
├── backend/
│   ├── prompts/
│   │   └── systemPrompt.js   # Highly specific instructions & structured schemas
│   ├── .env.example          # Environment layout details
│   ├── package.json          # Node package dependencies & ESM setups
│   └── server.js             # Main server logic, endpoint routing, and safety gateway
├── frontend/
│   ├── index.html            # Grid layouts, inline offline SVGs, panel components
│   ├── style.css             # Enterprise dark slate dashboard design
│   └── app.js                # Markdown parsers, telemetry poller, and event handlers
└── README.md                 # Primary system documentation
```

---

## Getting Started Locally

Follow these steps to set up and run the AI Ops Assistant on your local development machine:

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 18+ recommended)
- A modern web browser

### 1. Backend Setup & Dependency Installation
Navigate to the `backend/` folder and install packages:
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Copy the `.env.example` file to create a `.env` configuration:
```bash
cp .env.example .env
```
Open the `.env` file in your preferred text editor and configure parameters:
```env
PORT=3000
OPENAI_API_KEY=your_actual_openai_api_key_here
# Optional customization:
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1
```

> [!NOTE]
> **Demo/Mock Mode:** If you do not have an active OpenAI API key, you can leave the `.env` file with placeholders. The backend will automatically run in **DEMO mode** using high-quality local mock playbooks, enabling complete testing of all features instantly.

### 3. Start the Server
Run the local dev command inside `backend/`:
```bash
npm start
```
You should see confirmation output in your terminal:
```
================================================================
  AI Ops Assistant Server is active!
  Local Endpoint: http://localhost:3000
  Mode:           LIVE API (OpenAI active)
================================================================
```

### 4. Serve the Frontend Dashboard
Since the frontend consists of static `HTML`, `CSS`, and `JS` files, you can launch the app by simply opening `frontend/index.html` directly in your browser, or serving it with a light local server:
```bash
# Example using Python:
cd ../frontend
python -m http.server 8080
```
Open your browser and navigate to: `http://localhost:8080` (or double-click `index.html` to open it locally).

---

## Production AWS Deployment Plan

To transition the AI Ops Assistant to a robust, publicly accessible environment on AWS, follow this production architecture plan:

### Infrastructure Architecture
- **Host Provider:** AWS EC2 Instance (t3.micro is sufficient for basic operations).
- **Process Manager:** PM2 (to monitor and automatically restart the Node.js application process).
- **Reverse Proxy / Web Server:** Nginx (to handle external web requests on port 80/443, serve static frontend assets directly, and reverse-proxy API requests to Node).
- **Security:** Let's Encrypt (Certbot) for automatic SSL certificate generation.

### 1. EC2 Instance Provisioning
1. Launch an AWS EC2 instance running **Ubuntu Server 22.04 LTS**.
2. Update Security Groups to allow incoming traffic on ports:
   - **`22`** (SSH for system administration)
   - **`80`** (HTTP for web traffic and ACME SSL verification)
   - **`443`** (HTTPS secure web traffic)

### 2. Host Server Preparation
Log in to your instance via SSH and install required utilities:
```bash
# Update local package definitions
sudo apt update && sudo apt upgrade -y

# Install Node.js (via NodeSource setup)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Nginx and Git
sudo apt install nginx git -y
```

### 3. Application Deployment & Environment Setup
Clone the application code to a standard location, such as `/var/www/`:
```bash
cd /var/www
sudo git clone https://github.com/your-username/ai-ops-assistant.git
sudo chown -R $USER:$USER /var/www/ai-ops-assistant

# Install backend files
cd ai-ops-assistant/backend
npm install --production

# Create production env
nano .env
```
Ensure your production `.env` is loaded with active secrets (such as production API keys) and restricted file access:
```bash
chmod 600 .env
```

### 4. Configure Process Manager (PM2)
To ensure the backend Node server survives server restarts and unexpected application crashes, run it under PM2:
```bash
sudo npm install -g pm2
pm2 start server.js --name "ai-ops-backend"

# Configure PM2 to launch automatically on system boot
pm2 startup systemd
# (Run the system command prompt output by the startup script, then save configuration)
pm2 save
```

### 5. Nginx Reverse Proxy Setup
Remove default Nginx templates and write a custom site config that serves the frontend files statically and forwards API requests:
```bash
sudo rm /etc/nginx/sites-enabled/default
sudo nano /etc/nginx/sites-available/ai-ops
```
Paste this configuration, replacing `yourdomain.com` with your active domain or public EC2 IP:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Serve static frontend assets directly
    location / {
        root /var/www/ai-ops-assistant/frontend;
        index index.html;
        try_files $uri $uri/ =404;
    }

    # Reverse proxy backend API calls to local port 3000
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
Enable the site configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/ai-ops /etc/nginx/sites-enabled/
sudo nginx -t # Verifies syntax health
sudo systemctl restart nginx
```

### 6. SSL Cryptographic Pairing (Certbot)
Use Certbot to secure user dashboard interactions under HTTPS:
```bash
sudo apt install snapd
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Auto-apply SSL configurations inside Nginx virtualhosts
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Your **AI Ops Assistant** dashboard is now securely deployed on AWS, using Nginx to handle high-performance direct web caching and PM2 maintaining Node backend services.
