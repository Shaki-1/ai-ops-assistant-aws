# Architecture Diagram

```mermaid
flowchart TD
    User["User Browser"] --> DuckDNS["DuckDNS Domain"]
    DuckDNS --> HTTPS["HTTPS / Lets Encrypt"]
    HTTPS --> Nginx["Nginx Reverse Proxy"]

    Nginx --> Frontend["Static Frontend Dashboard"]
    Nginx --> API["Node.js Express Backend"]

    API --> PM2["PM2 Process Manager"]
    API --> Groq["Groq AI API"]

    Terraform["Terraform"] --> EC2["AWS EC2 Instance"]
    EC2 --> Nginx
    EC2 --> API
    EC2 --> DuckScript["DuckDNS Update Script"]
    EC2 --> Certbot["Certbot HTTPS Setup"]
```md

## Request Flow
1. User opens the DuckDNS domain.
2. HTTPS traffic reaches Nginx.
3. Nginx serves the frontend and proxies /api requests.
4. The Node.js backend processes diagnostics.
5. The backend calls Groq for AI analysis.
6. PM2 keeps the backend process running.
7. Terraform rebuilds the full infrastructure when needed.
