# Features

## Authentication and Roles

AI Ops Assistant supports admin and limited user roles. The backend issues JWTs after login and exposes `/api/me` so the frontend can validate saved sessions before restoring protected views.

Admin users can access operational dashboards, security views, full history, alerts, reports, timeline data, and administrative ticket controls.

Limited users can use the analyzer, simulation training, and support/ticket workflows without seeing admin-only operational data.

## Log Analyzer

The analyzer accepts logs, command output, diagnostic samples, and simulation incident text. The backend classifies context before calling AI so quick checks are analyzed as diagnostic output instead of being mistaken for unknown commands.

## AI Troubleshooting Result

AI responses are structured around:

- Summary
- Severity
- Evidence
- Likely cause
- Recommended checks
- Safe commands
- Next action
- Escalation criteria

The frontend renders these results in a dedicated result panel.

## Quick Diagnostic Checks

Quick checks insert realistic diagnostic samples for areas such as:

- Nginx
- Backend API
- Disk
- Memory
- SSH
- CPU load
- API latency
- HTTPS certificate
- DNS/DuckDNS
- Auth logs
- Failed requests
- PM2
- System updates
- Firewall/security group
- Node.js runtime
- Storage permissions
- Recent errors

These are safe training samples and do not execute commands from the browser.

## Collapsible Workspace

The Log Analyzer input panel can collapse after analysis starts so the result panel remains readable. The operations side panel can also be hidden to give more workspace to the analyzer.

## Resource Dashboard

The dashboard shows live CPU, RAM, disk, request health, latency, process memory, runtime status, and backend health. It uses WebSocket updates when available and REST fallback when WebSocket is unavailable.

## Operational Alerts

The backend evaluates lightweight in-memory alerts from live metrics. Alerts include severity, source, value, threshold, status, and timestamps. Admins can acknowledge alerts.

## AI Metrics Insight

Admins can ask AI to analyze the latest metrics and return health, risks, recommendations, priority actions, and confidence.

## Security Center

Security Center provides defensive, non-intrusive status checks:

- HTTPS protocol
- API status
- Metrics availability
- Auth/session status
- Current host/domain
- Frontend protocol
- Recommended public ports
- Backend exposure reminder
- Certificate/rate-limit reminder
- Data handling reminder

It does not run port scans or offensive checks.

## Simulation Lab

Simulation Mode provides training scenarios without changing real server state. Scenarios include availability, performance, web/proxy, and security topics. Selected scenarios can be analyzed by the existing analyzer flow and appear as simulated context on the analyzer page.

## Inbox and Tickets

Users can submit tickets, suggestions, and feedback. Admins can view, reply, update status, mark as read, and delete tickets. Users can view their own tickets and admin replies.

Unread notification badges show only unread activity.

## Incident Timeline

The timeline records sanitized operational events such as logins, AI analysis, simulation analysis, ticket actions, alert actions, metrics AI analysis, and security review activity. Admins can filter timeline entries.

## AI Remediation Plans

After an analysis, the app can generate a defensive remediation plan with immediate actions, verification commands, rollback notes, risks, and escalation criteria. The app does not execute commands.

## Governance & Data Use

The Governance page reminds users not to paste secrets or personal data, explains responsible AI usage, and supports local acknowledgement history export.

## Backup and Restore

Scripts support exporting and importing file-backed app data. Local EC2 backups do not survive `terraform destroy`, so archives must be copied off the instance before destroy.

## Deployment Tooling

Terraform provisions AWS EC2 infrastructure. GitHub Actions can deploy code updates to EC2. Diagnostic scripts help confirm PM2, Nginx, `/api/status`, `/ws`, DuckDNS, and Certbot behavior.
