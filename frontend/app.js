/**
 * AI Ops Assistant - Frontend Application Logic
 * Implements real-time server polling, demo log injections,
 * markdown parsing, copy behaviors, and diagnostic workflows.
 * 
 * NOTE: Seamless Offline Mode integrated. If the backend server is 
 * not running (Failed to fetch), the application automatically falls 
 * back to a local simulation engine to guarantee functional demonstrations.
 */

const API_BASE_URL = '/api';

const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const appHomeBtn = document.getElementById('app-home-btn');
const dashboardViewBtn = document.getElementById('dashboard-view-btn');
const securityCenterBtn = document.getElementById('security-center-btn');
const inboxViewBtn = document.getElementById('inbox-view-btn');
const timelineViewBtn = document.getElementById('timeline-view-btn');
const auditLogsViewBtn = document.getElementById('audit-logs-view-btn');
const backToAnalyzerBtn = document.getElementById('back-to-analyzer-btn');
const securityBackBtn = document.getElementById('security-back-btn');
const inboxBackBtn = document.getElementById('inbox-back-btn');
const timelineBackBtn = document.getElementById('timeline-back-btn');
const auditLogsBackBtn = document.getElementById('audit-logs-back-btn');
const governanceBackBtn = document.getElementById('governance-back-btn');
const footerComplianceLink = document.getElementById('footer-compliance-link');
const operationsPanel = document.getElementById('operations-panel');
const operationsToggleBtn = document.getElementById('operations-toggle-btn');
const simulationToggleBtn = document.getElementById('simulation-toggle-btn');
const simulationLabBtn = document.getElementById('simulation-lab-btn');
const simulationBackBtn = document.getElementById('simulation-back-btn');
const simulationActiveBadge = document.getElementById('simulation-active-badge');
const roleBadge = document.getElementById('role-badge');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const analyzerView = document.getElementById('analyzer-view');
const metricsDashboardView = document.getElementById('metrics-dashboard-view');
const simulationLabView = document.getElementById('simulation-lab-view');
const securityCenterView = document.getElementById('security-center-view');
const inboxView = document.getElementById('inbox-view');
const governanceView = document.getElementById('governance-view');
const timelineView = document.getElementById('timeline-view');
const auditLogsView = document.getElementById('audit-logs-view');

const VIEW_STORAGE_KEY = 'aiOpsActiveView';
const SIMULATION_STORAGE_KEY = 'aiOpsSimulationMode';
const GOVERNANCE_ACK_KEY = 'aiOpsGovernanceAcknowledgements';
const OPERATIONS_COLLAPSED_KEY = 'aiOpsOperationsPanelCollapsed';
const GOVERNANCE_VERSION = 'governance-v1';
const DEFAULT_VIEW = 'analyzer';
const VALID_VIEWS = new Set(['analyzer', 'dashboard', 'simulation', 'security', 'inbox', 'governance', 'timeline', 'audit']);
const INPUT_COLLAPSE_BREAKPOINT = 1180;

if (localStorage.getItem('authToken')) {
  loginScreen.classList.add('hidden');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  loginError.classList.add('hidden');

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();

    localStorage.setItem('authToken', data.token);
    localStorage.setItem('userRole', data.user?.role || 'user');
    localStorage.setItem('username', data.user?.username || username);

    const isValid = await validateSavedSession();

    if (!isValid) {
      throw new Error('Session validation failed');
    }

  } catch (error) {
    loginError.textContent = 'Invalid username or password.';
    loginError.classList.remove('hidden');
  }
});

logoutBtn.addEventListener('click', () => {
  performSessionLogout();
});

// Host Configuration

// Live Server Log Templates
const LOG_TEMPLATES = {
  'nginx-502': `2026-05-25 10:45:23 [error] 1420#1420: *4512 connect() failed (111: Connection refused) while connecting to upstream, client: 192.168.1.50, server: example.com, request: "GET /api/v1/metrics HTTP/1.1", upstream: "http://127.0.0.1:8000/api/v1/metrics", host: "example.com"\n2026-05-25 10:45:25 [error] 1420#1420: *4513 connect() failed (111: Connection refused) while connecting to upstream, client: 192.168.1.52, server: example.com, request: "POST /api/v1/auth HTTP/1.1", upstream: "http://127.0.0.1:8000/api/v1/auth", host: "example.com"`,
  
  'ssh-bruteforce': `May 25 10:55:01 admin-node sshd[8045]: Invalid user admin from 192.168.1.150 port 49282\nMay 25 10:55:02 admin-node sshd[8045]: Connection closed by invalid user admin 192.168.1.150 port 49282 [preauth]\nMay 25 10:55:04 admin-node sshd[8049]: Invalid user admin1 from 192.168.1.150 port 49286\nMay 25 10:55:05 admin-node sshd[8049]: Failed password for invalid user admin1 from 192.168.1.150 port 49286 ssh2\nMay 25 10:55:08 admin-node sshd[8055]: Invalid user oracle from 192.168.1.150 port 49290\nMay 25 10:55:09 admin-node sshd[8055]: Failed password for invalid user oracle from 192.168.1.150 port 49290 ssh2`,
  
  'linux-oom': `[10523.450122] Out of memory: Killed process 4056 (java) total-vm:4302196kB, anon-rss:2502140kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:8204kB oom_score_adj:0\n[10523.450250] oom_reaper: reaped process 4056 (java), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB\n[10523.450310] systemd[1]: tomcat.service: Main process exited, code=killed, status=9/KILL\n[10523.450450] systemd[1]: tomcat.service: Failed with result 'oom-killer'.`,
  
  'apache-forbidden': `[Mon May 25 11:02:14.298104 2026] [authz_core:error] [pid 1234:tid 5678] [client 192.168.1.60:50110] AH01630: client denied by server configuration: /var/www/html/secure/\n[Mon May 25 11:02:18.520412 2026] [autoindex:error] [pid 1234:tid 5682] [client 192.168.1.60:50110] AH01276: Cannot serve directory /var/www/html/secure/: No matching DirectoryIndex (index.html,index.php) found, and server-generated directory index forbidden by Options directive`
};

const QUICK_CHECK_INPUTS = {
  nginx: `Diagnostic source: Nginx service health quick check
Expected context: simulated/training output; evaluate whether Nginx is healthy or needs attention.
Command observed: systemctl status nginx --no-pager
Output:
nginx.service - The nginx HTTP and reverse proxy server
   Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled)
   Active: active (running) since Fri 2026-05-29 12:01:18 UTC; 2h 14min ago
   Main PID: 1420 (nginx)
   Listen sockets: 80/tcp and 443/tcp
   Last config test: nginx: configuration file /etc/nginx/nginx.conf test is successful
Quick check status: normal
Evidence: service is active, enabled, and config test succeeded.
Safe next checks: curl -I http://127.0.0.1, sudo nginx -t, sudo journalctl -u nginx -n 50 --no-pager`,

  backend: `Diagnostic source: Backend API/PM2 health quick check
Expected context: simulated/training output; determine whether the Node backend is serving API traffic.
Command observed: pm2 status ai-ops-backend && curl http://127.0.0.1:3000/api/status
Output:
pm2: ai-ops-backend online, pid 2187, uptime 2h, restarts 0, memory 86 MB
GET /api/status -> HTTP 200
Response appStatus: OK
Quick check status: normal
Evidence: PM2 process is online and local API health endpoint returns 200 OK.
Safe next checks: pm2 logs ai-ops-backend --lines 50 --nostream, curl -fsS http://127.0.0.1:3000/api/status`,

  disk: `Diagnostic source: Root filesystem capacity quick check
Expected context: simulated/training output; evaluate disk pressure and risk of write failures.
Command observed: df -h /
Output:
Filesystem      Size  Used Avail Use% Mounted on
/dev/xvda1       30G   18G   12G  61% /
Quick check status: normal
Evidence: root filesystem is 61% used, below warning and critical thresholds.
Safe next checks: df -h, du -sh /var/log/* 2>/dev/null | sort -h`,

  memory: `Diagnostic source: Memory pressure quick check
Expected context: simulated/training output; evaluate whether RAM usage indicates pressure.
Command observed: free -h
Output:
              total        used        free      shared  buff/cache   available
Mem:           957M        412M        178M         12M        367M        404M
Swap:            0B          0B          0B
Quick check status: normal
Evidence: approximately 404M remains available and no OOM events are shown.
Safe next checks: free -h, ps aux --sort=-%mem | head -10`,

  ssh: `Diagnostic source: SSH service health quick check
Expected context: simulated/training output; evaluate SSH service state and access risk.
Command observed: systemctl status sshd --no-pager
Output:
sshd.service - OpenSSH server daemon
   Loaded: loaded (/usr/lib/systemd/system/sshd.service; enabled)
   Active: active (running) since Fri 2026-05-29 11:58:00 UTC
   Listening on 0.0.0.0:22
Recent auth log: accepted publickey for ec2-user from trusted-admin-ip
Quick check status: normal
Evidence: SSH daemon is active and recent accepted login used public key authentication.
Safe next checks: sudo journalctl -u sshd -n 80 --no-pager, sudo grep -E "Failed|Accepted" /var/log/secure | tail -30`,

  'cpu-load': `Diagnostic source: CPU load quick check
Expected context: simulated/training output; evaluate whether CPU usage is healthy, warning, or critical.
Command observed: top -bn1 | head -20
Output:
top - 12:04:11 up 2 days, 4:18, 1 user, load average: 1.82, 1.44, 0.91
Tasks: 112 total, 2 running, 110 sleeping
%Cpu(s): 72.4 us, 8.6 sy, 0.0 ni, 18.5 id, 0.5 wa
PID USER      %CPU %MEM COMMAND
2187 ec2-user 68.3 14.1 node
Quick check status: warning
Evidence: CPU is elevated near the warning threshold but still below 90% critical saturation.
Safe next checks: uptime, top -o %CPU, pm2 logs ai-ops-backend --lines 50 --nostream`,

  'api-latency': `Diagnostic source: Backend API latency quick check
Expected context: simulated/training output; evaluate API reachability and latency.
Command observed: curl -w "status=%{http_code} time_total=%{time_total}s" -o /dev/null -s http://127.0.0.1:3000/api/status
Output:
status=200 time_total=1.284s
Quick check status: warning
Evidence: API is reachable with HTTP 200, but response time is 1284 ms, above the 1000 ms warning threshold.
Safe next checks: curl -w "@curl-format.txt" http://127.0.0.1:3000/api/status, pm2 monit, pm2 logs ai-ops-backend --lines 80 --nostream`,

  'https-cert': `Diagnostic source: HTTPS certificate quick check
Expected context: simulated/training output; evaluate whether HTTPS certificate is valid.
Command observed: certbot certificates
Output:
Certificate Name: example.duckdns.org
Domains: example.duckdns.org
Expiry Date: 2026-08-19 10:22:14+00:00 (VALID: 82 days)
Certificate Path: /etc/letsencrypt/live/example.duckdns.org/fullchain.pem
HTTPS handshake: verify return code: 0 (ok)
Quick check status: normal
Evidence: certificate exists, hostname matches, and expiry is not near.
Safe next checks: sudo certbot certificates, curl -I https://example.duckdns.org`,

  'dns-duckdns': `Diagnostic source: DNS and DuckDNS quick check
Expected context: simulated/training output; evaluate whether DNS points to the current server.
Command observed: dig +short example.duckdns.org
Output:
Current EC2 public IP: 203.0.113.42
DuckDNS resolved IP: 203.0.113.42
DuckDNS update response: OK
Quick check status: normal
Evidence: DNS resolved IP matches the current EC2 public IP.
Safe next checks: dig +short example.duckdns.org, curl -I http://example.duckdns.org`,

  'auth-logs': `Diagnostic source: SSH authentication log quick check
Expected context: simulated/training output; evaluate whether auth activity is normal or suspicious.
Command observed: sudo journalctl -u sshd --since "1 hour ago" --no-pager
Output:
May 29 12:11:02 host sshd[2214]: Failed password for invalid user admin from 198.51.100.17 port 55142 ssh2
May 29 12:11:05 host sshd[2218]: Failed password for invalid user oracle from 198.51.100.17 port 55146 ssh2
May 29 12:11:11 host sshd[2226]: Accepted publickey for ec2-user from 203.0.113.10 port 51220 ssh2
Quick check status: warning
Evidence: two failed invalid-user attempts were followed by a public-key login that should be verified.
Safe next checks: sudo grep -E "Failed|Accepted" /var/log/secure | tail -50, who, last -a | head`,

  'failed-requests': `Diagnostic source: Nginx failed request quick check
Expected context: simulated/training output; evaluate whether recent HTTP failures indicate a proxy/backend issue.
Command observed: tail -40 /var/log/nginx/access.log | awk '$9 >= 500'
Output:
203.0.113.15 - - [29/May/2026:12:18:44 +0000] "POST /api/analyze-log HTTP/1.1" 502 157
203.0.113.15 - - [29/May/2026:12:18:46 +0000] "GET /api/metrics HTTP/1.1" 502 157
GET /api/status checked afterward -> HTTP 200
Quick check status: warning
Evidence: recent 502 responses occurred, but later health check recovered to 200 OK.
Safe next checks: sudo tail -80 /var/log/nginx/error.log, pm2 logs ai-ops-backend --lines 80 --nostream`,

  'pm2-process': `Diagnostic source: PM2 process quick check
Expected context: simulated/training output; evaluate process state and restart risk.
Command observed: pm2 status ai-ops-backend && pm2 logs ai-ops-backend --lines 20 --nostream
Output:
App name: ai-ops-backend
Status: online
Restarts: 1
Uptime: 2h
Recent logs: server listening on port 3000; no uncaught exceptions in last 20 lines
Quick check status: normal
Evidence: process is online with low restart count and no recent crash stack traces.
Safe next checks: pm2 status, pm2 logs ai-ops-backend --lines 50 --nostream`,

  'system-updates': `Diagnostic source: System package update quick check
Expected context: simulated/training output; evaluate patching need without treating it as an outage.
Command observed: dnf check-update --security
Output:
Security updates available:
openssl.x86_64  1:3.2.2-6.amzn2023
nginx.x86_64    1:1.26.2-1.amzn2023
No active service failures observed.
Quick check status: warning
Evidence: security updates are available, but this is maintenance risk rather than an active outage.
Safe next checks: sudo dnf check-update --security, schedule a maintenance window before applying updates`,

  firewall: `Diagnostic source: Firewall/security group posture quick check
Expected context: simulated/training output; evaluate exposure risk defensively.
Command observed: reviewed intended inbound rules
Output:
22/tcp SSH: open to 0.0.0.0/0
80/tcp HTTP: open to 0.0.0.0/0
443/tcp HTTPS: open to 0.0.0.0/0
3000/tcp backend: no public rule detected; expected behind Nginx
Quick check status: warning
Evidence: backend port is not public, but SSH is open broadly and should be restricted for production.
Safe next checks: review EC2 security group inbound rules, restrict SSH to trusted IPs/VPN`,

  'node-runtime': `Diagnostic source: Node.js runtime quick check
Expected context: simulated/training output; evaluate whether the runtime can start the backend.
Command observed: node --version && npm --version && node --check backend/server.js
Output:
node: v20.18.1
npm: 10.8.2
backend/server.js syntax check: passed
package dependency check: ws dependency present
Quick check status: normal
Evidence: Node runtime is present, syntax is valid, and WebSocket dependency is available.
Safe next checks: node --check backend/server.js, npm ls ws --omit=dev`,

  'storage-permissions': `Diagnostic source: App storage permissions quick check
Expected context: simulated/training output; evaluate whether file-backed data can be read/written.
Command observed: ls -ld backend/data /home/ec2-user/backups/app-data frontend
Output:
drwxr-xr-x ec2-user ec2-user backend/data
drwxr-xr-x ec2-user ec2-user /home/ec2-user/backups/app-data
drwxr-xr-x ec2-user ec2-user frontend
Data files: tickets.json and timeline.json exist or will be initialized by restore_app_data.sh
Quick check status: normal
Evidence: app data and backup directories are owned by ec2-user and readable by the backend process.
Safe next checks: ls -la backend/data, test -w backend/data`,

  'recent-errors': `Diagnostic source: Recent service error quick check
Expected context: simulated/training output; evaluate recent logs for active outage signals.
Command observed: journalctl -u nginx --since "30 minutes ago"; pm2 logs ai-ops-backend --lines 30 --nostream
Output:
nginx: no recent errors in selected window
ai-ops-backend: [WARN] AI provider latency exceeded 1200 ms for one request
ai-ops-backend: request recovered successfully; subsequent /api/status returned 200
Quick check status: warning
Evidence: no active Nginx outage; one recovered AI latency warning should be monitored.
Safe next checks: pm2 logs ai-ops-backend --lines 100 --nostream, curl -fsS http://127.0.0.1:3000/api/status`
};

const QUICK_CHECK_LABELS = {
  nginx: 'Nginx service health',
  backend: 'Backend API health',
  disk: 'Disk capacity',
  memory: 'Memory usage',
  ssh: 'SSH service health',
  'cpu-load': 'CPU load',
  'api-latency': 'API latency',
  'https-cert': 'HTTPS certificate',
  'dns-duckdns': 'DNS / DuckDNS',
  'auth-logs': 'Authentication logs',
  'failed-requests': 'Failed API requests',
  'pm2-process': 'PM2 process health',
  'system-updates': 'System updates',
  firewall: 'Firewall / security group',
  'node-runtime': 'Node.js runtime',
  'storage-permissions': 'Storage permissions',
  'recent-errors': 'Recent service errors'
};

function buildQuickCheckInput(type) {
  const sample = QUICK_CHECK_INPUTS[type];

  if (!sample) {
    return '';
  }

  return [
    'Input type: quick_check diagnostic output',
    `Diagnostic type: ${QUICK_CHECK_LABELS[type] || type}`,
    'Expected interpretation: analyze the observed output from known tools; do not treat the command text itself as an unknown command unless the output explicitly says command not found, unknown option, invalid command, or not recognized.',
    '',
    sample
  ].join('\n');
}

const SIMULATION_SCENARIOS = [
  {
    id: 'server-down',
    category: 'Availability',
    title: 'Server Down',
    level: 'Critical',
    summary: 'Primary web service is unreachable and returning connection failures.',
    metrics: { cpu: 12, ram: 48, disk: 62, latency: 0 },
    log: `SIMULATED INCIDENT: Server Down
curl http://localhost:3000/api/status
Output: connection refused
systemctl status ai-ops-backend
Active: inactive (dead)
Recent event: backend process stopped unexpectedly.`,
    commentary: {
      symptom: 'Users cannot reach the application API or receive connection refused responses.',
      causes: ['Backend process stopped', 'Port binding changed', 'Service failed during restart'],
      checks: ['Check PM2 process status', 'Inspect backend logs', 'Confirm port 3000 is listening'],
      risk: 'Critical',
      nextAction: 'Restore the backend process and verify the API health endpoint.'
    }
  },
  {
    id: 'high-cpu',
    category: 'Performance',
    title: 'High CPU Load',
    level: 'Warning',
    summary: 'CPU load is elevated and API responses may become slower.',
    metrics: { cpu: 91, ram: 58, disk: 63, latency: 740 },
    log: `SIMULATED INCIDENT: High CPU Load
top snapshot:
node process using 91% CPU
Average API latency: 740 ms
Status: degraded but still responding.`,
    commentary: {
      symptom: 'Requests are still completing, but CPU saturation may delay responses.',
      causes: ['Expensive AI request burst', 'Looping background job', 'Too many concurrent requests'],
      checks: ['Inspect top CPU processes', 'Review recent traffic spikes', 'Check PM2 logs for loops'],
      risk: 'Warning',
      nextAction: 'Identify the highest CPU consumer and throttle or restart only if needed.'
    }
  },
  {
    id: 'memory-pressure',
    category: 'Performance',
    title: 'Memory Pressure',
    level: 'Warning',
    summary: 'RAM usage is high and the server may become unstable if it continues rising.',
    metrics: { cpu: 38, ram: 84, disk: 64, latency: 420 },
    log: `SIMULATED INCIDENT: Memory Pressure
free -h
Mem: total 1.0G, used 860M, available 120M
No OOM kill observed.
Status: warning threshold reached.`,
    commentary: {
      symptom: 'Available memory is low, increasing risk of slowdowns or process restarts.',
      causes: ['Large request payloads', 'Memory leak', 'Too many retained report objects'],
      checks: ['Inspect process memory', 'Review recent request volume', 'Check for repeated restarts'],
      risk: 'Warning',
      nextAction: 'Watch process memory trend and restart the leaking process only after collecting logs.'
    }
  },
  {
    id: 'disk-full',
    category: 'Performance',
    title: 'Disk Almost Full',
    level: 'Critical',
    summary: 'Disk usage is near capacity and writes may fail soon.',
    metrics: { cpu: 22, ram: 55, disk: 94, latency: 300 },
    log: `SIMULATED INCIDENT: Disk Almost Full
df -h /
Filesystem Size Used Avail Use% Mounted on
/dev/xvda1 30G 28G 1.8G 94% /
Large backup/history logs detected.`,
    commentary: {
      symptom: 'The root volume has very little free space remaining.',
      causes: ['Unrotated logs', 'Large backup history', 'Temporary files accumulating'],
      checks: ['Check largest directories', 'Review backup retention', 'Inspect log rotation'],
      risk: 'Critical',
      nextAction: 'Free safe log/archive space and confirm disk usage falls below alert threshold.'
    }
  },
  {
    id: 'nginx-502',
    category: 'Web/Proxy',
    title: 'Nginx 502 Gateway Error',
    level: 'Critical',
    summary: 'Nginx is online but cannot reach the upstream backend.',
    metrics: { cpu: 18, ram: 47, disk: 61, latency: 0 },
    log: LOG_TEMPLATES['nginx-502'],
    commentary: {
      symptom: 'Browser traffic reaches Nginx, but API proxying fails with 502 errors.',
      causes: ['Backend process down', 'Wrong upstream port', 'Nginx proxy route mismatch'],
      checks: ['Check backend process status', 'Confirm localhost:3000 responds', 'Review Nginx error log'],
      risk: 'Critical',
      nextAction: 'Restore backend reachability, then reload Nginx only if config changed.'
    }
  },
  {
    id: 'backend-api-down',
    category: 'Availability',
    title: 'Backend API Down',
    level: 'Critical',
    summary: 'Frontend loads, but protected API calls fail.',
    metrics: { cpu: 14, ram: 45, disk: 60, latency: 0 },
    log: `SIMULATED INCIDENT: Backend API Down
GET /api/status -> no response
GET /api/metrics -> 502 Bad Gateway
pm2 status: ai-ops-backend errored
Recent logs: server failed during startup.`,
    commentary: {
      symptom: 'The static site is available but API-dependent features fail.',
      causes: ['Backend crash', 'Missing environment variable', 'Node dependency/startup issue'],
      checks: ['Inspect PM2 logs', 'Check backend .env', 'Run syntax check before restart'],
      risk: 'Critical',
      nextAction: 'Fix the backend startup error and restart the PM2 process.'
    }
  },
  {
    id: 'ssh-bruteforce',
    category: 'Security',
    title: 'SSH Brute Force Attempt',
    level: 'Warning',
    summary: 'Repeated failed SSH login attempts are targeting public usernames.',
    metrics: { cpu: 19, ram: 43, disk: 59, latency: 180 },
    log: LOG_TEMPLATES['ssh-bruteforce'],
    commentary: {
      symptom: 'Authentication logs show repeated invalid usernames and failed attempts.',
      causes: ['Public SSH exposure', 'Automated scanning', 'Weak lockout/rate-limit posture'],
      checks: ['Review sshd auth logs', 'Confirm key-only access', 'Check firewall and fail2ban'],
      risk: 'Warning',
      nextAction: 'Confirm no accepted logins occurred and tighten SSH access controls.'
    }
  },
  {
    id: 'suspicious-login',
    category: 'Security',
    title: 'Suspicious Login Activity',
    level: 'Warning',
    summary: 'A login occurred from an unusual source after repeated attempts.',
    metrics: { cpu: 20, ram: 46, disk: 60, latency: 210 },
    log: `SIMULATED INCIDENT: Suspicious Login Activity
sshd: Failed password for admin from 203.0.113.44
sshd: Accepted publickey for ec2-user from 203.0.113.44
last login source differs from normal administrator network.`,
    commentary: {
      symptom: 'A successful login appears near suspicious authentication activity.',
      causes: ['Unrecognized admin source', 'Shared key exposure', 'Legitimate admin from new location'],
      checks: ['Validate source IP with team', 'Review command history', 'Rotate credentials if unrecognized'],
      risk: 'Warning',
      nextAction: 'Confirm whether the login was authorized before making changes.'
    }
  },
  {
    id: 'possible-compromise',
    category: 'Security',
    title: 'Possible Compromise',
    level: 'Critical',
    summary: 'Multiple indicators suggest the host may need containment review.',
    metrics: { cpu: 76, ram: 81, disk: 88, latency: 960 },
    log: `SIMULATED INCIDENT: Possible Compromise
Unexpected outbound connections observed.
Unknown process running from /tmp.
New cron entry detected for an unrecognized script.
Several protected files changed recently.`,
    commentary: {
      symptom: 'Unexpected process, cron, and network indicators appear together.',
      causes: ['Unauthorized access', 'Malicious script execution', 'Compromised credential'],
      checks: ['Preserve logs', 'Identify unknown process owner', 'Review recent SSH and cron activity'],
      risk: 'Critical',
      nextAction: 'Contain and preserve evidence before deleting files or restarting services.'
    }
  },
  {
    id: 'dns-duckdns',
    category: 'Availability',
    title: 'DNS/DuckDNS Failure',
    level: 'Warning',
    summary: 'Domain update or DNS resolution is failing intermittently.',
    metrics: { cpu: 16, ram: 42, disk: 58, latency: 260 },
    log: `SIMULATED INCIDENT: DNS/DuckDNS Failure
duckdns update returned no confirmation.
dig example.duckdns.org -> stale IP address
Browser cannot resolve the expected hostname from some networks.`,
    commentary: {
      symptom: 'The server may be healthy, but the domain does not point to the current IP.',
      causes: ['DuckDNS token issue', 'Dynamic IP changed', 'DNS cache delay'],
      checks: ['Review duckdns.log', 'Compare public IP to DNS result', 'Retry DuckDNS update'],
      risk: 'Warning',
      nextAction: 'Update DuckDNS and verify public DNS resolves to the EC2 IP.'
    }
  },
  {
    id: 'cert-https',
    category: 'Availability',
    title: 'Certificate/HTTPS Failure',
    level: 'Warning',
    summary: 'HTTPS is unavailable or certificate renewal is not valid.',
    metrics: { cpu: 18, ram: 44, disk: 60, latency: 320 },
    log: `SIMULATED INCIDENT: Certificate/HTTPS Failure
curl https://domain -> certificate verify failed
certbot certificates: no valid certificate for current hostname
HTTP remains available on port 80.`,
    commentary: {
      symptom: 'Users can reach HTTP, but HTTPS trust or redirect behavior is broken.',
      causes: ['Expired certificate', 'Hostname mismatch', 'Rate-limited Certbot request'],
      checks: ['Inspect certificate path', 'Verify Nginx server_name', 'Check Certbot logs'],
      risk: 'Warning',
      nextAction: 'Keep HTTP available and repair certificate issuance without repeated retries.'
    }
  },
  {
    id: 'slow-api',
    category: 'Performance',
    title: 'Slow API Latency',
    level: 'Warning',
    summary: 'API requests are succeeding but latency is above normal.',
    metrics: { cpu: 64, ram: 67, disk: 63, latency: 1850 },
    log: `SIMULATED INCIDENT: Slow API Latency
GET /api/analyze-log -> 1850 ms
GET /api/metrics -> 920 ms
Error rate remains low.
Latency spike started after several large AI requests.`,
    commentary: {
      symptom: 'Requests complete successfully but feel slow to users.',
      causes: ['AI provider latency', 'Large payloads', 'CPU contention', 'Network delay'],
      checks: ['Compare endpoint latency', 'Review request size', 'Check CPU and provider logs'],
      risk: 'Warning',
      nextAction: 'Find whether latency is local CPU, network, or AI-provider related.'
    }
  }
];

// Global States
let activeAnalysisResult = null;
let currentActiveLog = "";
let isOfflineMode = false;
let healthPollIntervalId = null;
let metricsPollIntervalId = null;
let clockIntervalId = null;
let metricsCharts = null;
let latestMetrics = null;
let latestAlerts = [];
let selectedSimulationScenario = null;
let latestSecurityStatus = null;
let inactivityTimeoutId = null;
let sessionHistory = [];
let inboxPollIntervalId = null;
let inboxNotificationPollIntervalId = null;
let activeAnalysisAbortController = null;
let analysisRequestId = 0;
let liveSocket = null;
let liveReconnectTimerId = null;
let liveReconnectAttempt = 0;
let isLiveConnected = false;
let isLiveDisconnecting = false;
let isSessionValidated = false;
let validatedSessionRole = 'user';
let validatedSessionUsername = '';
let liveDisconnectWarningShown = false;
let liveAuthFailed = false;

const METRICS_REFRESH_MS = 3000;
const HEALTH_REFRESH_MS = 3000;
const MAX_METRIC_POINTS = 20;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'click', 'keypress', 'scroll', 'touchstart'];
const INBOX_REFRESH_MS = 10000;
const INBOX_NOTIFICATION_REFRESH_MS = 15 * 60 * 1000;

// TODO: This training app currently stores JWTs in localStorage. A production deployment should prefer secure httpOnly cookies.

// Element Selectors
const uptimeVal = document.getElementById('uptime-value');
const memPercent = document.getElementById('memory-percent');
const memFill = document.getElementById('memory-fill');
const memDetails = document.getElementById('memory-details');
const diskPercent = document.getElementById('disk-percent');
const diskFill = document.getElementById('disk-fill');
const diskDetails = document.getElementById('disk-details');
const lastPolledText = document.getElementById('last-polled-time');
const headerClock = document.getElementById('header-clock');
const liveStatusBadge = document.getElementById('live-status-badge');
const metricsError = document.getElementById('metrics-error');
const aiMetricsBtn = document.getElementById('ai-metrics-btn');
const toggleAiMetricsPanelBtn = document.getElementById('toggle-ai-metrics-panel-btn');
const aiMetricsPanelBody = document.getElementById('ai-metrics-panel-body');
const aiMetricsLoading = document.getElementById('ai-metrics-loading');
const aiMetricsResults = document.getElementById('ai-metrics-results');
const aiMetricsSummary = document.getElementById('ai-metrics-summary');
const aiMetricsHealth = document.getElementById('ai-metrics-health');
const aiMetricsRisks = document.getElementById('ai-metrics-risks');
const aiMetricsRecommendations = document.getElementById('ai-metrics-recommendations');
const aiMetricsPriority = document.getElementById('ai-metrics-priority');
const aiMetricsConfidence = document.getElementById('ai-metrics-confidence');
const alertsList = document.getElementById('alerts-list');
const aiAlertsBtn = document.getElementById('ai-alerts-btn');
const toggleAlertsPanelBtn = document.getElementById('toggle-alerts-panel-btn');
const alertsPanelBody = document.getElementById('alerts-panel-body');
const aiAlertsLoading = document.getElementById('ai-alerts-loading');
const aiAlertsResults = document.getElementById('ai-alerts-results');
const aiAlertsSummary = document.getElementById('ai-alerts-summary');
const aiAlertsCauses = document.getElementById('ai-alerts-causes');
const aiAlertsChecks = document.getElementById('ai-alerts-checks');
const aiAlertsActions = document.getElementById('ai-alerts-actions');
const simulationScenarios = document.getElementById('simulation-scenarios');
const simulationAlertBadge = document.getElementById('simulation-alert-badge');
const simulationSelectedTitle = document.getElementById('simulation-selected-title');
const simulationSelectedSummary = document.getElementById('simulation-selected-summary');
const simulationCpu = document.getElementById('simulation-cpu');
const simulationRam = document.getElementById('simulation-ram');
const simulationDisk = document.getElementById('simulation-disk');
const simulationLatency = document.getElementById('simulation-latency');
const simulationLogPreview = document.getElementById('simulation-log-preview');
const simulationAnalyzeBtn = document.getElementById('simulation-analyze-btn');
const simulationSymptom = document.getElementById('simulation-symptom');
const simulationCauses = document.getElementById('simulation-causes');
const simulationChecks = document.getElementById('simulation-checks');
const simulationRisk = document.getElementById('simulation-risk');
const simulationNextAction = document.getElementById('simulation-next-action');
const securityAlerts = document.getElementById('security-alerts');
const securityHttpsStatus = document.getElementById('security-https-status');
const securityDnsStatus = document.getElementById('security-dns-status');
const securityApiStatus = document.getElementById('security-api-status');
const securityAuthStatus = document.getElementById('security-auth-status');
const securityHostStatus = document.getElementById('security-host-status');
const securityLastChecked = document.getElementById('security-last-checked');
const securityCheckList = document.getElementById('security-check-list');
const securityAiReviewBtn = document.getElementById('security-ai-review-btn');
const securityAiLoading = document.getElementById('security-ai-loading');
const securityAiResults = document.getElementById('security-ai-results');
const securityAiSummary = document.getElementById('security-ai-summary');
const securityAiRisks = document.getElementById('security-ai-risks');
const securityAiHardening = document.getElementById('security-ai-hardening');
const securityAiPriority = document.getElementById('security-ai-priority');
const simulationContextBanner = document.getElementById('simulation-context-banner');
const simulationContextLevel = document.getElementById('simulation-context-level');
const simulationContextTitle = document.getElementById('simulation-context-title');
const simulationContextSummary = document.getElementById('simulation-context-summary');
const changeSimulationBtn = document.getElementById('change-simulation-btn');
const cpuChartValue = document.getElementById('cpu-chart-value');
const ramChartValue = document.getElementById('ram-chart-value');
const diskChartValue = document.getElementById('disk-chart-value');
const cpuStatus = document.getElementById('cpu-status');
const ramStatus = document.getElementById('ram-status');
const diskStatus = document.getElementById('disk-status');
const metricApiRequests = document.getElementById('metric-api-requests');
const metricApiSuccessRate = document.getElementById('metric-api-success-rate');
const metricFailedRequests = document.getElementById('metric-failed-requests');
const metricAverageLatency = document.getElementById('metric-average-latency');
const metricAiSuccess = document.getElementById('metric-ai-success');
const metricAiFailed = document.getElementById('metric-ai-failed');
const metricBackendUptime = document.getElementById('metric-backend-uptime');
const metricLastRefresh = document.getElementById('metric-last-refresh');
const metricProcessMemory = document.getElementById('metric-process-memory');
const metricProcessHeap = document.getElementById('metric-process-heap');
const summaryHostname = document.getElementById('summary-hostname');
const summaryPlatform = document.getElementById('summary-platform');
const summaryNodeVersion = document.getElementById('summary-node-version');
const summaryBackendStatus = document.getElementById('summary-backend-status');

const logInput = document.getElementById('log-input');
const clearInputBtn = document.getElementById('clear-input-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const inputToggleBtn = document.getElementById('input-toggle-btn');

const analysisEmptyState = document.getElementById('analysis-empty-state');
const analysisLoadingState = document.getElementById('analysis-loading-state');
const analysisResultsPanel = document.getElementById('analysis-results-panel');
const severityContainer = document.getElementById('severity-container');
const severityBadge = document.getElementById('severity-badge');
const summaryText = document.getElementById('analysis-summary-text');
const causesList = document.getElementById('analysis-causes-list');
const stepsList = document.getElementById('analysis-steps-list');
const securityCard = document.getElementById('analysis-security-card');
const securityText = document.getElementById('analysis-security-text');
const confidenceBadge = document.getElementById('confidence-badge');
const missingInfoText = document.getElementById('analysis-missing-info');
const manualVerifyText = document.getElementById('analysis-manual-verify');

const timelineList = document.getElementById('analysis-timeline');

const genCommandsBtn = document.getElementById('gen-commands-btn');
const commandsPanel = document.getElementById('commands-panel');
const commandsLoadingState = document.getElementById('commands-loading-state');
const commandsContent = document.getElementById('commands-content');
const commandsOutputCode = document.getElementById('commands-output-code');
const copyCommandsBtn = document.getElementById('copy-commands-btn');
const copyCmdText = document.getElementById('copy-cmd-text');

const genReportBtn = document.getElementById('gen-report-btn');
const genRemediationBtn = document.getElementById('gen-remediation-btn');
const reportPanel = document.getElementById('report-panel');
const reportLoadingState = document.getElementById('report-loading-state');
const reportContent = document.getElementById('report-content');
const reportOutputPaper = document.getElementById('report-output-paper');
const copyReportBtn = document.getElementById('copy-report-btn');
const copyRepText = document.getElementById('copy-rep-text');
const downloadReportBtn = document.getElementById('download-report-btn');
const remediationPanel = document.getElementById('remediation-panel');
const remediationLoadingState = document.getElementById('remediation-loading-state');
const remediationContent = document.getElementById('remediation-content');
const remediationActions = document.getElementById('remediation-actions');
const remediationCommands = document.getElementById('remediation-commands');
const remediationRollback = document.getElementById('remediation-rollback');
const remediationRisks = document.getElementById('remediation-risks');
const remediationEscalation = document.getElementById('remediation-escalation');

const historyList = document.getElementById('history-list');
const historyContent = document.getElementById('history-content');
const toggleHistoryBtn = document.getElementById('toggle-history-btn');
const clearLocalHistoryBtn = document.getElementById('clear-local-history-btn');
const ticketsPanel = document.getElementById('tickets-panel');
const ticketsTitle = document.getElementById('tickets-title');
const ticketType = document.getElementById('ticket-type');
const ticketMessage = document.getElementById('ticket-message');
const submitTicketBtn = document.getElementById('submit-ticket-btn');
const ticketStatus = document.getElementById('ticket-status');
const ticketList = document.getElementById('ticket-list');
const refreshTicketsBtn = document.getElementById('refresh-tickets-btn');
const acknowledgeGovernanceBtn = document.getElementById('acknowledge-governance-btn');
const exportGovernanceBtn = document.getElementById('export-governance-btn');
const governanceHistoryList = document.getElementById('governance-history-list');
const governanceStatus = document.getElementById('governance-status');
const incidentTimelineList = document.getElementById('incident-timeline-list');
const timelineFilters = document.getElementById('timeline-filters');
const refreshTimelineBtn = document.getElementById('refresh-timeline-btn');
const auditLogList = document.getElementById('audit-log-list');
const auditLogFilters = document.getElementById('audit-log-filters');
const refreshAuditLogsBtn = document.getElementById('refresh-audit-logs-btn');

let generatedCommandsText = "";
let generatedReportText = "";
let incidentTimelineEvents = [];
let activeTimelineFilter = 'All';
let auditLogEntries = [];
let activeAuditLogFilter = 'All';

// ==========================================
// LOCAL MOCK DIAGNOSTIC ENGINE (Simulation)
// ==========================================

function getMockAnalysis(logText = '') {
  const text = logText.toLowerCase();

  if (
    text.includes('quick check status: normal') ||
    text.includes('active (running)') ||
    text.includes('status=0/success') ||
    text.includes('status=0/success') ||
    text.includes('enabled') ||
    text.includes('online') ||
    text.includes('http 200') ||
    text.includes('success')
  ) {
    return {
      summary: "No issue detected.",
      severity: "Low",
      rootCauses: [],
      recommendedSteps: [],
      securityWarnings: null,
      limitations: {
        confidenceLevel: "High",
        missingInformation: null,
        manualVerification: "No immediate manual verification required."
      }
    };
  }

  if (text.includes('quick check status: warning')) {
    return {
      summary: "Warning condition detected in this quick check sample.",
      severity: "Medium",
      rootCauses: [
        "The diagnostic output contains warning-level evidence that should be reviewed, but it does not prove a critical outage by itself."
      ],
      recommendedSteps: [
        "Review the evidence lines in the sample and compare them with current live service status.",
        "Run the listed safe next checks manually before changing configuration or restarting services."
      ],
      securityWarnings: null,
      limitations: {
        confidenceLevel: "Medium",
        missingInformation: "This quick check is a point-in-time training sample and may not include full historical logs.",
        manualVerification: "Confirm the current service state, resource usage, and recent logs on the server."
      }
    };
  }

  if (
    text.includes('command not found') ||
    text.includes('unknown command') ||
    text.includes('unknown option') ||
    text.includes('invalid command') ||
    text.includes('not recognized') ||
    text.includes('invalid option')
  ) {
    return {
      summary: "Invalid or unknown command.",
      severity: "Medium",
      rootCauses: ["The command may be misspelled, unavailable, or not installed on this system."],
      recommendedSteps: ["Verify the command name and check whether the required package/service is installed."],
      securityWarnings: null,
      limitations: {
        confidenceLevel: "Medium",
        missingInformation: "The shell environment and installed packages are not fully known.",
        manualVerification: "Run 'which <command>' or check package/service installation."
      }
    };
  }

  if (
    text.includes('failed') ||
    text.includes('error') ||
    text.includes('denied') ||
    text.includes('timeout') ||
    text.includes('connection refused') ||
    text.includes('inactive') ||
    text.includes('dead') ||
    text.includes('crash')
  ) {
    return {
      summary: "An error was detected.",
      severity: "High",
      rootCauses: ["The output contains failure or error indicators."],
      recommendedSteps: ["Inspect the related service status and logs for details."],
      securityWarnings: null,
      limitations: {
        confidenceLevel: "High",
        missingInformation: "Full logs and service configuration may be needed.",
        manualVerification: "Check service logs with journalctl or application logs."
      }
    };
  }
  
  if (text.includes('502') || text.includes('bad gateway') || text.includes('upstream')) {
    return {
      summary: "Nginx failed to connect to the upstream backend server (127.0.0.1:8000), resulting in an HTTP 502 Bad Gateway response.",
      severity: "High",
      rootCauses: [
        "The upstream Node.js/Express application on port 8000 is not running or crashed.",
        "Nginx is configured to check a UNIX socket or port that is mismatched with the app config.",
        "Local OS firewall or SELinux policies are blocking Nginx from connecting to loopback port 8000."
      ],
      recommendedSteps: [
        "Check status of node/upstream service on port 8000: 'ss -tulpn | grep :8000'",
        "Check upstream application processes: 'ps aux | grep node'",
        "Review Nginx error logs at '/var/log/nginx/error.log' for diagnostic connection messages."
      ],
      securityWarnings: null,
      limitations: {
        confidenceLevel: "High",
        missingInformation: "Requires backend application runtime log files and matching system connection states.",
        manualVerification: "Manually verify binding configurations and Nginx site configurations located in '/etc/nginx/sites-enabled/default'."
      }
    };
  }

  if (text.includes('oom') || text.includes('out of memory') || text.includes('killed process')) {
    return {
      summary: "The operating system ran out of physical memory and swap, causing the kernel's OOM (Out Of Memory) Killer to terminate Java (PID 4056) to maintain OS stability.",
      severity: "Critical",
      rootCauses: [
        "The Java runtime JVM process consumed excessive heap allocation exceeding available host hardware boundaries.",
        "Missing or misconfigured swap space limits ability to absorb temporary memory leaks or load spikes.",
        "Other active services (like database query spikes) dynamically exhausted memory buffers simultaneously."
      ],
      recommendedSteps: [
        "Audit RAM footprint: 'free -h'",
        "Query logs for kernel kills: 'dmesg -T | grep -i oom'",
        "Reduce active JVM heap configurations (e.g. modify -Xmx flag in service startup parameters)."
      ],
      securityWarnings: null,
      limitations: {
        confidenceLevel: "High",
        missingInformation: "Current historical RAM trends and process scheduling history at moment of crash.",
        manualVerification: "Check active RAM consumption parameters manually via 'top -b -n 1 | head -n 20' to watch other heavy processes."
      }
    };
  }

  if (text.includes('failed password') || text.includes('sshd') || text.includes('invalid user')) {
    return {
      summary: "SSH authentication services report continuous login failures targeting invalid usernames, indicating an active brute-force scanning botnet attack.",
      severity: "Critical",
      rootCauses: [
        "SSH port (22) is open directly to the public internet.",
        "No rate-limiting or blocking firewalls (like Fail2ban) active to restrict sequential password guesses.",
        "Weak SSH policies permitting password authentication rather than forcing cryptographic key pairings."
      ],
      recommendedSteps: [
        "Inspect fail login volume: 'journalctl -u sshd | grep \"Failed password\" | tail -n 20'",
        "Add strict firewall filters to block threat actors: 'ufw block 192.168.1.150'",
        "Update SSH service parameters to lock down user exposure configurations."
      ],
      securityWarnings: "CRITICAL: Publicly accessible services utilizing standard password configurations invite high compromise rates. Automate security locks instantly.",
      limitations: {
        confidenceLevel: "High",
        missingInformation: "Whether any logins originating from the attacker's IP network address were successful.",
        manualVerification: "Check successful logs manually: 'grep \"Accepted\" /var/log/auth.log' or run 'last -a'."
      }
    };
  }

  if (text.includes('forbidden') || text.includes('apache') || text.includes('directory index')) {
    return {
      summary: "Apache HTTP Server blocked an index directory listing request because the Indexes option is deactivated and no index file is present.",
      severity: "Medium",
      rootCauses: [
        "No default files (like index.html or index.php) exist inside the targeted virtualhost subdirectory.",
        "Folder or parent path directories lack read or execute permission states for Apache user 'www-data'.",
        "Configured security permissions in '.htaccess' or VirtualHost configs explicitly set 'Require all denied'."
      ],
      recommendedSteps: [
        "Review folder directory file configurations: 'ls -la /var/www/html/secure/'",
        "Add an empty index file or re-enable listing options if listings are desired.",
        "Review VirtualHost block overrides inside '/etc/apache2/sites-enabled/'."
      ],
      securityWarnings: "Security alert: Restricting directory listings is excellent baseline security practice. Do not enable Indexes option on folders containing sensitive back-ups, source configs, or credential assets.",
      limitations: {
        confidenceLevel: "High",
        missingInformation: "Apache directory layout structures and virtualhost directives.",
        manualVerification: "Inspect file owner states: 'ls -ld /var/www/html/secure/' and check if owned by 'www-data'."
      }
    };
  }

  // Default Fallback Mock
  return {
    summary: "System log diagnostics report generic anomaly indicators with server config settings. Further technical trace diagnostics required.",
    severity: "Medium",
    rootCauses: [
      "System service crash or configuration mismatch parameter in software packages.",
      "Permission errors or process blocking triggers in active operations."
    ],
    recommendedSteps: [
      "Run standard status check commands: 'systemctl status [service]'",
      "View end lines of primary syslogs: 'tail -n 50 /var/log/syslog'"
    ],
    securityWarnings: "Standard precaution: Ensure configuration file credentials are kept within protected system environment variables.",
    limitations: {
      confidenceLevel: "Medium",
      missingInformation: "Needs explicit service identifiers or network layout descriptions.",
      manualVerification: "Identify active services manually: 'systemctl list-units --type=service --state=running'"
    }
  };
}

function getMockCommands(logText = '') {
  const text = logText.toLowerCase();
  let topic = "General System Troubleshooting";
  let cmd1 = "systemctl status syslog", desc1 = "Checks general active logging services.";
  let cmd2 = "df -h", desc2 = "Checks server disk space allocations.";
  let cmd3 = "free -h", desc3 = "Displays physical system memory consumption metrics.";

  if (text.includes('502') || text.includes('bad gateway') || text.includes('upstream')) {
    topic = "Nginx 502 Bad Gateway checks";
    cmd1 = "sudo systemctl status nginx";
    desc1 = "Verifies Nginx HTTP server is actively running and lists system startup errors.";
    cmd2 = "sudo ss -tulpn | grep -E '(:80|:443|:8000)'";
    desc2 = "Validates Nginx (ports 80/443) and upstream application (port 8000) bindings to check for listening sockets.";
    cmd3 = "sudo tail -n 25 /var/log/nginx/error.log";
    desc3 = "Displays Nginx connection failure entries which reveal why loopback connections are refused.";
  } else if (text.includes('oom') || text.includes('out of memory') || text.includes('killed process')) {
    topic = "Linux OOM Memory pressure diagnostics";
    cmd1 = "free -h";
    desc1 = "Checks available system memory, buffers, and active swap spaces.";
    cmd2 = "sudo dmesg -T | grep -i -E '(oom|kill)'";
    desc2 = "Pulls kernel messages and outputs timestamped entries of kernel OOM killer actions.";
    cmd3 = "ps aux --sort=-%mem | head -n 10";
    desc3 = "Displays the top 10 memory-consuming processes currently active on the host.";
  } else if (text.includes('failed password') || text.includes('sshd') || text.includes('invalid user')) {
    topic = "SSH Auth Lockdowns and checks";
    cmd1 = "sudo systemctl status sshd";
    desc1 = "Confirms active SSH Server services and displays recent active SSH connection reports.";
    cmd2 = "sudo journalctl -u sshd -n 30 --no-pager";
    desc2 = "Queries sshd system log journal blocks directly for explicit username login anomalies.";
    cmd3 = "sudo grep -i \"failed password\" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -nr | head -10";
    desc3 = "Aggregates and lists the top 10 threat actor IP addresses executing authentication attempts.";
  } else if (text.includes('forbidden') || text.includes('apache') || text.includes('directory index')) {
    topic = "Apache Permissions audits";
    cmd1 = "sudo apachectl configtest";
    desc1 = "Tests Apache configuration syntax health to prevent service crashes during adjustments.";
    cmd2 = "ls -ld /var/www/html/secure && ls -la /var/www/html/secure";
    desc2 = "Inspects the permissions and ownership configs of target directories to find locking tags.";
    cmd3 = "sudo tail -n 30 /var/log/apache2/error.log";
    desc3 = "Pulls Apache diagnostic error trace logs directly for missing directive detail notifications.";
  }

  return `### AI-Recommended Safe Commands for: ${topic}

Before running commands, review their purposes and precautions carefully. These diagnostic scripts check configurations without modifying files.

### 1. Check Active Process and Port Binding State
* **Explanation**: ${desc1} Helps junior administrators isolate whether services are down or in failed states.
* **Command**:
\`\`\`bash
${cmd1}
\`\`\`
* **Precaution/Warning**: Requires elevated privileges ('sudo') to parse system metrics safely.

### 2. Verify Port, Network Sockets, and System Resources
* **Explanation**: ${desc2} Helps rule out routing, permission blocks, or binding conflicts.
* **Command**:
\`\`\`bash
${cmd2}
\`\`\`
* **Precaution/Warning**: Ensure you operate this on active diagnostic cycles.

### 3. Retrieve Direct Log Trace Entries
* **Explanation**: ${desc3} Pinpoints granular line details of errors or threat actors.
* **Command**:
\`\`\`bash
${cmd3}
\`\`\`
* **Precaution/Warning**: Keep logs limited (-n) to avoid buffer-overrun delays on high-traffic servers.
`;
}

function getMockReport(logText = '', analysisObj) {
  const analysis = analysisObj || getMockAnalysis(logText);
  const severity = analysis.severity || "High";
  const causes = (analysis.rootCauses || ["System connection issue."]).join("\n- ");
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `# INCIDENT ANALYSIS REPORT
**Report Date:** ${date}  
**Incident Severity:** ${severity}  
**Status:** Under Investigation (Action Plan Formulated)  

---

### 1. Executive Summary
An operational incident was registered due to application anomalies captured in runtime environments. System diagnostics revealed issues affecting backend connection frameworks or resource limits, leading to service disruption or elevated system event alerts. Urgent remediation is required to fully stabilize operational workflows.

### 2. Affected Services & Infrastructure
- primary-host-node
- application-gateway-ports
- OS kernel task scheduler (if memory related) / network boundary interfaces

### 3. Symptoms & Observed Behavior
- **Observed system messages:** 
  * "${analysis.summary}"
- **User indicators:** 
  * Network requests returning error states.
  * Diagnostic panels registering connection interruptions or latency delays.

### 4. Identified Root Cause
Based on diagnostic telemetry scans:
- ${causes}

### 5. Recommended Remediation & Safe Resolutions
- **Immediate (Safety-First):**
  - Execute diagnostic checks listed in the AI-Recommended Safe Commands interface.
  - Inspect server port states safely using network utilities.
  - Review permissions on service directories without modifying root values.
- **Remediation Commands:**
  - Check configuration settings: Verify files inside standard path definitions.
  - Restart process gracefully: Apply standard systemctl restart directives on individual scopes.

### 6. Preventative Action Items
- Set up automatic resource alarms inside alert dashboards to catch spikes before limits are reached.
- Configure software firewalls or Fail2ban boundaries to isolate bad traffic patterns early.
- Maintain regular file-rotation configurations to prevent disk space limits from blocking service pools.
`;
}

// ==========================================
// CUSTOM MARKDOWN PARSER (Self-contained)
// ==========================================

function parseMarkdownToHTML(markdown) {
  if (!markdown) return '';

  const codeBlocks = [];
  let html = markdown.replace(/```(?:bash)?\n([\s\S]*?)\n```/g, (match, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(code);
    return `@@AI_OPS_CODE_BLOCK_${index}@@`;
  });

  // HTML Character Safety Escapes for non-code markdown.
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Custom highlights for security blocks
  html = html.replace(/#\s+\[BLOCKED FOR SAFETY:[^\]]*\]/g, (match) => {
    return `<span class="dangerous-command-blocked">${match}</span>`;
  });
  html = html.replace(/#\s+\[BLOCKED:[^\]]*\]/g, (match) => {
    return `<span class="dangerous-command-blocked">${match}</span>`;
  });
  html = html.replace(/#\s+\[SECURITY WARNING:[^\]]*\]/g, (match) => {
    return `<span class="dangerous-command-blocked">${match}</span>`;
  });

  // H1 header
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  
  // H3 header
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  
  // Bold tags
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Bullet lists
  html = html.replace(/^\*\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');

  // Inline ticks
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  codeBlocks.forEach((code, index) => {
    html = html.replace(`@@AI_OPS_CODE_BLOCK_${index}@@`, renderMarkdownCommandGroupHtml(code));
  });
  
  return html;
}

// ==========================================
// LIVE RESOURCE METRICS CHARTS (GET /api/metrics)
// ==========================================

function getChartThemeColors() {
  const styles = getComputedStyle(document.documentElement);

  return {
    textMuted: styles.getPropertyValue('--text-muted').trim() || '#64748b',
    grid: document.documentElement.dataset.theme === 'light'
      ? 'rgba(15, 23, 42, 0.08)'
      : 'rgba(255, 255, 255, 0.06)'
  };
}

function createMetricChart(canvasId, label, color) {
  const canvas = document.getElementById(canvasId);

  if (!canvas || !window.Chart) {
    return null;
  }

  const themeColors = getChartThemeColors();

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: `${color}22`,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: themeColors.grid
          },
          ticks: {
            color: themeColors.textMuted,
            maxTicksLimit: 4,
            font: {
              size: 10
            }
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: {
            color: themeColors.grid
          },
          ticks: {
            color: themeColors.textMuted,
            stepSize: 50,
            callback: (value) => `${value}%`,
            font: {
              size: 10
            }
          }
        }
      }
    }
  });
}

function isMetricsDashboardVisible() {
  return metricsDashboardView && !metricsDashboardView.classList.contains('hidden');
}

function initializeMetricsCharts() {
  if (metricsCharts) {
    return true;
  }

  if (!window.Chart) {
    showMetricsError('Live charts could not load. Check the Chart.js script connection.');
    return false;
  }

  metricsCharts = {
    cpu: createMetricChart('cpu-chart', 'CPU', '#3b82f6'),
    ram: createMetricChart('ram-chart', 'RAM', '#10b981'),
    disk: createMetricChart('disk-chart', 'Disk', '#f59e0b')
  };

  return Object.values(metricsCharts).every(Boolean);
}

function destroyMetricsCharts() {
  if (!metricsCharts) {
    return;
  }

  Object.values(metricsCharts).forEach((chart) => chart?.destroy());
  metricsCharts = null;
}

function showMetricsError(message = 'Live metrics are temporarily unavailable.') {
  if (!metricsError) {
    return;
  }

  metricsError.textContent = message;
  metricsError.classList.remove('hidden');
}

function clearMetricsError() {
  metricsError?.classList.add('hidden');
}

function clearAuthState() {
  stopAuthenticatedSession();
  localStorage.removeItem('authToken');
  localStorage.removeItem('userRole');
  localStorage.removeItem('username');
  localStorage.setItem(VIEW_STORAGE_KEY, DEFAULT_VIEW);
  isSessionValidated = false;
  validatedSessionRole = 'user';
  validatedSessionUsername = '';
}

function handleExpiredSession(message = 'Session expired. Please log in again.') {
  clearAuthState();
  updateLiveStatus('expired');
  if (loginError) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
  }
  loginScreen.classList.remove('hidden');
  applyRoleAccess();
  showAnalyzerView({ persist: false });
}

function handleForbiddenResponse(options = {}) {
  const { redirectToAnalyzer = true, message = 'Not authorized for this view.' } = options;

  if (metricsError && !metricsDashboardView?.classList.contains('hidden')) {
    showMetricsError(message);
  }

  if (ticketStatus && !inboxView?.classList.contains('hidden')) {
    ticketStatus.textContent = message;
    ticketStatus.classList.remove('hidden');
  }

  if (redirectToAnalyzer && ['dashboard', 'security', 'timeline', 'audit'].includes(getSavedView())) {
    showAnalyzerView();
  }

  applyRoleAccess();
}

async function apiFetch(path, options = {}) {
  const {
    auth = true,
    adminOnly = false,
    onForbidden = 'throw',
    ...fetchOptions
  } = options;

  if (adminOnly && !isAdminUser()) {
    const error = new Error('Not authorized for this view.');
    error.status = 403;
    if (onForbidden !== 'throw') {
      handleForbiddenResponse({ redirectToAnalyzer: onForbidden === 'redirect' });
      return null;
    }
    throw error;
  }

  const headers = new Headers(fetchOptions.headers || {});

  if (auth) {
    const token = localStorage.getItem('authToken');

    if (!token) {
      handleExpiredSession();
      const error = new Error('Session expired.');
      error.status = 401;
      throw error;
    }

    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers
  });

  if (response.status === 401) {
    handleExpiredSession();
    return null;
  } else if (response.status === 403) {
    handleForbiddenResponse({ redirectToAnalyzer: onForbidden === 'redirect' });
    if (onForbidden !== 'throw') {
      return null;
    }
    const error = new Error('Not authorized for this view.');
    error.status = 403;
    throw error;
  }

  return response;
}

async function validateSavedSession(options = {}) {
  const { restoreView = true } = options;
  const token = localStorage.getItem('authToken');

  if (!token) {
    clearAuthState();
    loginScreen.classList.remove('hidden');
    applyRoleAccess();
    showAnalyzerView({ persist: false });
    return false;
  }

  try {
    const response = await apiFetch('/me', { onForbidden: 'throw' });

    if (!response || !response.ok) {
      throw new Error(`Session validation failed with ${response?.status || 'no response'}`);
    }

    const data = await response.json();
    validatedSessionRole = data.role === 'admin' ? 'admin' : 'user';
    validatedSessionUsername = data.username || '';
    localStorage.setItem('userRole', validatedSessionRole);
    localStorage.setItem('username', validatedSessionUsername);
    isSessionValidated = true;
    liveAuthFailed = false;
    liveDisconnectWarningShown = false;
    loginScreen.classList.add('hidden');
    applyRoleAccess();
    startAuthenticatedSession();

    if (restoreView) {
      restoreSavedView();
    }

    return true;
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) {
      console.warn('[AUTH] Saved session validation failed. Returning to login.');
    }
    handleExpiredSession('Session expired. Please log in again.');
    return false;
  }
}

function appendMetricPoint(chart, label, value) {
  if (!chart || !Number.isFinite(value)) {
    return;
  }

  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);

  if (chart.data.labels.length > MAX_METRIC_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }

  chart.update('none');
}

function updateMetricValue(element, value) {
  if (element && Number.isFinite(value)) {
    element.textContent = `${value.toFixed(1)}%`;
  }
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '--';
}

function formatBytes(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value)) {
    return '--';
  }

  if (value >= 1024 ** 3) {
    return `${(value / 1024 ** 3).toFixed(1)} GB`;
  }

  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function formatUptime(seconds) {
  const totalSeconds = Number(seconds);

  if (!Number.isFinite(totalSeconds)) {
    return '--';
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function setMetricText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function getResourceStatus(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return { label: '--', className: 'status-unknown' };
  }

  if (numericValue >= 90) {
    return { label: 'Critical', className: 'status-critical' };
  }

  if (numericValue >= 75) {
    return { label: 'Warning', className: 'status-warning' };
  }

  return { label: 'Healthy', className: 'status-healthy' };
}

function updateStatusBadge(element, value) {
  if (!element) {
    return;
  }

  const status = getResourceStatus(value);
  element.textContent = status.label;
  element.className = `resource-status ${status.className}`;
}

function renderPlainList(element, items) {
  if (!element) {
    return;
  }

  const values = Array.isArray(items) && items.length > 0 ? items : ['No immediate item identified.'];
  element.innerHTML = '';

  values.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    element.appendChild(li);
  });
}

function encodeCommandForCopy(command) {
  return encodeURIComponent(String(command || ''));
}

function renderMarkdownCommandGroupHtml(commandText) {
  const command = String(commandText || '').trimEnd();
  const encodedCommand = encodeCommandForCopy(command);
  const commandLines = command
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const commandCards = (commandLines.length > 1 ? commandLines : [command])
    .map((item, index) => {
      const encodedItem = encodeCommandForCopy(item);
      const label = commandLines.length > 1 ? `command ${index + 1}` : 'command block';
      return `<div class="command-copy-card">
        <div class="command-copy-header">
          <span>${label}</span>
          <button type="button" class="btn-copy command-copy-btn" data-copy-command-encoded="${encodedItem}">Copy</button>
        </div>
        <pre class="command-code-block"><code class="language-bash">${escapeHtml(item)}</code></pre>
      </div>`;
    })
    .join('');

  return `<div class="command-group-card markdown-command-block">
    <div class="command-group-header">
      <span>bash commands</span>
      <button type="button" class="btn-copy command-copy-btn" data-copy-command-group="${encodedCommand}">Copy all commands</button>
    </div>
    ${commandCards}
  </div>`;
}

function createCommandGroupHeader(commands, label = 'Command group') {
  const header = document.createElement('div');
  header.className = 'command-group-header';

  const title = document.createElement('span');
  title.textContent = label;

  const copyAllButton = document.createElement('button');
  copyAllButton.type = 'button';
  copyAllButton.className = 'btn-copy command-copy-btn';
  copyAllButton.dataset.copyCommandGroup = commands.join('\n');
  copyAllButton.textContent = 'Copy all commands';

  header.appendChild(title);
  header.appendChild(copyAllButton);

  return header;
}

function createCommandBlock(command, label = 'Command') {
  const wrapper = document.createElement('div');
  wrapper.className = 'command-copy-card';

  const header = document.createElement('div');
  header.className = 'command-copy-header';

  const title = document.createElement('span');
  title.textContent = label;

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'btn-copy command-copy-btn';
  copyButton.dataset.copyCommand = command;
  copyButton.textContent = 'Copy';

  const pre = document.createElement('pre');
  pre.className = 'command-code-block';

  const code = document.createElement('code');
  code.className = 'language-bash';
  code.textContent = command;

  header.appendChild(title);
  header.appendChild(copyButton);
  pre.appendChild(code);
  wrapper.appendChild(header);
  wrapper.appendChild(pre);

  return wrapper;
}

function renderCommandList(element, commands) {
  if (!element) {
    return;
  }

  const values = Array.isArray(commands) ? commands.map(String).filter(Boolean) : [];
  element.innerHTML = '';

  if (!values.length) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'No verification commands returned.';
    element.appendChild(emptyItem);
    return;
  }

  const groupItem = document.createElement('li');
  groupItem.className = 'command-group-actions';
  groupItem.appendChild(createCommandGroupHeader(values, 'Verification commands'));
  element.appendChild(groupItem);

  values.forEach((command) => {
    const li = document.createElement('li');
    li.className = 'command-list-item';
    li.appendChild(createCommandBlock(command, 'bash'));
    element.appendChild(li);
  });
}

function parseSafeCommandStep(step) {
  const text = String(step || '');
  const prefix = 'Safe command to verify manually:';

  if (!text.toLowerCase().startsWith(prefix.toLowerCase())) {
    return null;
  }

  return text.slice(prefix.length).trim();
}

async function recordTimelineEvent(type, category, severity, description, metadata = {}) {
  if (!hasValidatedSession()) {
    return;
  }

  try {
    await apiFetch('/timeline', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type,
        category,
        severity,
        description,
        metadata
      })
    });
  } catch {
    // Timeline recording should never block primary workflows.
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSecurityAlerts(alerts) {
  if (!securityAlerts) {
    return;
  }

  securityAlerts.innerHTML = '';

  if (!alerts.length) {
    const alert = document.createElement('div');
    alert.className = 'security-alert-card info';
    alert.innerHTML = '<strong><span class="status-dot info">i</span>Info</strong><span>No immediate defensive alerts from current browser/API checks.</span>';
    securityAlerts.appendChild(alert);
    return;
  }

  alerts.forEach((item) => {
    const alert = document.createElement('div');
    const level = String(item.level || 'Info').toLowerCase();
    alert.className = `security-alert-card ${level}`;
    alert.innerHTML = `<strong>${getSecurityStatusIcon(level)}${escapeHtml(item.level || 'Info')}</strong><span>${escapeHtml(item.message)}</span>`;
    securityAlerts.appendChild(alert);
  });
}

function renderSecurityChecks(status) {
  if (!securityCheckList) {
    return;
  }

  const checks = [
    { label: 'API health', value: status.apiOk ? 'Available' : 'Unavailable', level: status.apiOk ? 'healthy' : 'action' },
    { label: 'Metrics availability', value: status.metricsOk ? 'Available with current token' : 'Unavailable or requires login', level: status.metricsOk ? 'healthy' : 'warning' },
    { label: 'Connection protocol', value: status.protocol, level: status.protocol === 'https:' ? 'healthy' : 'warning' },
    { label: 'Frontend protocol', value: status.protocol, level: 'info' },
    { label: 'Current host/domain', value: status.host, level: 'info' },
    { label: 'Local authentication token', value: status.authenticated ? 'Present' : 'Missing', level: status.authenticated ? 'healthy' : 'action' },
    { label: 'Simulation mode', value: status.simulationMode ? 'Active' : 'Off', level: status.simulationMode ? 'info' : 'healthy' },
    { label: 'Backend exposure reminder', value: 'Port 3000 should stay behind Nginx.', level: 'info' },
    { label: 'Certificate/rate-limit reminder', value: 'Avoid repeated certificate requests.', level: 'info' },
    { label: 'Data handling reminder', value: 'Do not paste secrets or personal data into AI analysis.', level: 'info' }
  ];

  securityCheckList.innerHTML = checks.map((check) => `
    <li class="security-check-item">
      ${getSecurityStatusIcon(check.level)}
      <span><strong>${escapeHtml(check.label)}:</strong> ${escapeHtml(check.value)}</span>
    </li>
  `).join('');
}

function getSecurityStatusIcon(level) {
  const normalizedLevel = String(level || 'info').toLowerCase();
  const labelMap = {
    healthy: 'Healthy',
    warning: 'Warning',
    action: 'Action needed',
    critical: 'Action needed',
    info: 'Info'
  };
  const iconMap = {
    healthy: '✓',
    warning: '!',
    action: '!',
    critical: '!',
    info: 'i'
  };
  const className = normalizedLevel === 'critical' ? 'action' : normalizedLevel;
  return `<span class="status-dot ${className}" aria-label="${labelMap[normalizedLevel] || 'Info'}">${iconMap[normalizedLevel] || 'i'}</span>`;
}

function setSecurityStatus(element, label, level = 'info') {
  if (!element) {
    return;
  }

  const text = String(label || '--');
  const statusLabel = level === 'healthy'
    ? 'Healthy'
    : level === 'warning'
      ? 'Warning'
      : level === 'action' || level === 'critical'
        ? 'Action needed'
        : 'Info';
  element.innerHTML = `${getSecurityStatusIcon(level)}<span class="security-status-text"><span class="status-label">${statusLabel}</span>${escapeHtml(text)}</span>`;
}

async function refreshSecurityCenter() {
  const token = localStorage.getItem('authToken');
  const protocol = window.location.protocol;
  const host = window.location.host || 'local file preview';
  const status = {
    protocol,
    host,
    authenticated: Boolean(token),
    simulationMode: isSimulationModeEnabled(),
    apiOk: false,
    metricsOk: false,
    checkedAt: new Date().toLocaleTimeString()
  };

  try {
    const response = await fetch(`${API_BASE_URL}/status`);
    status.apiOk = response.ok;
  } catch {
    status.apiOk = false;
  }

  if (token && isAdminUser()) {
    try {
      const response = await apiFetch('/metrics', { adminOnly: true, onForbidden: 'ignore' });
      status.metricsOk = response.ok;
    } catch {
      status.metricsOk = false;
    }
  }

  latestSecurityStatus = status;

  setSecurityStatus(securityHttpsStatus, protocol === 'https:' ? 'HTTPS active' : 'HTTPS unavailable', protocol === 'https:' ? 'healthy' : 'warning');
  setSecurityStatus(securityDnsStatus, host.includes('duckdns.org') ? 'DuckDNS host detected' : 'Custom/local host', host.includes('duckdns.org') ? 'healthy' : 'warning');
  setSecurityStatus(securityApiStatus, status.apiOk ? 'API reachable' : 'API unavailable', status.apiOk ? 'healthy' : 'action');
  setSecurityStatus(securityAuthStatus, status.authenticated ? 'Authenticated locally' : 'Unauthenticated', status.authenticated ? 'healthy' : 'action');
  setMetricText(securityHostStatus, host);
  setMetricText(securityLastChecked, status.checkedAt);
  renderSecurityChecks(status);

  const alerts = [];
  if (protocol !== 'https:') alerts.push({ level: 'Warning', message: 'HTTPS is unavailable for this browser session.' });
  if (!status.apiOk) alerts.push({ level: 'Critical', message: 'Backend API health check is unavailable.' });
  if (!status.metricsOk) alerts.push({ level: 'Warning', message: 'Protected metrics endpoint is unavailable for the current session.' });
  if (status.simulationMode) alerts.push({ level: 'Info', message: 'Simulation mode is active; training data may be visible elsewhere.' });
  if (!status.authenticated) alerts.push({ level: 'Warning', message: 'No local auth token is present.' });

  renderSecurityAlerts(alerts);
}

function getFallbackSecurityReview(status) {
  const risks = [];
  const hardening = [
    'Keep backend port 3000 private behind Nginx.',
    'Restrict SSH ingress to trusted administrator IPs.',
    'Use HTTPS whenever a valid certificate is available.'
  ];
  const priority = [];

  if (status?.protocol !== 'https:') {
    risks.push('HTTPS is not active for the current connection.');
    priority.push('Verify certificate status and enable HTTPS redirect when available.');
  }

  if (!status?.apiOk) {
    risks.push('API health is unavailable.');
    priority.push('Restore backend API health before relying on dashboard checks.');
  }

  if (!status?.metricsOk) {
    risks.push('Protected metrics are unavailable for this session.');
    priority.push('Confirm the user is logged in and the token is valid.');
  }

  if (status?.simulationMode) {
    risks.push('Simulation mode is active, so training data should not be treated as live telemetry.');
  }

  return {
    summary: risks.length ? 'Defensive review found posture items to address.' : 'Current defensive browser/API checks look healthy.',
    risks: risks.length ? risks : ['No immediate defensive risk detected from current browser/API checks.'],
    hardening,
    priorityActions: priority.length ? priority : ['Continue monitoring API, metrics, HTTPS, and access controls.']
  };
}

function renderSecurityAiReview(review) {
  setMetricText(securityAiSummary, review.summary || review.overallSecurityPosture || 'No summary returned.');
  renderPlainList(securityAiRisks, review.risks);
  renderPlainList(securityAiHardening, review.hardening || review.recommendedHardening || review.recommendedSteps);
  renderPlainList(securityAiPriority, review.priorityActions);
  securityAiResults?.classList.remove('hidden');
}

async function reviewSecurityPostureWithAI() {
  if (!hasValidatedSession()) {
    renderSecurityAiReview(getFallbackSecurityReview(latestSecurityStatus));
    return;
  }

  securityAiLoading?.classList.remove('hidden');
  securityAiResults?.classList.add('hidden');

  if (securityAiReviewBtn) {
    securityAiReviewBtn.disabled = true;
  }

  try {
    await refreshSecurityCenter();

    const prompt = `Explain this defensive security status only.

Current status:
${JSON.stringify(latestSecurityStatus, null, 2)}

Recommended exposed ports:
- 22 SSH: restrict in production
- 80 HTTP: redirect to HTTPS when cert available
- 443 HTTPS: public web access
- 3000 backend: should NOT be public, only behind Nginx

Return concise defensive guidance with:
- what is healthy
- what needs attention
- priority next steps`;

    const response = await apiFetch('/analyze-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        logText: prompt
      })
    });

    if (!response) {
      return;
    }

    if (!response.ok) {
      throw new Error(`Security review failed with ${response.status}`);
    }

    const data = await response.json();
    renderSecurityAiReview({
      summary: data.summary,
      risks: data.rootCauses,
      hardening: data.recommendedSteps,
      priorityActions: data.limitations?.manualVerification ? [data.limitations.manualVerification] : data.recommendedSteps
    });
    recordTimelineEvent('ai_security_review', 'AI', 'Info', 'AI security review run from Security Center.');
  } catch (error) {
    console.warn('[SECURITY REVIEW] Falling back to local defensive guidance.', error.message);
    renderSecurityAiReview(getFallbackSecurityReview(latestSecurityStatus));
  } finally {
    securityAiLoading?.classList.add('hidden');

    if (securityAiReviewBtn) {
      securityAiReviewBtn.disabled = false;
    }
  }
}

function setAiMetricsHealthBadge(health) {
  if (!aiMetricsHealth) {
    return;
  }

  const normalizedHealth = ['Healthy', 'Warning', 'Critical'].includes(health) ? health : 'Warning';
  const classMap = {
    Healthy: 'badge-low',
    Warning: 'badge-medium',
    Critical: 'badge-critical'
  };

  aiMetricsHealth.textContent = normalizedHealth;
  aiMetricsHealth.className = `badge ${classMap[normalizedHealth]}`;
}

function updateLiveStatus(status) {
  if (!liveStatusBadge) return;
  const normalizedStatus = status || 'fallback';
  const labels = {
    connected: 'Live connected',
    reconnecting: 'Live reconnecting',
    fallback: 'Live fallback',
    expired: 'Session expired'
  };
  liveStatusBadge.textContent = labels[normalizedStatus] || labels.fallback;
  liveStatusBadge.className = `live-status-badge live-${normalizedStatus}`;
}

function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = encodeURIComponent(localStorage.getItem('authToken') || '');
  const host = window.location.host;
  return `${protocol}//${host}/ws?token=${token}`;
}

function stopMetricsPolling() {
  if (metricsPollIntervalId) {
    clearInterval(metricsPollIntervalId);
    metricsPollIntervalId = null;
  }
}

function startRestFallbackPolling() {
  if (!hasValidatedSession() || isLiveConnected) return;

  if (!metricsPollIntervalId) {
    if (!isLiveConnected) {
      pollMetrics();
    }
    metricsPollIntervalId = setInterval(pollMetrics, METRICS_REFRESH_MS);
  }

  startInboxNotificationPolling();
}

function handleLiveMetrics(metrics) {
  latestMetrics = metrics;
  renderAlerts(metrics.alerts || []);

  if (!isMetricsDashboardVisible() || !isAdminUser() || !initializeMetricsCharts()) return;

  const pointLabel = new Date(metrics.timestamp).toLocaleTimeString();
  const cpu = Number(metrics.cpuLoadPercent);
  const ram = Number(metrics.memoryUsagePercent);
  const disk = Number(metrics.diskUsagePercent);

  updateOperationalMetrics(metrics);
  appendMetricPoint(metricsCharts.cpu, pointLabel, cpu);
  appendMetricPoint(metricsCharts.ram, pointLabel, ram);
  appendMetricPoint(metricsCharts.disk, pointLabel, disk);
  updateMetricValue(cpuChartValue, cpu);
  updateMetricValue(ramChartValue, ram);
  updateMetricValue(diskChartValue, disk);
  updateStatusBadge(cpuStatus, cpu);
  updateStatusBadge(ramStatus, ram);
  updateStatusBadge(diskStatus, disk);
  clearMetricsError();
}

function handleLiveTimelineEvent(event) {
  if (!event || !isAdminUser()) return;
  incidentTimelineEvents.unshift(event);
  incidentTimelineEvents = incidentTimelineEvents.slice(0, 500);

  if (timelineView && !timelineView.classList.contains('hidden')) {
    renderTimelineEvents();
  }
}

function handleLiveMessage(data) {
  if (data.type === 'metrics') handleLiveMetrics(data.metrics);
  else if (data.type === 'alerts') renderAlerts(data.alerts || []);
  else if (data.type === 'inbox_unread') updateInboxNotificationBadge(data.count);
  else if (data.type === 'timeline_event') handleLiveTimelineEvent(data.event);
  else if (data.type === 'live_status') updateLiveStatus('connected');
}

function connectLiveUpdates() {
  const token = localStorage.getItem('authToken');
  if (!token || !isSessionValidated || liveSocket || liveAuthFailed) return;

  updateLiveStatus(liveReconnectAttempt ? 'reconnecting' : 'fallback');

  try {
    isLiveDisconnecting = false;
    const liveUrl = getWebSocketUrl();
    liveSocket = new WebSocket(liveUrl);
  } catch (error) {
    if (!liveDisconnectWarningShown) {
      console.warn('[LIVE] Could not create WebSocket connection. REST fallback remains active.');
      liveDisconnectWarningShown = true;
    }
    liveSocket = null;
    scheduleLiveReconnect();
    startRestFallbackPolling();
    return;
  }

  liveSocket.addEventListener('open', () => {
    isLiveConnected = true;
    liveReconnectAttempt = 0;
    liveDisconnectWarningShown = false;
    updateLiveStatus('connected');
    stopMetricsPolling();
    stopInboxNotificationPolling();
    liveSocket.send(JSON.stringify({ type: 'auth', token }));
  });

  liveSocket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'auth_failed') {
        liveAuthFailed = true;
        updateLiveStatus('expired');
        handleExpiredSession();
        return;
      }
      handleLiveMessage(data);
    } catch {
      // Ignore malformed live updates.
    }
  });

  liveSocket.addEventListener('close', (event) => {
    liveSocket = null;
    isLiveConnected = false;

    if (isLiveDisconnecting) {
      isLiveDisconnecting = false;
      return;
    }

    if (event.code === 1008) {
      liveAuthFailed = true;
      updateLiveStatus('expired');
      handleExpiredSession();
      return;
    }

    updateLiveStatus('fallback');
    if (!liveDisconnectWarningShown) {
      console.warn('[LIVE] WebSocket unavailable. REST fallback remains active while reconnect runs in the background.');
      liveDisconnectWarningShown = true;
    }
    startRestFallbackPolling();
    scheduleLiveReconnect();
  });

  liveSocket.addEventListener('error', () => {
    if (!liveDisconnectWarningShown) {
      console.warn('[LIVE] WebSocket connection failed. REST fallback remains active.');
      liveDisconnectWarningShown = true;
    }
    updateLiveStatus('fallback');
  });
}

function scheduleLiveReconnect() {
  if (!localStorage.getItem('authToken') || !isSessionValidated || liveAuthFailed || liveReconnectTimerId) return;

  liveReconnectAttempt += 1;
  const delay = Math.min(30000, 1000 * (2 ** Math.min(liveReconnectAttempt, 5)));
  liveReconnectTimerId = setTimeout(() => {
    liveReconnectTimerId = null;
    connectLiveUpdates();
  }, delay);
}

function disconnectLiveUpdates() {
  if (liveReconnectTimerId) {
    clearTimeout(liveReconnectTimerId);
    liveReconnectTimerId = null;
  }

  if (liveSocket) {
    isLiveDisconnecting = true;
    liveSocket.close();
    liveSocket = null;
  }

  isLiveConnected = false;
  liveReconnectAttempt = 0;
  liveAuthFailed = false;
  liveDisconnectWarningShown = false;
  updateLiveStatus('fallback');
}

function getAlertBadgeClass(severity) {
  const normalizedSeverity = String(severity || 'Info').toLowerCase();

  if (normalizedSeverity === 'critical') {
    return 'badge-critical';
  }

  if (normalizedSeverity === 'warning') {
    return 'badge-medium';
  }

  return 'badge-status-default';
}

function updateDashboardAlertBadge(count) {
  if (!dashboardViewBtn) {
    return;
  }

  const numericCount = Math.max(0, Number(count) || 0);
  let badge = dashboardViewBtn.querySelector('.dashboard-alert-badge');

  if (!numericCount) {
    badge?.remove();
    dashboardViewBtn.classList.remove('has-notification');
    return;
  }

  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'dashboard-alert-badge inbox-notification-badge';
    dashboardViewBtn.appendChild(badge);
  }

  badge.textContent = numericCount > 9 ? '9+' : String(numericCount);
  dashboardViewBtn.classList.add('has-notification');
}

function toggleCollapsiblePanel(bodyElement, buttonElement) {
  if (!bodyElement || !buttonElement) {
    return;
  }

  const shouldCollapse = !bodyElement.classList.contains('hidden');
  bodyElement.classList.toggle('hidden', shouldCollapse);
  buttonElement.textContent = shouldCollapse ? 'Expand' : 'Collapse';
  buttonElement.setAttribute('aria-expanded', String(!shouldCollapse));
}

function renderAlerts(alerts = []) {
  if (!alertsList) {
    return;
  }

  const activeAlerts = alerts.filter((alert) => alert.status === 'Active');
  const resolvedAlerts = alerts.filter((alert) => alert.status !== 'Active').slice(0, 4);
  latestAlerts = alerts;
  updateDashboardAlertBadge(activeAlerts.length);
  alertsList.innerHTML = '';

  if (!activeAlerts.length) {
    alertsList.innerHTML = '<p class="feedback-status">No active alerts</p>';
  } else {
    activeAlerts.forEach((alert) => {
      alertsList.appendChild(renderAlertCard(alert, true));
    });
  }

  if (resolvedAlerts.length) {
    const resolvedWrap = document.createElement('div');
    resolvedWrap.className = 'resolved-alerts';
    resolvedWrap.innerHTML = '<h4>Recently Resolved</h4>';
    resolvedAlerts.forEach((alert) => resolvedWrap.appendChild(renderAlertCard(alert, false)));
    alertsList.appendChild(resolvedWrap);
  }
}

function renderAlertCard(alert, isActive) {
  const item = document.createElement('article');
  item.className = `alert-item ${String(alert.severity || 'Info').toLowerCase()} ${isActive ? 'active' : 'resolved'}`;
  item.innerHTML = `
    <div class="alert-item-header">
      <span class="badge ${getAlertBadgeClass(alert.severity)}">${escapeHtml(alert.severity || 'Info')}</span>
      <strong>${escapeHtml(alert.title || 'Operational alert')}</strong>
      <span>${escapeHtml(alert.status || 'Active')}</span>
    </div>
    <p>${escapeHtml(alert.message || '')}</p>
    <div class="alert-meta">
      <span>Source: ${escapeHtml(alert.source || '--')}</span>
      <span>Value: ${escapeHtml(alert.value ?? '--')}</span>
      <span>Threshold: ${escapeHtml(alert.threshold ?? '--')}</span>
      <span>${new Date(alert.createdAt || Date.now()).toLocaleString()}</span>
    </div>
    ${isActive ? `<button class="btn-secondary" data-alert-ack="${alert.id}">Acknowledge</button>` : ''}
  `;
  return item;
}

async function refreshAlerts() {
  if (!hasValidatedSession() || !isAdminUser()) {
    updateDashboardAlertBadge(0);
    return;
  }

  try {
    const response = await apiFetch('/alerts', { adminOnly: true, onForbidden: 'ignore' });

    if (!response || !response.ok) {
      throw new Error(`Alerts request failed with ${response?.status || 'no response'}`);
    }

    const data = await response.json();
    renderAlerts(data.alerts || []);
  } catch (error) {
    console.warn('[ALERTS] Failed to refresh alerts.', error.message);
  }
}

async function acknowledgeAlert(alertId) {
  if (!hasValidatedSession() || !isAdminUser()) {
    return;
  }

  try {
    const response = await apiFetch(`/alerts/${alertId}/acknowledge`, {
      method: 'PATCH',
      adminOnly: true,
      onForbidden: 'ignore'
    });

    if (!response || !response.ok) {
      throw new Error(`Alert acknowledge failed with ${response?.status || 'no response'}`);
    }

    await refreshAlerts();
  } catch (error) {
    showMetricsError('Could not acknowledge alert right now.');
  }
}

function renderAiAlertsAnalysis(data) {
  setMetricText(aiAlertsSummary, data.summary || 'No alert summary returned.');
  renderPlainList(aiAlertsCauses, data.likelyCauses);
  renderPlainList(aiAlertsChecks, data.recommendedFirstChecks);
  renderPlainList(aiAlertsActions, data.priorityActions);
  aiAlertsResults?.classList.remove('hidden');
}

function getFallbackAlertsAnalysis(alerts = []) {
  const activeAlerts = alerts.filter((alert) => alert.status === 'Active');

  return {
    summary: activeAlerts.length
      ? `${activeAlerts.length} active alert(s) are above configured thresholds.`
      : 'No active alerts are currently above configured thresholds.',
    likelyCauses: activeAlerts.length
      ? activeAlerts.map((alert) => `${alert.title}: ${alert.message}`)
      : ['Current metrics are within configured alert thresholds.'],
    recommendedFirstChecks: [
      'Review CPU, RAM, disk, latency, failed request, and AI failure counters.',
      'Check backend logs around the alert creation time.',
      'Confirm whether recent deploys or traffic changes match the alert timing.'
    ],
    priorityActions: activeAlerts.some((alert) => alert.severity === 'Critical')
      ? activeAlerts.filter((alert) => alert.severity === 'Critical').map((alert) => `Prioritize ${alert.title}.`)
      : ['Acknowledge reviewed warnings and continue monitoring.']
  };
}

async function analyzeAlertsWithAI() {
  if (!hasValidatedSession() || !isAdminUser()) {
    showMetricsError('Admin access required for alert analysis.');
    return;
  }

  aiAlertsLoading?.classList.remove('hidden');
  aiAlertsResults?.classList.add('hidden');

  if (aiAlertsBtn) {
    aiAlertsBtn.disabled = true;
  }

  try {
    if (!latestMetrics) {
      await pollMetrics();
    }

    const activeAlerts = latestAlerts.filter((alert) => alert.status === 'Active');
    const response = await apiFetch('/analyze-alerts', {
      method: 'POST',
      adminOnly: true,
      onForbidden: 'ignore',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        alerts: activeAlerts,
        metrics: latestMetrics
      })
    });

    if (!response || !response.ok) {
      throw new Error(`Alert AI request failed with ${response?.status || 'no response'}`);
    }

    renderAiAlertsAnalysis(await response.json());
    clearMetricsError();
  } catch (error) {
    console.warn('[AI ALERTS] Falling back to local alert explanation.', error.message);
    renderAiAlertsAnalysis(getFallbackAlertsAnalysis(latestAlerts));
  } finally {
    aiAlertsLoading?.classList.add('hidden');

    if (aiAlertsBtn) {
      aiAlertsBtn.disabled = false;
    }
  }
}

function renderAiMetricsAnalysis(data) {
  setAiMetricsHealthBadge(data.overallHealth);
  setMetricText(aiMetricsConfidence, `Confidence: ${data.confidenceLevel || '--'}`);
  setMetricText(aiMetricsSummary, data.summary || 'No summary returned.');
  renderPlainList(aiMetricsRisks, data.risks);
  renderPlainList(aiMetricsRecommendations, data.recommendations);
  renderPlainList(aiMetricsPriority, data.priorityActions);
  aiMetricsResults?.classList.remove('hidden');
}

function getSimulationBadgeClass(level) {
  if (level === 'Critical') return 'badge-critical';
  if (level === 'Warning') return 'badge-medium';
  return 'badge-low';
}

function renderSimulationScenarios() {
  if (!simulationScenarios) {
    return;
  }

  simulationScenarios.innerHTML = '';
  const categoryOrder = ['Availability', 'Performance', 'Web/Proxy', 'Security'];

  categoryOrder.forEach((category) => {
    const group = document.createElement('div');
    group.className = 'simulation-scenario-group';
    group.innerHTML = `<h3>${category}</h3>`;

    SIMULATION_SCENARIOS
      .filter((scenario) => scenario.category === category)
      .forEach((scenario) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'simulation-scenario-card';
        button.dataset.scenarioId = scenario.id;
        button.innerHTML = `
          <span class="badge ${getSimulationBadgeClass(scenario.level)}">${scenario.level}</span>
          <strong>${scenario.title}</strong>
          <span>${scenario.summary}</span>
        `;
        button.addEventListener('click', () => selectSimulationScenario(scenario.id));
        group.appendChild(button);
      });

    simulationScenarios.appendChild(group);
  });
}

function selectSimulationScenario(scenarioId) {
  const scenario = SIMULATION_SCENARIOS.find((item) => item.id === scenarioId);

  if (!scenario) {
    return;
  }

  selectedSimulationScenario = scenario;

  document.querySelectorAll('.simulation-scenario-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.scenarioId === scenarioId);
  });

  if (simulationAlertBadge) {
    simulationAlertBadge.textContent = scenario.level;
    simulationAlertBadge.className = `badge ${getSimulationBadgeClass(scenario.level)}`;
  }

  setMetricText(simulationSelectedTitle, scenario.title);
  setMetricText(simulationSelectedSummary, scenario.summary);
  setMetricText(simulationCpu, `${scenario.metrics.cpu}%`);
  setMetricText(simulationRam, `${scenario.metrics.ram}%`);
  setMetricText(simulationDisk, `${scenario.metrics.disk}%`);
  setMetricText(simulationLatency, `${scenario.metrics.latency} ms`);
  setMetricText(simulationLogPreview, scenario.log);
  setMetricText(simulationSymptom, scenario.commentary.symptom);
  renderPlainList(simulationCauses, scenario.commentary.causes);
  renderPlainList(simulationChecks, scenario.commentary.checks);
  setMetricText(simulationRisk, scenario.commentary.risk);
  setMetricText(simulationNextAction, scenario.commentary.nextAction);

  if (simulationAnalyzeBtn) {
    simulationAnalyzeBtn.disabled = false;
  }
}

function updateSimulationContextBanner(scenario) {
  const showBanner = Boolean(scenario) && isSimulationModeEnabled();
  simulationContextBanner?.classList.toggle('hidden', !showBanner);

  if (!showBanner) {
    return;
  }

  if (simulationContextLevel) {
    simulationContextLevel.textContent = scenario.level;
    simulationContextLevel.className = `badge ${getSimulationBadgeClass(scenario.level)}`;
  }

  setMetricText(simulationContextTitle, scenario.title);
  setMetricText(
    simulationContextSummary,
    `Simulated state only: ${scenario.summary} CPU ${scenario.metrics.cpu}%, RAM ${scenario.metrics.ram}%, Disk ${scenario.metrics.disk}%, Latency ${scenario.metrics.latency} ms.`
  );
}

async function analyzeSelectedSimulationScenario() {
  if (!selectedSimulationScenario) {
    return;
  }

  const scenario = selectedSimulationScenario;
  logInput.value = `[SIMULATION MODE ACTIVE]
Simulated incident: ${scenario.title}
Alert level: ${scenario.level}
Simulated CPU: ${scenario.metrics.cpu}%
Simulated RAM: ${scenario.metrics.ram}%
Simulated Disk: ${scenario.metrics.disk}%
Simulated API latency: ${scenario.metrics.latency} ms

${scenario.log}`;

  await analyzeCurrentInput();
  updateSimulationContextBanner(scenario);
  recordTimelineEvent(
    'simulation_scenario_analyzed',
    'Simulation',
    scenario.level,
    `Simulation scenario analyzed: ${scenario.title}.`,
    { scenarioId: scenario.id }
  );
}

function updateOperationalMetrics(metrics) {
  const requests = metrics.requests || {};
  const aiAnalyses = metrics.aiAnalyses || {};
  const runtime = metrics.runtime || {};
  const backendStatus = runtime.backendStatus || {};
  const processMemory = metrics.processMemory || {};
  const totalRequests = Number(requests.total || 0);
  const failedRequests = Number(requests.failed || 0);
  const successRate = totalRequests > 0
    ? ((totalRequests - failedRequests) / totalRequests) * 100
    : 100;
  const backendStatusText = backendStatus.pm2Managed
    ? `Running via PM2 #${backendStatus.pm2Id}`
    : (backendStatus.status || 'running');
  const refreshTime = metrics.timestamp
    ? new Date(metrics.timestamp).toLocaleTimeString()
    : '--';

  setMetricText(metricApiRequests, formatCount(requests.total));
  setMetricText(metricApiSuccessRate, `${successRate.toFixed(1)}%`);
  setMetricText(metricFailedRequests, formatCount(requests.failed));
  setMetricText(metricAverageLatency, `${Number(requests.averageLatencyMs || 0).toFixed(1)} ms`);
  setMetricText(metricAiSuccess, formatCount(aiAnalyses.successful));
  setMetricText(metricAiFailed, formatCount(aiAnalyses.failed));
  setMetricText(metricBackendUptime, formatUptime(runtime.uptimeSeconds));
  setMetricText(metricLastRefresh, refreshTime);
  setMetricText(metricProcessMemory, `RSS ${formatBytes(processMemory.rssBytes)}`);
  setMetricText(
    metricProcessHeap,
    `Heap ${formatBytes(processMemory.heapUsedBytes)} / ${formatBytes(processMemory.heapTotalBytes)} (${Number(processMemory.heapUsedPercent || 0).toFixed(1)}%)`
  );
  setMetricText(summaryHostname, runtime.hostname || '--');
  setMetricText(summaryPlatform, runtime.platform || '--');
  setMetricText(summaryNodeVersion, runtime.nodeVersion || '--');
  setMetricText(summaryBackendStatus, backendStatusText);
}

async function pollMetrics() {
  if (!hasValidatedSession()) {
    showMetricsError('Session expired. Please log in again.');
    handleExpiredSession();
    return;
  }

  if (!isMetricsDashboardVisible()) {
    return;
  }

  if (!isAdminUser()) {
    showMetricsError('Admin access required for live metrics.');
    return;
  }

  if (!initializeMetricsCharts()) {
    showMetricsError('Live charts could not load. Check the Chart.js script connection.');
    return;
  }

  try {
    const response = await apiFetch('/metrics', { adminOnly: true, onForbidden: 'ignore' });

    if (!response || !response.ok) {
      throw new Error(`Metrics request failed with ${response?.status || 'no response'}`);
    }

    const metrics = await response.json();
    handleLiveMetrics(metrics);
  } catch (error) {
    console.warn('[METRICS] Failed to refresh live metrics.', error.message);
    showMetricsError('Live metrics are temporarily unavailable.');
  }
}

async function analyzeMetricsWithAI() {
  if (!hasValidatedSession()) {
    showMetricsError('Session expired. Please log in again.');
    handleExpiredSession();
    return;
  }

  aiMetricsLoading?.classList.remove('hidden');
  aiMetricsResults?.classList.add('hidden');

  if (aiMetricsBtn) {
    aiMetricsBtn.disabled = true;
  }

  try {
    if (!latestMetrics) {
      await pollMetrics();
    }

    if (!latestMetrics) {
      throw new Error('No live metrics payload is available yet.');
    }

    const response = await apiFetch('/analyze-metrics', {
      method: 'POST',
      adminOnly: true,
      onForbidden: 'ignore',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        metrics: latestMetrics
      })
    });

    if (!response || !response.ok) {
      throw new Error(`Metrics AI analysis failed with ${response?.status || 'no response'}`);
    }

    const data = await response.json();
    renderAiMetricsAnalysis(data);
    clearMetricsError();
  } catch (error) {
    console.warn('[AI METRICS] Failed to analyze metrics.', error.message);
    showMetricsError('AI metrics analysis is temporarily unavailable.');
  } finally {
    aiMetricsLoading?.classList.add('hidden');

    if (aiMetricsBtn) {
      aiMetricsBtn.disabled = false;
    }
  }
}

// ==========================================
// HOST TELEMETRY POLLER (GET /api/status)
// ==========================================

async function pollServerHealth() {
  const statusIndicator = document.querySelector('.status-indicator');
  const pulseDot = document.querySelector('.pulse-dot');
  const statusText = document.querySelector('.status-text');

  try {
    const res = await fetch(`${API_BASE_URL}/status`);
    if (!res.ok) throw new Error('API down');
    const data = await res.json();
    
    isOfflineMode = false;

    // Reset status indicator styling
    if (statusIndicator) {
      statusIndicator.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
      statusIndicator.style.borderColor = 'rgba(16, 185, 129, 0.2)';
    }
    if (pulseDot) {
      pulseDot.style.backgroundColor = 'var(--color-success)';
    }
    if (statusText) {
      statusText.textContent = 'Server Connected';
      statusText.style.color = 'var(--color-success)';
    }

    // Update Uptime metrics
    uptimeVal.textContent = data.uptime;
    uptimeVal.style.color = 'var(--color-primary)';
    
    // Memory progress metrics
    const memUsage = data.memoryUsage;
    memPercent.textContent = memUsage.percentUsed;
    memFill.style.width = memUsage.percentUsed;
    memDetails.textContent = `${memUsage.used} / ${memUsage.total} used`;
    
    // Toggle color boundaries for server alert triggers
    const memNum = parseFloat(memUsage.percentUsed);
    memFill.className = 'progress-bar-fill';
    if (memNum >= 90) memFill.classList.add('progress-critical');
    else if (memNum >= 75) memFill.classList.add('progress-high');
    
    // Disk progress metrics
    const diskUsage = data.diskUsage;
    diskPercent.textContent = diskUsage.percentUsed;
    diskFill.style.width = diskUsage.percentUsed;
    diskDetails.textContent = `${diskUsage.free} free out of ${diskUsage.total}`;
    
    const diskNum = parseFloat(diskUsage.percentUsed);
    diskFill.className = 'progress-bar-fill';
    if (diskNum >= 90) diskFill.classList.add('progress-critical');
    else if (diskNum >= 75) diskFill.classList.add('progress-high');

    // Last updated ticker
    const now = new Date();
    lastPolledText.textContent = now.toLocaleTimeString();

  } catch (err) {
    console.warn('[POLLER] Failed connecting to API server health route. Switching to localized Simulation Mode.', err.message);
    
    isOfflineMode = true;

    // Modify status indicator to show amber warning (Offline / Simulation active)
    if (statusIndicator) {
      statusIndicator.style.backgroundColor = 'rgba(245, 158, 11, 0.08)';
      statusIndicator.style.borderColor = 'rgba(245, 158, 11, 0.25)';
    }
    if (pulseDot) {
      pulseDot.style.backgroundColor = 'var(--color-warning)';
    }
    if (statusText) {
      statusText.textContent = 'Server Offline';
      statusText.style.color = 'var(--color-warning)';
    }

    // Provide high-fidelity simulated server health parameters
    uptimeVal.textContent = "24,850 seconds (Simulated)";
    uptimeVal.style.color = "var(--color-warning)";

    memPercent.textContent = "64.2%";
    memFill.style.width = "64.2%";
    memDetails.textContent = "10.3 GB / 16.0 GB used";
    memFill.className = 'progress-bar-fill';

    diskPercent.textContent = "56.1%";
    diskFill.style.width = "56.1%";
    diskDetails.textContent = "112.5 GB free out of 256.0 GB";
    diskFill.className = 'progress-bar-fill';

    const now = new Date();
    lastPolledText.textContent = now.toLocaleTimeString() + " (Offline)";
  }
}

// Header Clock ticking logic
function updateHeaderClock() {
  const clock = new Date();
  headerClock.textContent = clock.toLocaleTimeString('en-US', { hour12: false });
}

function getSavedView() {
  const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
  return VALID_VIEWS.has(savedView) ? savedView : DEFAULT_VIEW;
}

function isSimulationModeEnabled() {
  return localStorage.getItem(SIMULATION_STORAGE_KEY) === 'true';
}

function setSimulationMode(isEnabled, options = {}) {
  const { navigate = true } = options;

  localStorage.setItem(SIMULATION_STORAGE_KEY, String(Boolean(isEnabled)));

  simulationToggleBtn?.setAttribute('aria-pressed', String(Boolean(isEnabled)));
  if (simulationToggleBtn) {
    simulationToggleBtn.textContent = isEnabled ? 'Simulation: ON' : 'Simulation: OFF';
  }

  simulationLabBtn?.classList.toggle('hidden', !isEnabled);
  simulationActiveBadge?.classList.toggle('hidden', !isEnabled);

  if (!isEnabled) {
    updateSimulationContextBanner(null);
  }

  if (!navigate) {
    return;
  }

  if (isEnabled && hasValidatedSession()) {
    showSimulationLab();
  } else if (!isEnabled) {
    showAnalyzerView();
  }
}

function restoreSavedView() {
  if (!hasValidatedSession()) {
    return;
  }

  if (getSavedView() === 'dashboard') {
    showMetricsDashboard({ persist: false });
  } else if (getSavedView() === 'simulation' && isSimulationModeEnabled()) {
    showSimulationLab({ persist: false });
  } else if (getSavedView() === 'security') {
    showSecurityCenter({ persist: false });
  } else if (getSavedView() === 'inbox') {
    showInboxView({ persist: false });
  } else if (getSavedView() === 'timeline') {
    showTimelineView({ persist: false });
  } else if (getSavedView() === 'audit') {
    showAuditLogsView({ persist: false });
  } else if (getSavedView() === 'governance') {
    showGovernanceView({ persist: false });
  } else {
    showAnalyzerView({ persist: false });
  }
}

function showMetricsDashboard(options = {}) {
  if (!hasValidatedSession() || !isAdminUser()) {
    return;
  }

  const { persist = true } = options;

  analyzerView?.classList.add('hidden');
  simulationLabView?.classList.add('hidden');
  securityCenterView?.classList.add('hidden');
  inboxView?.classList.add('hidden');
  governanceView?.classList.add('hidden');
  timelineView?.classList.add('hidden');
  auditLogsView?.classList.add('hidden');
  stopInboxPolling();
  metricsDashboardView?.classList.remove('hidden');
  dashboardViewBtn?.classList.add('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, 'dashboard');
  }

  requestAnimationFrame(() => {
    if (metricsCharts) {
      Object.values(metricsCharts).forEach((chart) => chart?.resize());
    }

    pollMetrics();
  });
}

function showAnalyzerView(options = {}) {
  const { persist = true } = options;

  metricsDashboardView?.classList.add('hidden');
  simulationLabView?.classList.add('hidden');
  securityCenterView?.classList.add('hidden');
  inboxView?.classList.add('hidden');
  governanceView?.classList.add('hidden');
  timelineView?.classList.add('hidden');
  auditLogsView?.classList.add('hidden');
  stopInboxPolling();
  analyzerView?.classList.remove('hidden');
  dashboardViewBtn?.classList.remove('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, DEFAULT_VIEW);
  }
}

function returnHomeToAnalyzer() {
  cancelActiveAnalysis();
  resetAnalysisResultPanel();
  showAnalyzerView();
}

function showSimulationLab(options = {}) {
  if (!hasValidatedSession() || !isSimulationModeEnabled()) {
    return;
  }

  const { persist = true } = options;

  analyzerView?.classList.add('hidden');
  metricsDashboardView?.classList.add('hidden');
  securityCenterView?.classList.add('hidden');
  inboxView?.classList.add('hidden');
  governanceView?.classList.add('hidden');
  timelineView?.classList.add('hidden');
  auditLogsView?.classList.add('hidden');
  stopInboxPolling();
  simulationLabView?.classList.remove('hidden');
  dashboardViewBtn?.classList.remove('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, 'simulation');
  }
}

function showSecurityCenter(options = {}) {
  if (!hasValidatedSession() || !isAdminUser()) {
    return;
  }

  const { persist = true } = options;

  analyzerView?.classList.add('hidden');
  metricsDashboardView?.classList.add('hidden');
  simulationLabView?.classList.add('hidden');
  inboxView?.classList.add('hidden');
  governanceView?.classList.add('hidden');
  timelineView?.classList.add('hidden');
  auditLogsView?.classList.add('hidden');
  stopInboxPolling();
  securityCenterView?.classList.remove('hidden');
  dashboardViewBtn?.classList.remove('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, 'security');
  }

  refreshSecurityCenter();
}

function showInboxView(options = {}) {
  if (!hasValidatedSession()) {
    return;
  }

  const { persist = true } = options;

  analyzerView?.classList.add('hidden');
  metricsDashboardView?.classList.add('hidden');
  simulationLabView?.classList.add('hidden');
  securityCenterView?.classList.add('hidden');
  governanceView?.classList.add('hidden');
  timelineView?.classList.add('hidden');
  auditLogsView?.classList.add('hidden');
  inboxView?.classList.remove('hidden');
  dashboardViewBtn?.classList.remove('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, 'inbox');
  }

  loadTickets();
  startInboxPolling();
}

function showTimelineView(options = {}) {
  if (!hasValidatedSession() || !isAdminUser()) {
    return;
  }

  const { persist = true } = options;

  analyzerView?.classList.add('hidden');
  metricsDashboardView?.classList.add('hidden');
  simulationLabView?.classList.add('hidden');
  securityCenterView?.classList.add('hidden');
  inboxView?.classList.add('hidden');
  governanceView?.classList.add('hidden');
  auditLogsView?.classList.add('hidden');
  stopInboxPolling();
  timelineView?.classList.remove('hidden');
  dashboardViewBtn?.classList.remove('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, 'timeline');
  }

  loadTimelineEvents();
}

function showAuditLogsView(options = {}) {
  if (!hasValidatedSession() || !isAdminUser()) {
    return;
  }

  const { persist = true } = options;

  analyzerView?.classList.add('hidden');
  metricsDashboardView?.classList.add('hidden');
  simulationLabView?.classList.add('hidden');
  securityCenterView?.classList.add('hidden');
  inboxView?.classList.add('hidden');
  governanceView?.classList.add('hidden');
  timelineView?.classList.add('hidden');
  stopInboxPolling();
  auditLogsView?.classList.remove('hidden');
  dashboardViewBtn?.classList.remove('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, 'audit');
  }

  loadAuditLogs();
}

function showGovernanceView(options = {}) {
  if (!hasValidatedSession()) {
    return;
  }

  const { persist = true } = options;

  analyzerView?.classList.add('hidden');
  metricsDashboardView?.classList.add('hidden');
  simulationLabView?.classList.add('hidden');
  securityCenterView?.classList.add('hidden');
  inboxView?.classList.add('hidden');
  timelineView?.classList.add('hidden');
  auditLogsView?.classList.add('hidden');
  stopInboxPolling();
  governanceView?.classList.remove('hidden');
  dashboardViewBtn?.classList.remove('active-view');

  if (persist) {
    localStorage.setItem(VIEW_STORAGE_KEY, 'governance');
  }

  renderGovernanceHistory();
}

function applyTheme(theme) {
  const normalizedTheme = theme === 'light' ? 'light' : 'dark';

  document.documentElement.dataset.theme = normalizedTheme;
  localStorage.setItem('themePreference', normalizedTheme);

  if (themeToggleBtn) {
    const isLight = normalizedTheme === 'light';
    themeToggleBtn.textContent = isLight ? 'Dark Mode' : 'Light Mode';
    themeToggleBtn.setAttribute('aria-pressed', String(isLight));
  }

  if (metricsCharts) {
    destroyMetricsCharts();
    if (isMetricsDashboardVisible()) {
      if (!isLiveConnected) {
        requestAnimationFrame(pollMetrics);
      }
    }
  }
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
}

function setOperationsPanelCollapsed(isCollapsed) {
  const collapsed = Boolean(isCollapsed);
  document.body.classList.toggle('operations-collapsed', collapsed);
  operationsPanel?.classList.toggle('is-collapsed', collapsed);
  operationsToggleBtn?.setAttribute('aria-expanded', String(!collapsed));

  if (operationsToggleBtn) {
    operationsToggleBtn.textContent = collapsed ? 'Show side panel' : 'Hide side panel';
  }

  localStorage.setItem(OPERATIONS_COLLAPSED_KEY, String(collapsed));
}

function initializeOperationsPanelState() {
  setOperationsPanelCollapsed(localStorage.getItem(OPERATIONS_COLLAPSED_KEY) === 'true');
}

function isCompactAnalyzerLayout() {
  return window.matchMedia(`(max-width: ${INPUT_COLLAPSE_BREAKPOINT}px)`).matches;
}

function setInputPanelCollapsed(isCollapsed) {
  const collapsed = Boolean(isCollapsed) && !isCompactAnalyzerLayout();
  document.body.classList.toggle('input-collapsed', collapsed);
  document.querySelector('.left-column')?.classList.toggle('is-input-collapsed', collapsed);
  inputToggleBtn?.setAttribute('aria-expanded', String(!collapsed));

  if (inputToggleBtn) {
    inputToggleBtn.textContent = collapsed ? 'Show input' : 'Hide input';
  }
}

function collapseInputPanelAfterAnalysisStart() {
  if (!isCompactAnalyzerLayout()) {
    setInputPanelCollapsed(true);
  }
}

function expandInputPanel() {
  setInputPanelCollapsed(false);
}

function focusResultPanelAfterAnalysisStart(force = false) {
  const resultPanel = document.querySelector('.panel-result');

  if (!resultPanel) {
    return;
  }

  resultPanel.setAttribute('tabindex', '-1');

  if (force || isCompactAnalyzerLayout()) {
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  requestAnimationFrame(() => {
    resultPanel.focus({ preventScroll: true });
  });
}

function setHistoryVisible(isVisible) {
  historyContent?.classList.toggle('hidden', !isVisible);

  if (toggleHistoryBtn) {
    toggleHistoryBtn.textContent = isVisible ? 'Hide History' : 'Show History';
    toggleHistoryBtn.setAttribute('aria-expanded', String(isVisible));
  }
}

function resetAnalysisLoadingState() {
  analysisLoadingState?.classList.add('hidden');
  analysisEmptyState?.classList.toggle('hidden', Boolean(activeAnalysisResult));
  analysisResultsPanel?.classList.toggle('hidden', !activeAnalysisResult);

  if (analyzeBtn) {
    analyzeBtn.disabled = false;
  }
}

function resetAnalysisResultPanel() {
  activeAnalysisResult = null;
  currentActiveLog = '';
  selectedSimulationScenario = null;
  updateSimulationContextBanner(null);
  expandInputPanel();

  analysisLoadingState?.classList.add('hidden');
  analysisResultsPanel?.classList.add('hidden');
  analysisEmptyState?.classList.remove('hidden');
  severityContainer?.classList.add('hidden');
  commandsPanel?.classList.add('hidden');
  reportPanel?.classList.add('hidden');
  remediationPanel?.classList.add('hidden');
  commandsLoadingState?.classList.add('hidden');
  reportLoadingState?.classList.add('hidden');
  remediationLoadingState?.classList.add('hidden');

  if (commandsContent) {
    commandsContent.classList.add('hidden');
  }

  if (reportContent) {
    reportContent.classList.add('hidden');
  }

  if (remediationContent) {
    remediationContent.classList.add('hidden');
  }

  if (analyzeBtn) {
    analyzeBtn.disabled = false;
  }
}

function cancelActiveAnalysis() {
  analysisRequestId += 1;

  if (activeAnalysisAbortController) {
    activeAnalysisAbortController.abort();
    activeAnalysisAbortController = null;
  }

  resetAnalysisLoadingState();
}

function performSessionLogout() {
  if (hasValidatedSession()) {
    apiFetch('/logout', {
      method: 'POST',
      keepalive: true
    }).catch(() => {
      // Logout audit reporting should never block local session cleanup.
    });
  }
  cancelActiveAnalysis();
  clearAuthState();
  setSimulationMode(false);
  applyRoleAccess();
  showAnalyzerView({ persist: false });
  loginScreen.classList.remove('hidden');
}

function handleInactivityLogout() {
  if (!localStorage.getItem('authToken')) {
    return;
  }

  if (loginError) {
    loginError.textContent = 'Session expired due to inactivity. Please log in again.';
    loginError.classList.remove('hidden');
  }

  performSessionLogout();
}

function getCurrentRole() {
  return isSessionValidated && validatedSessionRole === 'admin' ? 'admin' : 'user';
}

function isAdminUser() {
  return getCurrentRole() === 'admin';
}

function hasValidatedSession() {
  return Boolean(localStorage.getItem('authToken')) && isSessionValidated;
}

function applyRoleAccess() {
  const hasToken = hasValidatedSession();
  const isAdmin = hasToken && isAdminUser();

  if (roleBadge) {
    roleBadge.textContent = isAdmin ? 'Role: Admin' : 'Role: User';
    roleBadge.classList.toggle('hidden', !hasToken);
    roleBadge.classList.toggle('role-admin', isAdmin);
  }

  dashboardViewBtn?.classList.toggle('hidden', !isAdmin);
  securityCenterBtn?.classList.toggle('hidden', !isAdmin);
  timelineViewBtn?.classList.toggle('hidden', !isAdmin);
  auditLogsViewBtn?.classList.toggle('hidden', !isAdmin);
  inboxViewBtn?.classList.toggle('hidden', !hasToken);
  historyContent?.classList.add('hidden');
  document.getElementById('history-panel')?.classList.toggle('hidden', !hasToken);
  clearLocalHistoryBtn?.classList.toggle('hidden', !isAdmin);
  ticketsPanel?.classList.toggle('hidden', !hasToken);

  if (ticketsTitle) {
    ticketsTitle.textContent = isAdmin ? 'Admin Inbox / Message User' : 'Support / Feedback';
  }

  if (inboxViewBtn) {
    inboxViewBtn.textContent = isAdmin ? 'Admin Inbox' : 'My Tickets';
  }

  if (document.getElementById('inbox-title')) {
    document.getElementById('inbox-title').textContent = isAdmin ? 'Admin Inbox' : 'My Tickets';
  }

  if (ticketMessage) {
    ticketMessage.placeholder = isAdmin
      ? 'Create a user-facing ticket/message or reply from the inbox below.'
      : 'Send a ticket, suggestion, or feedback note to the admin.';
  }

  if (submitTicketBtn) {
    submitTicketBtn.textContent = isAdmin ? 'Create user-facing ticket' : 'Submit to Admin';
  }

  if (!isAdmin && ['dashboard', 'security', 'timeline', 'audit'].includes(getSavedView())) {
    showAnalyzerView();
  }

  if (hasToken) {
    refreshInboxNotificationStatus();
  }
}

function resetInactivityTimer() {
  if (!hasValidatedSession()) {
    return;
  }

  if (inactivityTimeoutId) {
    clearTimeout(inactivityTimeoutId);
  }

  inactivityTimeoutId = setTimeout(handleInactivityLogout, INACTIVITY_TIMEOUT_MS);
}

function startInboxPolling() {
  if (inboxPollIntervalId || inboxView?.classList.contains('hidden')) {
    return;
  }

  inboxPollIntervalId = setInterval(loadTickets, INBOX_REFRESH_MS);
}

function stopInboxPolling() {
  if (inboxPollIntervalId) {
    clearInterval(inboxPollIntervalId);
    inboxPollIntervalId = null;
  }
}

function startInboxNotificationPolling() {
  if (!hasValidatedSession() || inboxNotificationPollIntervalId) {
    return;
  }

  refreshInboxNotificationStatus();
  inboxNotificationPollIntervalId = setInterval(refreshInboxNotificationStatus, INBOX_NOTIFICATION_REFRESH_MS);
}

function stopInboxNotificationPolling() {
  if (inboxNotificationPollIntervalId) {
    clearInterval(inboxNotificationPollIntervalId);
    inboxNotificationPollIntervalId = null;
  }
  updateInboxNotificationBadge(0);
}

function startAuthenticatedSession() {
  if (!localStorage.getItem('authToken') || !isSessionValidated) {
    return;
  }

  resetInactivityTimer();
  updateHeaderClock();

  if (!clockIntervalId) {
    clockIntervalId = setInterval(updateHeaderClock, 1000);
  }

  if (!healthPollIntervalId) {
    pollServerHealth();
    healthPollIntervalId = setInterval(pollServerHealth, HEALTH_REFRESH_MS);
  }

  connectLiveUpdates();
  startRestFallbackPolling();
}

function stopAuthenticatedSession() {
  disconnectLiveUpdates();
  stopInboxPolling();
  stopInboxNotificationPolling();

  if (inactivityTimeoutId) {
    clearTimeout(inactivityTimeoutId);
    inactivityTimeoutId = null;
  }

  if (healthPollIntervalId) {
    clearInterval(healthPollIntervalId);
    healthPollIntervalId = null;
  }

  stopMetricsPolling();

  if (clockIntervalId) {
    clearInterval(clockIntervalId);
    clockIntervalId = null;
  }

  destroyMetricsCharts();
  clearMetricsError();
  latestMetrics = null;
  latestAlerts = [];
  updateDashboardAlertBadge(0);
}

setSimulationMode(isSimulationModeEnabled(), { navigate: false });
applyRoleAccess();
applyTheme(localStorage.getItem('themePreference') || 'dark');
initializeOperationsPanelState();
validateSavedSession();

// ==========================================
// INTERACTIVE EVENT LISTENERS & LOGIC
// ==========================================

appHomeBtn?.addEventListener('click', returnHomeToAnalyzer);
dashboardViewBtn?.addEventListener('click', showMetricsDashboard);
securityCenterBtn?.addEventListener('click', showSecurityCenter);
inboxViewBtn?.addEventListener('click', showInboxView);
timelineViewBtn?.addEventListener('click', showTimelineView);
auditLogsViewBtn?.addEventListener('click', showAuditLogsView);
backToAnalyzerBtn?.addEventListener('click', showAnalyzerView);
securityBackBtn?.addEventListener('click', showAnalyzerView);
inboxBackBtn?.addEventListener('click', showAnalyzerView);
timelineBackBtn?.addEventListener('click', showAnalyzerView);
auditLogsBackBtn?.addEventListener('click', showAnalyzerView);
governanceBackBtn?.addEventListener('click', showAnalyzerView);
simulationToggleBtn?.addEventListener('click', () => setSimulationMode(!isSimulationModeEnabled()));
simulationLabBtn?.addEventListener('click', showSimulationLab);
simulationBackBtn?.addEventListener('click', showAnalyzerView);
themeToggleBtn?.addEventListener('click', toggleTheme);
operationsToggleBtn?.addEventListener('click', () => {
  setOperationsPanelCollapsed(!document.body.classList.contains('operations-collapsed'));
});
inputToggleBtn?.addEventListener('click', () => {
  setInputPanelCollapsed(!document.body.classList.contains('input-collapsed'));
});
window.addEventListener('resize', () => {
  if (isCompactAnalyzerLayout()) {
    setInputPanelCollapsed(false);
  }
});
aiMetricsBtn?.addEventListener('click', analyzeMetricsWithAI);
aiAlertsBtn?.addEventListener('click', analyzeAlertsWithAI);
toggleAlertsPanelBtn?.addEventListener('click', () => toggleCollapsiblePanel(alertsPanelBody, toggleAlertsPanelBtn));
toggleAiMetricsPanelBtn?.addEventListener('click', () => toggleCollapsiblePanel(aiMetricsPanelBody, toggleAiMetricsPanelBtn));
simulationAnalyzeBtn?.addEventListener('click', analyzeSelectedSimulationScenario);
securityAiReviewBtn?.addEventListener('click', reviewSecurityPostureWithAI);
submitTicketBtn?.addEventListener('click', submitTicketToAdmin);
refreshTicketsBtn?.addEventListener('click', loadTickets);
refreshTimelineBtn?.addEventListener('click', loadTimelineEvents);
refreshAuditLogsBtn?.addEventListener('click', loadAuditLogs);
acknowledgeGovernanceBtn?.addEventListener('click', acknowledgeGovernanceGuidance);
exportGovernanceBtn?.addEventListener('click', exportGovernanceHistory);
changeSimulationBtn?.addEventListener('click', showSimulationLab);
footerComplianceLink?.addEventListener('click', (event) => {
  event.preventDefault();
  showGovernanceView();
});
ticketList?.addEventListener('change', (event) => {
  const ticketId = event.target?.dataset?.ticketStatus;
  if (ticketId) {
    updateTicketStatus(ticketId, event.target.value);
  }
});
ticketList?.addEventListener('click', (event) => {
  const replyTicketId = event.target?.dataset?.ticketReplyBtn;
  const deleteTicketId = event.target?.dataset?.ticketDelete;
  const readTicketId = event.target?.dataset?.ticketRead;

  if (replyTicketId) {
    replyToTicket(replyTicketId);
    return;
  }

  if (readTicketId) {
    markTicketRead(readTicketId);
    return;
  }

  if (deleteTicketId) {
    deleteTicket(deleteTicketId);
  }
});

alertsList?.addEventListener('click', (event) => {
  const alertId = event.target?.dataset?.alertAck;

  if (alertId) {
    acknowledgeAlert(alertId);
  }
});

timelineFilters?.addEventListener('click', (event) => {
  const filter = event.target?.dataset?.timelineFilter;

  if (!filter) {
    return;
  }

  activeTimelineFilter = filter;
  timelineFilters.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.timelineFilter === filter);
  });
  renderTimelineEvents();
});
auditLogFilters?.addEventListener('click', (event) => {
  const filter = event.target?.dataset?.auditFilter;

  if (!filter) {
    return;
  }

  activeAuditLogFilter = filter;
  auditLogFilters.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.auditFilter === filter);
  });
  loadAuditLogs();
});
clearLocalHistoryBtn?.addEventListener('click', () => {
  sessionHistory = [];

  if (historyList) {
    historyList.innerHTML = '<li>Local history cleared for this browser view. Backend history was not deleted.</li>';
  }

  setHistoryVisible(true);
});
toggleHistoryBtn?.addEventListener('click', () => {
  const willShow = historyContent?.classList.contains('hidden');
  setHistoryVisible(Boolean(willShow));

  if (willShow) {
    renderHistory();
  }
});

ACTIVITY_EVENTS.forEach((eventName) => {
  window.addEventListener(eventName, resetInactivityTimer, { passive: true });
});

setHistoryVisible(false);
renderSimulationScenarios();

// Clear textarea logic
clearInputBtn.addEventListener('click', () => {
  expandInputPanel();
  logInput.value = "";
  logInput.focus();
});

async function analyzeCurrentInput() {
  const rawLogText = logInput.value.trim();

  if (!rawLogText) {
    alert("Please enter or select some system logs to analyze first.");
    logInput.focus();
    return;
  }

  currentActiveLog = rawLogText;
  const requestId = analysisRequestId + 1;
  analysisRequestId = requestId;

  if (activeAnalysisAbortController) {
    activeAnalysisAbortController.abort();
  }

  activeAnalysisAbortController = new AbortController();
  analyzeBtn.disabled = true;

  // Toggle Loading states on Dashboard Panel
  analysisEmptyState.classList.add('hidden');
  analysisResultsPanel.classList.add('hidden');
  severityContainer.classList.add('hidden');
  analysisLoadingState.classList.remove('hidden');

  // Collapse sub-panels for clean cycle recalculation
  commandsPanel.classList.add('hidden');
  reportPanel.classList.add('hidden');
  showAnalyzerView();
  collapseInputPanelAfterAnalysisStart();
  focusResultPanelAfterAnalysisStart();

  if (isOfflineMode) {
    // Zero-downtime Local Simulation Fallback
    console.log('[LOCAL RUN] Server offline. Simulating Log Analysis locally.');
    await new Promise(resolve => setTimeout(resolve, 800)); // smooth experience
    if (requestId !== analysisRequestId) {
      return;
    }
    const mockData = getMockAnalysis(rawLogText);
    activeAnalysisResult = mockData;
    renderAnalysisData(mockData);
    saveHistoryEntry(rawLogText, mockData);
    activeAnalysisAbortController = null;
    analyzeBtn.disabled = false;
    return;
  }

  try {
    const response = await apiFetch('/analyze-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        logText: rawLogText
      }),
      signal: activeAnalysisAbortController.signal
    });

    if (!response) {
      return;
    }

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (requestId !== analysisRequestId) {
      return;
    }
    activeAnalysisResult = data;

    // Compile and render the analysis result cards
    renderAnalysisData(data);
    saveHistoryEntry(rawLogText, data);

  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }

    console.warn('[API FETCH FAILED] Direct backend unreachable. Triggering automatic local simulation.', error);
    
    // Auto-fallback in case poller didn't catch the offline state yet
    isOfflineMode = true;
    await new Promise(resolve => setTimeout(resolve, 800));
    if (requestId !== analysisRequestId) {
      return;
    }
    const mockData = getMockAnalysis(rawLogText);
    activeAnalysisResult = mockData;
    renderAnalysisData(mockData);
  } finally {
    if (requestId === analysisRequestId) {
      activeAnalysisAbortController = null;
      resetAnalysisLoadingState();
    }
  }
}

// Primary Log Analyzer POST
analyzeBtn.addEventListener('click', analyzeCurrentInput);

// Render Analysis Data structure dynamically
function renderAnalysisData(data) {
  // 1. Severity Badge setup

let badgeText = "";
let badgeClass = "badge";

const sev = (data.severity || "medium").toLowerCase();

if (sev === "low") {
  badgeText = "✅ OK — No issue detected";
  badgeClass += " badge-low";
} 
else if (sev === "medium") {
  badgeText = "⚠️ Warning — Needs checking";
  badgeClass += " badge-medium";
} 
else if (sev === "high") {
  badgeText = "❌ High — Error detected";
  badgeClass += " badge-high";
} 
else if (sev === "critical") {
  badgeText = "🚨 Critical — Immediate attention needed";
  badgeClass += " badge-critical";
}

severityBadge.textContent = badgeText;
severityBadge.className = badgeClass;

  severityContainer.classList.remove('hidden');


  // 2. Summary details
  summaryText.textContent = data.summary;

// 2b. AI Incident Timeline
if (timelineList) {
  timelineList.innerHTML = "";

  if (data.timeline && data.timeline.length > 0) {
    data.timeline.forEach(step => {
      const item = document.createElement('div');
      item.className = `timeline-item timeline-${step.status || 'info'}`;

      item.innerHTML = `
        <strong>${step.title || 'Timeline step'}</strong>
        <p>${step.description || ''}</p>
      `;

      timelineList.appendChild(item);
    });
  } else {
    timelineList.innerHTML = "<p>No timeline available for this analysis.</p>";
  }
}

  // 3. Potential causes list
  causesList.innerHTML = "";
  if (data.rootCauses && data.rootCauses.length > 0) {
    data.rootCauses.forEach(cause => {
      const li = document.createElement('li');
      li.textContent = cause;
      causesList.appendChild(li);
    });
  } else {
    causesList.innerHTML = "<li>No specific root causes identified.</li>";
  }

  // 4. Recommended steps
  stepsList.innerHTML = "";
  if (data.recommendedSteps && data.recommendedSteps.length > 0) {
    const safeCommands = data.recommendedSteps
      .map(parseSafeCommandStep)
      .filter(Boolean);

    if (safeCommands.length > 0) {
      const groupLi = document.createElement('li');
      groupLi.className = 'command-group-actions';
      groupLi.appendChild(createCommandGroupHeader(safeCommands, 'AI troubleshooting safe commands'));
      stepsList.appendChild(groupLi);
    }

    data.recommendedSteps.forEach(step => {
      const li = document.createElement('li');
      const safeCommand = parseSafeCommandStep(step);

      if (safeCommand) {
        li.className = 'command-list-item';
        const note = document.createElement('span');
        note.className = 'command-note';
        note.textContent = 'Safe command to verify manually:';
        li.appendChild(note);
        li.appendChild(createCommandBlock(safeCommand, 'bash'));
      } else {
        li.textContent = step;
      }

      stepsList.appendChild(li);
    });
  } else {
    stepsList.innerHTML = "<li>Verify system general operational parameters manually.</li>";
  }

  // 5. Security Warn banner
  if (data.securityWarnings) {
    securityText.textContent = data.securityWarnings;
    securityCard.classList.remove('hidden');
  } else {
    securityCard.classList.add('hidden');
  }

  // 6. User limitations (requested by User)
  const limits = data.limitations || { confidenceLevel: "Medium", missingInformation: "N/A", manualVerification: "N/A" };
  confidenceBadge.textContent = limits.confidenceLevel;
  confidenceBadge.className = 'badge';
  
  const conf = (limits.confidenceLevel || 'Medium').toLowerCase();
  if (conf === 'low') confidenceBadge.classList.add('badge-high'); // uses warm red
  else if (conf === 'medium') confidenceBadge.classList.add('badge-medium'); // uses amber
  else if (conf === 'high') confidenceBadge.classList.add('badge-low'); // uses emerald

  missingInfoText.textContent = limits.missingInformation || "No extra system log context requested.";
  manualVerifyText.textContent = limits.manualVerification || "Audit basic service configurations manually.";

  // Transition UI displays
  analysisLoadingState.classList.add('hidden');
  analysisResultsPanel.classList.remove('hidden');
  
  // Smooth scroll to view results card
  analysisResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ==========================================
// COMMAND GENERATION WORKFLOW (POST /api/generate-commands)
// ==========================================

genCommandsBtn.addEventListener('click', async () => {
  if (!currentActiveLog || !activeAnalysisResult) return;

  // Render and activate command panels
  commandsPanel.classList.remove('hidden');
  commandsLoadingState.classList.remove('hidden');
  commandsContent.classList.add('hidden');
  
  // Reset Copy states
  copyCmdText.textContent = "Copy Script";
  copyCommandsBtn.classList.remove('copied');

  if (isOfflineMode) {
    // Zero-downtime Local Simulation Fallback
    console.log('[LOCAL RUN] Server offline. Simulating Command Generation locally.');
    await new Promise(resolve => setTimeout(resolve, 800));
    generatedCommandsText = getMockCommands(currentActiveLog);
    commandsOutputCode.innerHTML = parseMarkdownToHTML(generatedCommandsText);
    commandsLoadingState.classList.add('hidden');
    commandsContent.classList.remove('hidden');
    commandsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  try {
  const response = await apiFetch('/generate-commands', {
    method: 'POST',
    adminOnly: true,
    onForbidden: 'ignore',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      logText: currentActiveLog,
      analysis: activeAnalysisResult
    })
  });

    if (!response || !response.ok) throw new Error(`HTTP error ${response?.status || 'no response'}`);

    const data = await response.json();
    generatedCommandsText = data.commandsMarkdown;

    // Use lightweight local custom markdown-to-html renderer
    commandsOutputCode.innerHTML = parseMarkdownToHTML(generatedCommandsText);

    commandsLoadingState.classList.add('hidden');
    commandsContent.classList.remove('hidden');

    commandsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    console.warn('[API FETCH FAILED] Backend unreachable. Falling back to local command generation simulation.', err);
    
    // Auto-fallback
    isOfflineMode = true;
    await new Promise(resolve => setTimeout(resolve, 800));
    generatedCommandsText = getMockCommands(currentActiveLog);
    commandsOutputCode.innerHTML = parseMarkdownToHTML(generatedCommandsText);
    commandsLoadingState.classList.add('hidden');
    commandsContent.classList.remove('hidden');
    commandsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// Copy Commands trigger
copyCommandsBtn.addEventListener('click', () => {
  if (!generatedCommandsText) return;

  // Extracts just the raw bash lines out of the markdown blocks to simplify technician terminal paste
  const codeBlocks = [];
  const regex = /```(?:bash)?\n([\s\S]*?)\n```/g;
  let match;
  
  while ((match = regex.exec(generatedCommandsText)) !== null) {
    codeBlocks.push(match[1]);
  }

  const textToCopy = codeBlocks.length > 0 ? codeBlocks.join('\n\n') : generatedCommandsText;

  navigator.clipboard.writeText(textToCopy).then(() => {
    copyCmdText.textContent = "Copied!";
    copyCommandsBtn.classList.add('copied');
    
    setTimeout(() => {
      copyCmdText.textContent = "Copy Script";
      copyCommandsBtn.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Clipboard copy failed', err);
  });
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy-command], [data-copy-command-encoded], [data-copy-command-group]');

  if (!button) {
    return;
  }

  const command = button.dataset.copyCommandGroup
    || (button.dataset.copyCommandEncoded
    ? decodeURIComponent(button.dataset.copyCommandEncoded)
    : (button.dataset.copyCommand || ''));

  navigator.clipboard.writeText(command).then(() => {
    const originalText = button.textContent;
    button.textContent = 'Copied';
    button.classList.add('copied');

    setTimeout(() => {
      button.textContent = originalText || 'Copy';
      button.classList.remove('copied');
    }, 1600);
  }).catch(() => {
    button.textContent = 'Copy failed';

    setTimeout(() => {
      button.textContent = 'Copy';
    }, 1600);
  });
});

// ==========================================
// INCIDENT REPORT WORKFLOW (POST /api/generate-report)
// ==========================================

genReportBtn.addEventListener('click', async () => {
  if (!currentActiveLog || !activeAnalysisResult) return;

  reportPanel.classList.remove('hidden');
  reportLoadingState.classList.remove('hidden');
  reportContent.classList.add('hidden');

  copyRepText.textContent = "Copy Report";
  copyReportBtn.classList.remove('copied');

  if (isOfflineMode) {
    // Zero-downtime Local Simulation Fallback
    console.log('[LOCAL RUN] Server offline. Simulating Report Compilation locally.');
    await new Promise(resolve => setTimeout(resolve, 800));

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    generatedReportText = getMockReport(currentActiveLog, activeAnalysisResult).replace(/\[Current Date placeholder\]/g, dateStr);

    reportOutputPaper.innerHTML = parseMarkdownToHTML(generatedReportText);
    reportLoadingState.classList.add('hidden');
    reportContent.classList.remove('hidden');
    reportPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  try {
    const response = await apiFetch('/generate-report', {
       method: 'POST',
      adminOnly: true,
      onForbidden: 'ignore',
  headers: {
    'Content-Type': 'application/json'
  },
      body: JSON.stringify({
        logText: currentActiveLog,
        analysis: activeAnalysisResult
      })
    });



    if (!response || !response.ok) throw new Error(`HTTP error ${response?.status || 'no response'}`);

    const data = await response.json();

    // Replacements for formal current time indicator inside mock placeholders
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    generatedReportText = data.reportMarkdown.replace(/\[Current Date placeholder\]/g, dateStr);

    reportOutputPaper.innerHTML = parseMarkdownToHTML(generatedReportText);

    reportLoadingState.classList.add('hidden');
    reportContent.classList.remove('hidden');

    reportPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    console.warn('[API FETCH FAILED] Backend unreachable. Falling back to local report compiling simulation.', err);
    
    // Auto-fallback
    isOfflineMode = true;
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    generatedReportText = getMockReport(currentActiveLog, activeAnalysisResult).replace(/\[Current Date placeholder\]/g, dateStr);

    reportOutputPaper.innerHTML = parseMarkdownToHTML(generatedReportText);
    reportLoadingState.classList.add('hidden');
    reportContent.classList.remove('hidden');
    reportPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

genRemediationBtn?.addEventListener('click', generateRemediationPlan);

function renderRemediationPlan(plan) {
  renderPlainList(remediationActions, plan.immediateActions);
  renderCommandList(remediationCommands, plan.verificationCommands);
  renderPlainList(remediationRollback, plan.rollbackPlan);
  renderPlainList(remediationRisks, plan.riskNotes);
  renderPlainList(remediationEscalation, plan.escalationCriteria);
  remediationContent?.classList.remove('hidden');
}

function getFallbackRemediationPlan() {
  return {
    immediateActions: [
      'Confirm current service status and scope before making changes.',
      'Preserve relevant timestamps and recent logs.',
      'Apply the lowest-risk corrective action first.'
    ],
    verificationCommands: [
      'systemctl status <service> --no-pager',
      'journalctl -u <service> -n 80 --no-pager',
      'df -h',
      'free -h'
    ],
    rollbackPlan: [
      'Document configuration changes before applying them.',
      'Restore the last known-good configuration if verification worsens.',
      'Restart only the affected service after review.'
    ],
    riskNotes: [
      'Review before running commands.',
      'Avoid destructive commands and broad restarts without approval.'
    ],
    escalationCriteria: [
      'Escalate if the issue affects users after initial checks.',
      'Escalate immediately if compromise or data exposure is suspected.'
    ]
  };
}

async function generateRemediationPlan() {
  if (!activeAnalysisResult) {
    return;
  }

  remediationPanel?.classList.remove('hidden');
  remediationLoadingState?.classList.remove('hidden');
  remediationContent?.classList.add('hidden');

  try {
    const response = await apiFetch('/remediation-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        analysis: activeAnalysisResult,
        metrics: latestMetrics,
        alerts: latestAlerts.filter((alert) => alert.status === 'Active')
      })
    });

    if (!response || !response.ok) {
      throw new Error(`Remediation failed with ${response?.status || 'no response'}`);
    }

    renderRemediationPlan(await response.json());
  } catch (error) {
    renderRemediationPlan(getFallbackRemediationPlan());
  } finally {
    remediationLoadingState?.classList.add('hidden');
    remediationPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Copy Report triggers
copyReportBtn.addEventListener('click', () => {
  if (!generatedReportText) return;

  navigator.clipboard.writeText(generatedReportText).then(() => {
    copyRepText.textContent = "Copied!";
    copyReportBtn.classList.add('copied');
    
    setTimeout(() => {
      copyRepText.textContent = "Copy Report";
      copyReportBtn.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Clipboard copy failed', err);
  });
});

// Download markdown file locally
downloadReportBtn.addEventListener('click', () => {
  if (!generatedReportText) return;

  const blob = new Blob([generatedReportText], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  // Format clean incident identifier filename
  const cleanId = activeAnalysisResult ? activeAnalysisResult.summary.slice(0, 15).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : "syslog";
  link.setAttribute("href", url);
  link.setAttribute("download", `incident_report_${cleanId}.md`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

async function runQuickCheck(type) {
  const quickCheckInput = buildQuickCheckInput(type);

  if (!quickCheckInput) {
    return;
  }

  logInput.value = quickCheckInput;
  logInput.focus();
  analyzeBtn.disabled = true;

  try {
    await analyzeCurrentInput();
  } finally {
    analyzeBtn.disabled = false;
  }
}

function readGovernanceAcknowledgements() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GOVERNANCE_ACK_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGovernanceAcknowledgements(entries) {
  localStorage.setItem(GOVERNANCE_ACK_KEY, JSON.stringify(entries.slice(0, 50)));
}

function getCurrentUsername() {
  const storedUsername = isSessionValidated
    ? validatedSessionUsername
    : localStorage.getItem('username');

  if (storedUsername) {
    return storedUsername;
  }

  try {
    const payload = localStorage.getItem('authToken')?.split('.')[1];
    if (!payload) {
      return 'unknown';
    }

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(paddedPayload));
    return decoded.username || 'unknown';
  } catch {
    return 'unknown';
  }
}

function renderGovernanceHistory() {
  if (!governanceHistoryList) {
    return;
  }

  const entries = readGovernanceAcknowledgements();
  governanceHistoryList.innerHTML = '';

  if (!entries.length) {
    governanceHistoryList.innerHTML = '<li>No local acknowledgements yet.</li>';
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${new Date(entry.timestamp).toLocaleString()} - ${entry.username || 'unknown'} (${entry.role || 'unknown'}) - ${entry.version || GOVERNANCE_VERSION}`;
    governanceHistoryList.appendChild(li);
  });
}

function acknowledgeGovernanceGuidance() {
  const entries = readGovernanceAcknowledgements();
  entries.unshift({
    timestamp: new Date().toISOString(),
    username: getCurrentUsername(),
    role: getCurrentRole(),
    version: GOVERNANCE_VERSION
  });
  writeGovernanceAcknowledgements(entries);
  renderGovernanceHistory();

  if (governanceStatus) {
    governanceStatus.textContent = 'Guidance acknowledged locally in this browser.';
    governanceStatus.classList.remove('hidden');
  }
}

function exportGovernanceHistory() {
  const entries = readGovernanceAcknowledgements();
  const payload = {
    exportedAt: new Date().toISOString(),
    version: GOVERNANCE_VERSION,
    acknowledgements: entries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `governance-acknowledgements-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  if (governanceStatus) {
    governanceStatus.textContent = 'Acknowledgement history exported from this browser.';
    governanceStatus.classList.remove('hidden');
  }
}

function getTimelineBadgeClass(severity) {
  const normalizedSeverity = String(severity || 'Info').toLowerCase();

  if (normalizedSeverity === 'critical') return 'badge-critical';
  if (normalizedSeverity === 'warning') return 'badge-medium';
  return 'badge-status-default';
}

function renderTimelineEvents() {
  if (!incidentTimelineList) {
    return;
  }

  const filteredEvents = activeTimelineFilter === 'All'
    ? incidentTimelineEvents
    : incidentTimelineEvents.filter((event) => event.category === activeTimelineFilter);

  incidentTimelineList.innerHTML = '';

  if (!filteredEvents.length) {
    incidentTimelineList.innerHTML = '<p class="feedback-status">No timeline events for this filter.</p>';
    return;
  }

  filteredEvents.forEach((event) => {
    const item = document.createElement('article');
    item.className = 'timeline-feed-item';
    item.innerHTML = `
      <div class="timeline-feed-header">
        <span class="badge ${getTimelineBadgeClass(event.severity)}">${escapeHtml(event.severity || 'Info')}</span>
        <strong>${escapeHtml(event.type || 'event')}</strong>
        <span>${new Date(event.timestamp || Date.now()).toLocaleString()}</span>
      </div>
      <p>${escapeHtml(event.description || '')}</p>
      <div class="timeline-feed-meta">
        <span>Actor: ${escapeHtml(event.actor || 'system')}</span>
        <span>Role: ${escapeHtml(event.role || '--')}</span>
        <span>Category: ${escapeHtml(event.category || 'General')}</span>
      </div>
    `;
    incidentTimelineList.appendChild(item);
  });
}

async function loadTimelineEvents() {
  if (!hasValidatedSession() || !isAdminUser()) {
    return;
  }

  try {
    const response = await apiFetch('/timeline', { adminOnly: true, onForbidden: 'redirect' });

    if (!response || !response.ok) {
      throw new Error(`Timeline failed with ${response?.status || 'no response'}`);
    }

    incidentTimelineEvents = await response.json();
    renderTimelineEvents();
  } catch {
    if (incidentTimelineList) {
      incidentTimelineList.innerHTML = '<p class="feedback-status">Could not load timeline right now.</p>';
    }
  }
}

function getAuditCategory(action = '') {
  const normalizedAction = String(action || '');

  if (['login_success', 'login_failure', 'logout', 'authentication_missing', 'authentication_invalid'].includes(normalizedAction)) {
    return 'Auth';
  }

  if (normalizedAction.startsWith('ticket_')) {
    return 'Tickets';
  }

  if (normalizedAction.startsWith('alert_')) {
    return 'Alerts';
  }

  if (normalizedAction === 'authorization_denied' || normalizedAction.includes('security')) {
    return 'Security';
  }

  if (normalizedAction.includes('simulation')) {
    return 'Simulation';
  }

  if (normalizedAction.startsWith('ai_') || normalizedAction.includes('remediation') || normalizedAction.includes('commands') || normalizedAction.includes('report')) {
    return 'AI';
  }

  return 'General';
}

function getAuditBadgeClass(result) {
  const normalizedResult = String(result || '').toLowerCase();

  if (normalizedResult === 'success') return 'badge-low';
  if (normalizedResult === 'denied' || normalizedResult === 'failure') return 'badge-critical';
  return 'badge-status-default';
}

function renderAuditLogs() {
  if (!auditLogList) {
    return;
  }

  const filteredLogs = activeAuditLogFilter === 'All'
    ? auditLogEntries
    : auditLogEntries.filter((entry) => getAuditCategory(entry.action) === activeAuditLogFilter);

  auditLogList.innerHTML = '';

  if (!filteredLogs.length) {
    auditLogList.innerHTML = '<p class="feedback-status">No audit logs for this filter.</p>';
    return;
  }

  filteredLogs.forEach((entry) => {
    const metadata = entry.metadata && typeof entry.metadata === 'object'
      ? Object.entries(entry.metadata)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .slice(0, 4)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      : [];
    const item = document.createElement('article');
    item.className = 'timeline-feed-item audit-log-item';
    item.innerHTML = `
      <div class="timeline-feed-header">
        <span class="badge ${getAuditBadgeClass(entry.result)}">${escapeHtml(entry.result || 'recorded')}</span>
        <strong>${escapeHtml(entry.action || 'audit_event')}</strong>
        <span>${new Date(entry.timestamp || Date.now()).toLocaleString()}</span>
      </div>
      <p>${escapeHtml(entry.description || '')}</p>
      <div class="timeline-feed-meta">
        <span>Actor: ${escapeHtml(entry.actor || 'unknown')}</span>
        <span>Role: ${escapeHtml(entry.role || '--')}</span>
        <span>Resource: ${escapeHtml(entry.resourceType || 'general')}${entry.resourceId ? ` / ${escapeHtml(entry.resourceId)}` : ''}</span>
      </div>
      ${metadata.length ? `<div class="timeline-feed-meta audit-metadata">${metadata.map((itemText) => `<span>${escapeHtml(itemText)}</span>`).join('')}</div>` : ''}
    `;
    auditLogList.appendChild(item);
  });
}

async function loadAuditLogs() {
  if (!hasValidatedSession() || !isAdminUser()) {
    return;
  }

  try {
    const response = await apiFetch(`/audit-logs?category=${encodeURIComponent(activeAuditLogFilter)}&limit=300`, {
      adminOnly: true,
      onForbidden: 'redirect'
    });

    if (!response || !response.ok) {
      throw new Error(`Audit logs failed with ${response?.status || 'no response'}`);
    }

    const data = await response.json();
    auditLogEntries = Array.isArray(data.logs) ? data.logs : [];
    renderAuditLogs();
  } catch {
    if (auditLogList) {
      auditLogList.innerHTML = '<p class="feedback-status">Could not load audit logs right now.</p>';
    }
  }
}

function isTicketUnread(ticket) {
  const currentUsername = getCurrentUsername();
  const readBy = Array.isArray(ticket.readBy) ? ticket.readBy : null;

  if (readBy) {
    return !readBy.includes(currentUsername);
  }

  return ticket.from !== currentUsername;
}

function getUnreadTicketCount(tickets = []) {
  return tickets.filter(isTicketUnread).length;
}

function updateInboxNotificationBadge(count) {
  if (!inboxViewBtn) {
    return;
  }

  const numericCount = Math.max(0, Number(count) || 0);
  let badge = inboxViewBtn.querySelector('.inbox-notification-badge');

  if (!numericCount) {
    badge?.remove();
    inboxViewBtn.classList.remove('has-notification');
    return;
  }

  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'inbox-notification-badge';
    inboxViewBtn.appendChild(badge);
  }

  badge.textContent = numericCount > 9 ? '9+' : String(numericCount);
  inboxViewBtn.classList.add('has-notification');
}

async function fetchTicketsForCurrentRole() {
  const endpoint = isAdminUser() ? '/tickets/admin' : '/tickets/my';
  const response = await apiFetch(endpoint, {
    adminOnly: endpoint === '/tickets/admin',
    onForbidden: endpoint === '/tickets/admin' ? 'redirect' : 'throw'
  });

  if (!response || !response.ok) {
    throw new Error(`Tickets failed with ${response?.status || 'no response'}`);
  }

  return response.json();
}

async function refreshInboxNotificationStatus() {
  if (!hasValidatedSession()) {
    updateInboxNotificationBadge(0);
    return;
  }

  try {
    const tickets = await fetchTicketsForCurrentRole();
    updateInboxNotificationBadge(getUnreadTicketCount(tickets));
  } catch {
    updateInboxNotificationBadge(0);
  }
}

function getTicketStatusBadgeClass(status) {
  const normalizedStatus = String(status || 'New').toLowerCase();

  if (normalizedStatus === 'new') {
    return 'badge-status-new';
  }

  if (normalizedStatus === 'in progress') {
    return 'badge-status-progress';
  }

  if (normalizedStatus === 'resolved') {
    return 'badge-status-resolved';
  }

  return 'badge-status-default';
}

function renderTickets(tickets = []) {
  if (!ticketList) {
    return;
  }

  ticketList.innerHTML = '';

  if (!tickets.length) {
    ticketList.innerHTML = '<p class="feedback-status">No messages yet.</p>';
    return;
  }

  tickets.forEach((ticket) => {
    const item = document.createElement('div');
    item.className = 'ticket-item';
    const replies = Array.isArray(ticket.replies) ? ticket.replies : [];
    const repliesHtml = replies.length
      ? `<div class="ticket-replies">${replies.map((reply) => `<p><strong>${escapeHtml(reply.from)}:</strong> ${escapeHtml(reply.message)}</p>`).join('')}</div>`
      : '<p class="ticket-muted">No admin reply yet.</p>';
    const statusControl = isAdminUser()
      ? `<select data-ticket-status="${ticket.id}">
          ${['New', 'In progress', 'Resolved'].map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>`
      : '<span class="ticket-reply-spacer"></span>';
    const replyControls = `<div class="ticket-admin-controls">
        ${statusControl}
        <input type="text" data-ticket-reply="${ticket.id}" placeholder="${isAdminUser() ? 'Short admin reply' : 'Reply to admin message'}">
        <button class="btn-secondary" data-ticket-reply-btn="${ticket.id}">Reply</button>
      </div>`;
    const canDeleteTicket = isAdminUser() || ticket.from === getCurrentUsername();
    const deleteControl = canDeleteTicket
      ? `<button class="btn-secondary btn-danger-light" data-ticket-delete="${ticket.id}">Delete</button>`
      : '';
    const unread = isTicketUnread(ticket);
    const readControl = unread
      ? `<button class="btn-secondary" data-ticket-read="${ticket.id}">Mark as read</button>`
      : '<span class="ticket-read-state">Read</span>';

    item.innerHTML = `
      <div class="ticket-item-header">
        <span class="badge ${getTicketStatusBadgeClass(ticket.status)}">${escapeHtml(ticket.status || 'New')}</span>
        ${unread ? '<span class="badge badge-unread">Unread</span>' : ''}
        <strong>${escapeHtml(ticket.type || 'feedback')}</strong>
        <span>${escapeHtml(ticket.from || 'user')} · ${new Date(ticket.time).toLocaleString()}</span>
        ${readControl}
        ${deleteControl}
      </div>
      <p>${escapeHtml(ticket.message || '')}</p>
      ${repliesHtml}
      ${replyControls}
    `;
    ticketList.appendChild(item);
  });
}

async function loadTickets() {
  if (!hasValidatedSession()) {
    return;
  }

  try {
    const tickets = await fetchTicketsForCurrentRole();
    renderTickets(tickets);
    updateInboxNotificationBadge(getUnreadTicketCount(tickets));
  } catch (error) {
    if (ticketList) {
      ticketList.innerHTML = '<p class="feedback-status">Could not load messages right now.</p>';
    }
  }
}

async function submitTicketToAdmin() {
  const message = ticketMessage?.value.trim();

  if (!message) {
    if (ticketStatus) {
      ticketStatus.textContent = 'Please enter a message before submitting.';
      ticketStatus.classList.remove('hidden');
    }
    return;
  }

  if (submitTicketBtn) {
    submitTicketBtn.disabled = true;
  }

  try {
    const response = await apiFetch('/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: ticketType?.value || 'feedback',
        message
      })
    });

    if (!response || !response.ok) {
      throw new Error(`Feedback failed with ${response?.status || 'no response'}`);
    }

    ticketMessage.value = '';
    if (ticketStatus) {
      ticketStatus.textContent = isAdminUser() ? 'User-facing ticket created.' : 'Submitted to admin.';
      ticketStatus.classList.remove('hidden');
    }
    await loadTickets();
    refreshInboxNotificationStatus();
  } catch (error) {
    if (ticketStatus) {
      ticketStatus.textContent = 'Could not submit message right now.';
      ticketStatus.classList.remove('hidden');
    }
  } finally {
    if (submitTicketBtn) {
      submitTicketBtn.disabled = false;
    }
  }
}

async function updateTicketStatus(ticketId, status) {
  if (!isAdminUser()) {
    return;
  }

  await apiFetch(`/tickets/${ticketId}/status`, {
    method: 'PATCH',
    adminOnly: true,
    onForbidden: 'ignore',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  await loadTickets();
  refreshInboxNotificationStatus();
}

async function replyToTicket(ticketId) {
  const input = document.querySelector(`[data-ticket-reply="${ticketId}"]`);
  const message = input?.value.trim();

  if (!message) {
    return;
  }

  await apiFetch(`/tickets/${ticketId}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
  await loadTickets();
  refreshInboxNotificationStatus();
}

async function markTicketRead(ticketId) {
  try {
    const response = await apiFetch(`/tickets/${ticketId}/read`, {
      method: 'PATCH'
    });

    if (!response || !response.ok) {
      throw new Error(`Mark read failed with ${response?.status || 'no response'}`);
    }

    await loadTickets();
    refreshInboxNotificationStatus();
  } catch (error) {
    if (ticketStatus) {
      ticketStatus.textContent = 'Could not mark ticket as read right now.';
      ticketStatus.classList.remove('hidden');
    }
  }
}

async function deleteTicket(ticketId) {
  const confirmed = window.confirm('Delete this ticket from the shared ticket list?');

  if (!confirmed) {
    return;
  }

  try {
    const response = await apiFetch(`/tickets/${ticketId}`, {
      method: 'DELETE'
    });

    if (!response || !response.ok) {
      throw new Error(`Delete failed with ${response?.status || 'no response'}`);
    }

    await loadTickets();
    refreshInboxNotificationStatus();
  } catch (error) {
    if (ticketStatus) {
      ticketStatus.textContent = 'Could not delete ticket right now.';
      ticketStatus.classList.remove('hidden');
    }
  }
}



async function saveHistoryEntry(input, result) {
  sessionHistory.unshift({
    time: new Date().toISOString(),
    input: input.slice(0, 300),
    severity: result.severity || 'Unknown',
    summary: result.summary || 'No summary'
  });
  sessionHistory = sessionHistory.slice(0, 10);

  if (!isAdminUser()) {
    renderHistory();
    return;
  }

  const entry = {
    input: input.slice(0, 300),
    severity: result.severity || 'Unknown',
    summary: result.summary || 'No summary'
  };

  try {
    await apiFetch('/history', {
      method: 'POST',
      adminOnly: true,
      onForbidden: 'ignore',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(entry)
    });
  } catch (error) {
    console.warn('Could not save history file:', error);
  }

// Load history on page start
  renderHistory();
// Allow HTML button onclick to use this function
window.renderHistory = renderHistory;
}

async function renderHistory() {

  if (!historyList) return;

  if (!isAdminUser()) {
    historyList.innerHTML = '';

    if (sessionHistory.length === 0) {
      historyList.innerHTML = '<li>No local session history yet.</li>';
      return;
    }

    sessionHistory.forEach((item) => {
      const li = document.createElement('li');
      const time = new Date(item.time).toLocaleTimeString();
      li.textContent = `[${time}] ${item.input.slice(0, 80)} → ${item.severity}: ${item.summary}`;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        logInput.value = item.input;
        logInput.focus();
        analyzeBtn.click();
      });
      historyList.appendChild(li);
    });
    return;
  }

  try {
    const response = await apiFetch('/history', { adminOnly: true, onForbidden: 'ignore' });
    if (!response || !response.ok) {
      throw new Error(`History failed with ${response?.status || 'no response'}`);
    }
    const history = await response.json();

    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<li>No history yet.</li>';
      return;
    }

history.slice(0, 5).forEach(item => {
  const li = document.createElement('li');
  const time = new Date(item.time).toLocaleTimeString();

  li.textContent = `[${time}] ${item.input.slice(0, 80)} → ${item.severity}: ${item.summary}`;
  li.style.cursor = 'pointer';

  li.addEventListener('click', () => {
    logInput.value = item.input;
    logInput.focus();
    analyzeBtn.click();
  });

  historyList.appendChild(li);
});


  } catch (error) {
    historyList.innerHTML = '<li>Could not load history.</li>';
  }
}

// Load history on page start
renderHistory();
window.renderHistory = renderHistory;
