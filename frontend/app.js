/**
 * AI Ops Assistant - Frontend Application Logic
 * Implements real-time server polling, demo log injections,
 * markdown parsing, copy behaviors, and diagnostic workflows.
 * 
 * NOTE: Seamless Offline Mode integrated. If the backend server is 
 * not running (Failed to fetch), the application automatically falls 
 * back to a local simulation engine to guarantee functional demonstrations.
 */

const API_BASE_URL = "/api";

// Host Configuration

// Live Server Log Templates
const LOG_TEMPLATES = {
  'nginx-502': `2026-05-25 10:45:23 [error] 1420#1420: *4512 connect() failed (111: Connection refused) while connecting to upstream, client: 192.168.1.50, server: example.com, request: "GET /api/v1/metrics HTTP/1.1", upstream: "http://127.0.0.1:8000/api/v1/metrics", host: "example.com"\n2026-05-25 10:45:25 [error] 1420#1420: *4513 connect() failed (111: Connection refused) while connecting to upstream, client: 192.168.1.52, server: example.com, request: "POST /api/v1/auth HTTP/1.1", upstream: "http://127.0.0.1:8000/api/v1/auth", host: "example.com"`,
  
  'ssh-bruteforce': `May 25 10:55:01 admin-node sshd[8045]: Invalid user admin from 192.168.1.150 port 49282\nMay 25 10:55:02 admin-node sshd[8045]: Connection closed by invalid user admin 192.168.1.150 port 49282 [preauth]\nMay 25 10:55:04 admin-node sshd[8049]: Invalid user admin1 from 192.168.1.150 port 49286\nMay 25 10:55:05 admin-node sshd[8049]: Failed password for invalid user admin1 from 192.168.1.150 port 49286 ssh2\nMay 25 10:55:08 admin-node sshd[8055]: Invalid user oracle from 192.168.1.150 port 49290\nMay 25 10:55:09 admin-node sshd[8055]: Failed password for invalid user oracle from 192.168.1.150 port 49290 ssh2`,
  
  'linux-oom': `[10523.450122] Out of memory: Killed process 4056 (java) total-vm:4302196kB, anon-rss:2502140kB, file-rss:0kB, shmem-rss:0kB, UID:1001 pgtables:8204kB oom_score_adj:0\n[10523.450250] oom_reaper: reaped process 4056 (java), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB\n[10523.450310] systemd[1]: tomcat.service: Main process exited, code=killed, status=9/KILL\n[10523.450450] systemd[1]: tomcat.service: Failed with result 'oom-killer'.`,
  
  'apache-forbidden': `[Mon May 25 11:02:14.298104 2026] [authz_core:error] [pid 1234:tid 5678] [client 192.168.1.60:50110] AH01630: client denied by server configuration: /var/www/html/secure/\n[Mon May 25 11:02:18.520412 2026] [autoindex:error] [pid 1234:tid 5682] [client 192.168.1.60:50110] AH01276: Cannot serve directory /var/www/html/secure/: No matching DirectoryIndex (index.html,index.php) found, and server-generated directory index forbidden by Options directive`
};

// Global States
let activeAnalysisResult = null;
let currentActiveLog = "";
let isOfflineMode = false;

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

const demoSelect = document.getElementById('demo-select');
const logInput = document.getElementById('log-input');
const clearInputBtn = document.getElementById('clear-input-btn');
const analyzeBtn = document.getElementById('analyze-btn');

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
const reportPanel = document.getElementById('report-panel');
const reportLoadingState = document.getElementById('report-loading-state');
const reportContent = document.getElementById('report-content');
const reportOutputPaper = document.getElementById('report-output-paper');
const copyReportBtn = document.getElementById('copy-report-btn');
const copyRepText = document.getElementById('copy-rep-text');
const downloadReportBtn = document.getElementById('download-report-btn');

const historyList = document.getElementById('history-list');

let generatedCommandsText = "";
let generatedReportText = "";

// ==========================================
// LOCAL MOCK DIAGNOSTIC ENGINE (Simulation)
// ==========================================

function getMockAnalysis(logText = '') {
  const text = logText.toLowerCase();

  if (
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

  if (
    text.includes('command not found') ||
    text.includes('unknown command') ||
    text.includes('not recognized') ||
    text.includes('invalid option') ||
    text.includes('no such file or directory')
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
  
  let html = markdown;

  // HTML Character Safety Escapes (excluding code backticks)
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
  
  // Code block parsing with styling hooks
  html = html.replace(/```bash\n([\s\S]*?)\n```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/```\n([\s\S]*?)\n```/g, '<pre><code>$1</code></pre>');
  
  // Bullet lists
  html = html.replace(/^\*\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');

  // Inline ticks
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');
  
  return html;
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
      statusText.textContent = 'Server API Connected';
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
      statusText.textContent = 'Demo Mode (Offline)';
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

// Initialize Poller loops
pollServerHealth();
updateHeaderClock();
setInterval(pollServerHealth, 10000);
setInterval(updateHeaderClock, 1000);

// ==========================================
// INTERACTIVE EVENT LISTENERS & LOGIC
// ==========================================

// Demo Selector loader
demoSelect.addEventListener('change', (e) => {
  const templateKey = e.target.value;
  if (LOG_TEMPLATES[templateKey]) {
    logInput.value = LOG_TEMPLATES[templateKey];
    logInput.focus();
  }
});

// Clear textarea logic
clearInputBtn.addEventListener('click', () => {
  logInput.value = "";
  demoSelect.selectedIndex = 0;
  logInput.focus();
});

// Primary Log Analyzer POST
analyzeBtn.addEventListener('click', async () => {
  const rawLogText = logInput.value.trim();
  
  if (!rawLogText) {
    alert("Please enter or select some system logs to analyze first.");
    logInput.focus();
    return;
  }

  currentActiveLog = rawLogText;

  // Toggle Loading states on Dashboard Panel
  analysisEmptyState.classList.add('hidden');
  analysisResultsPanel.classList.add('hidden');
  severityContainer.classList.add('hidden');
  analysisLoadingState.classList.remove('hidden');

  // Collapse sub-panels for clean cycle recalculation
  commandsPanel.classList.add('hidden');
  reportPanel.classList.add('hidden');

  if (isOfflineMode) {
    // Zero-downtime Local Simulation Fallback
    console.log('[LOCAL RUN] Server offline. Simulating Log Analysis locally.');
    await new Promise(resolve => setTimeout(resolve, 800)); // smooth experience
    const mockData = getMockAnalysis(rawLogText);
    activeAnalysisResult = mockData;
    renderAnalysisData(mockData);
    saveHistoryEntry(rawLogText, mockData);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/analyze-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logText: rawLogText })
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    activeAnalysisResult = data;
    
    // Compile and render the analysis result cards
    renderAnalysisData(data);
saveHistoryEntry(rawLogText, data);

  } catch (error) {
    console.warn('[API FETCH FAILED] Direct backend unreachable. Triggering automatic local simulation.', error);
    
    // Auto-fallback in case poller didn't catch the offline state yet
    isOfflineMode = true;
    await new Promise(resolve => setTimeout(resolve, 800));
    const mockData = getMockAnalysis(rawLogText);
    activeAnalysisResult = mockData;
    renderAnalysisData(mockData);
  }
});

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
  badgeText = "⚠️ Warning — Unknown command or needs checking";
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
    data.recommendedSteps.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
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
    const response = await fetch(`${API_BASE_URL}/generate-commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logText: currentActiveLog,
        analysis: activeAnalysisResult
      })
    });

    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    
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
    const response = await fetch(`${API_BASE_URL}/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        logText: currentActiveLog,
        analysis: activeAnalysisResult
      })
    });

    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

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
  logInput.value = `Running ${type} check...`;
  analyzeBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/run-safe-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkType: type })
    });

    if (!response.ok) {
      throw new Error(`Safe check failed with HTTP ${response.status}`);
    }

    const data = await response.json();

    logInput.value = `Command:\n${data.command}\n\nOutput:\n${data.output}`;

    analyzeBtn.disabled = false;
    analyzeBtn.click();

  } catch (error) {
    analyzeBtn.disabled = false;
    logInput.value = `Safe check failed:\n${error.message}`;
  }
}



async function saveHistoryEntry(input, result) {
  const entry = {
    input: input.slice(0, 300),
    severity: result.severity || 'Unknown',
    summary: result.summary || 'No summary'
  };

  try {
    await fetch(`${API_BASE_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  try {
    const response = await fetch(`${API_BASE_URL}/history`);
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

