# AI Ops Assistant (AWS Deployment)

## Overview

AI Ops Assistant is a cloud-based application designed to help system administrators analyze logs, diagnose issues, and generate troubleshooting recommendations using AI.

The application is deployed on AWS EC2 and combines a frontend dashboard, a Node.js backend, and an external AI provider (Groq) to deliver real-time insights.

---

## Live Demo

http://YOUR_EC2_PUBLIC_DNS

---

## Architecture

Browser → Nginx → Node.js (PM2) → Groq API

- **Nginx** serves the frontend and proxies API requests  
- **Node.js backend** processes requests and communicates with AI  
- **Groq API** performs AI inference  
- **PM2** ensures backend stability  

---

## Features

- Real-time server monitoring (`/api/status`)
- AI-powered log analysis
- Root cause identification
- Troubleshooting recommendations
- Safe command suggestions (read-only)
- Incident report generation
- Interactive dashboard

---

## Tech Stack

- AWS EC2 (t3.micro)
- Terraform (infrastructure provisioning)
- Node.js + Express
- PM2 (process manager)
- Nginx (reverse proxy)
- HTML / CSS / JavaScript
- Groq API (AI provider)

---

## Setup Guide

### 1. Clone repository

```bash
git clone https://github.com/YOUR_REPO.git
cd ai-ops-assistant-aws
```
2. Configure environment
```
cp backend/.env.example backend/.env
```
Edit .env:
```
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.1-8b-instant
PORT=3000
```
3. Install backend
```
cd backend
npm install
```
4. Start backend
```
pm2 start server.js --name ai-ops-backend
pm2 save
```
5. Configure Nginx
```
Add:

location /api/ {
    proxy_pass http://localhost:3000/api/;
}
```
Restart:
```
sudo systemctl restart nginx
```
6. Deploy frontend
```
sudo cp -r frontend/* /usr/share/nginx/html/
```
Usage

Open:

http://YOUR_EC2_PUBLIC_DNS

Example log input:

nginx: connect() failed (111: Connection refused) while connecting to upstream

Click Analyze System Logs to get AI diagnostics.

## What Was Tried

During development, multiple approaches were tested:

Local AI with Ollama
Installed Ollama on EC2
Tested small models (qwen2.5:0.5b)
Integrated API calls in backend

Result:
High memory usage
Frequent crashes
Server instability
Disk pressure issues
OpenAI API
Attempted integration with OpenAI
Encountered quota limitations
Result:
Not usable due to API limits

# Several critical issues were identified and resolved:
Infrastructure Issues
EC2 instability due to low resources
Fixed by removing local AI models
Backend Issues
Syntax errors breaking server
Fixed using node --check and rollback
Nginx Issues
502 Bad Gateway → backend not running
500 Internal Error → permission problems
API routing issues (/api path mismatch)
Frontend Issues
Demo mode always active
Fixed API endpoint from localhost → /api
Git & Security
.env accidentally included
Fixed with .gitignore and key rotation

---

# Final Solution
The system was redesigned to:
Remove local AI (Ollama)
Use Groq API instead
Keep backend lightweight
Improve stability and scalability

---

# What Was Learned
This project provided hands-on experience with:
Cloud deployment (AWS EC2)
Infrastructure as Code (Terraform)
Reverse proxy configuration (Nginx)
Backend API design (Node.js)
AI integration (Groq / OpenAI-compatible APIs)
Debugging production issues
System stability and resource management
Security best practices (API keys, .env)
Limitations
Requires external AI API (Groq)
No authentication system
Limited scalability (t3.micro)
No persistent storage for logs

---

## Future Improvements
Add authentication (login system)
Store logs and reports in a database
Improve UI/UX
Add monitoring and alerting
Deploy using Docker or Kubernetes
Security
.env files are not committed
API keys are protected
Backend is not directly exposed (via Nginx)

---

## Author
Laura
