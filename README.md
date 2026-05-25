# AI Ops Assistant (AWS Deployment)

## Overview

AI Ops Assistant is a full-stack cloud-based application designed to help system administrators analyze logs, diagnose issues, and generate troubleshooting recommendations using AI.

The system is deployed on AWS EC2 and integrates a modern frontend, a Node.js backend, and an external AI provider (Groq) for real-time analysis.

---

## Live Demo

http://YOUR_EC2_PUBLIC_DNS

---

## Architecture
Browser (Frontend)
↓
Nginx (Reverse Proxy - Port 80)
↓
Node.js Backend (PM2 - Port 3000)
↓
Groq API (AI Processing)

---

## Features

- Real-time server monitoring (`/api/status`)
- Log analysis using AI
- Root cause identification
- Recommended troubleshooting steps
- Safe command generation (read-only)
- Incident report generation
- Interactive web dashboard

---

## Technologies Used

- **Cloud**: AWS EC2 (t3.micro)
- **Infrastructure**: Terraform
- **Backend**: Node.js + Express
- **Process Manager**: PM2
- **Frontend**: HTML, CSS, JavaScript
- **Web Server**: Nginx (reverse proxy)
- **AI Provider**: Groq API (OpenAI-compatible)

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_REPO.git
cd ai-ops-assistant-aws

### 2. Configure environment variables  

Create a .env file in the backend/ folder:

cp backend/.env.example backend/.env

Edit it:

AI_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.1-8b-instant
PORT=3000

3. Install backend dependencies
cd backend
npm install
4. Start backend with PM2
pm2 start server.js --name ai-ops-backend
pm2 save
5. Configure Nginx

Ensure Nginx proxies API requests:

location /api/ {
    proxy_pass http://localhost:3000/api/;
}

Restart Nginx:

sudo systemctl restart nginx
6. Deploy frontend
sudo cp -r frontend/* /usr/share/nginx/html/
Usage

Open the application in your browser:

http://YOUR_EC2_PUBLIC_DNS
Example log input
nginx: connect() failed (111: Connection refused) while connecting to upstream

Click Analyze System Logs to receive AI-powered diagnostics.

Known Limitations
Requires an external AI API (Groq)
No authentication system (educational project)
Limited scalability on t3.micro instance
No persistent storage for logs or reports
Design Decisions
Why not Ollama?

Initially, the project used Ollama for local AI inference.

However:

t3.micro has limited RAM (~1GB)
Running models locally caused:
instability
crashes
disk pressure
Solution

The system was redesigned to use Groq API, which:

Offloads AI computation externally
Requires no local model hosting
Improves stability and performance
Security Considerations
.env files are excluded from Git
API keys are never committed
Example environment file provided (.env.example)
Reverse proxy prevents direct backend exposure
Future Improvements
Add user authentication
Store logs and reports (database)
Add role-based access control
Improve UI/UX
Add alerting/monitoring system
Educational Purpose

This project demonstrates:

Cloud deployment (AWS)
Infrastructure as Code (Terraform)
Reverse proxy configuration (Nginx)
Backend API development
AI integration
Debugging and system recovery

Author
Laura M

This project is for educational use.
