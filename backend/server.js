import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';

const execPromise = promisify(exec);

import {
  LOG_ANALYZER_PROMPT,
  COMMAND_GENERATOR_PROMPT,
  REPORT_GENERATOR_PROMPT
} from './prompts/systemPrompt.js';


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Determine AI Provider configuration
const aiProvider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const apiKey = process.env.OPENAI_API_KEY;
const isDemoMode = aiProvider === 'openai' && (!apiKey || apiKey === 'your_openai_api_key_here');

// Initialize Active Services
let openai = null;
const openAIModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

if (aiProvider === 'openai') {
  if (!isDemoMode) {
    openai = new OpenAI({
      apiKey: apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    });
    console.log(`[INIT] GenAI configured for OPENAI using model: ${openAIModel}`);
  } else {
    console.warn('[WARNING] Running in DEMO/MOCK mode because no valid OpenAI key is configured.');
  }
} else if (aiProvider === 'groq') {
  openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
  });

  console.log(`[INIT] GenAI configured for GROQ using model: ${process.env.GROQ_MODEL || 'llama-3.1-8b-instant'}`);

} else if (aiProvider === 'ollama') {
  console.log(`[INIT] GenAI configured for OLLAMA at ${ollamaBaseUrl} using model: ${ollamaModel}`);
} else {
  console.error(`[CONFIG ERROR] Unsupported AI_PROVIDER: ${aiProvider}. Defaulting backend to Demo Mode.`);
}

// ==========================================
// UNIFIED GENAI ADAPTER FUNCTION
// ==========================================

async function generateAIResponse(prompt, systemInstruction = '', responseFormatJson = false) {
  if (aiProvider === 'ollama') {
    // 1. OLLAMA API CALLS (/api/generate)
    const combinedPrompt = systemInstruction 
      ? `${systemInstruction}\n\n=== USER INPUT DATA ===\n${prompt}`
      : prompt;

    console.log(`[OLLAMA] Calling generate API with model: ${ollamaModel}`);

    const requestBody = {
      model: ollamaModel,
      prompt: combinedPrompt,
      stream: false,
      options: {
        temperature: 0.2 // keep diagnostics factual and conservative
      }
    };

    // Force Ollama to output valid JSON if requested (Ollama native capability)
    if (responseFormatJson) {
      requestBody.format = "json";
    }

    const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama server returned error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.response.trim();

  } else {
    // 2. OPENAI API CALLS (chat/completions)
    if (isDemoMode) {
      throw new Error('OpenAI key is missing (Running in Demo/Mock Mode)');
    }

    console.log(`[OPENAI] Calling completions API with model: ${openAIModel}`);

    const messages = [];
    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    const response = await openai.chat.completions.create({
      model: aiProvider === 'groq'
  ? (process.env.GROQ_MODEL || 'llama-3.1-8b-instant')
  : openAIModel,
      messages: messages,
      temperature: responseFormatJson ? 0.1 : 0.2, // lower temperature for rigid structural outputs
      response_format: responseFormatJson ? { type: "json_object" } : undefined
    });

    return response.choices[0].message.content.trim();
  }
}

// ==========================================
// SAFETY SANITIZER LOGIC (Defense in Depth)
// ==========================================

function sanitizeAIOutput(text) {
  if (typeof text !== 'string') return { text, wasSanitized: false };

  const dangerousPatterns = [
    { regex: /rm\s+-r*f\b/g, name: "recursive force deletion (rm -rf)" },
    { regex: /\bmkfs\b/g, name: "filesystem formatting (mkfs)" },
    { regex: /\bdd\s+if=/g, name: "low-level block storage copy (dd)" },
    { regex: /\bshutdown\b/g, name: "system power down (shutdown)" },
    { regex: /\breboot\b/g, name: "system power down (reboot)" },
    { regex: /\buserdel\b/g, name: "user accounts deletion (userdel)" },
    { regex: /\bchmod\s+777\b/g, name: "excessive permissions chmod 777" }
  ];

  let sanitizedText = text;
  let isModified = false;

  for (const pattern of dangerousPatterns) {
    if (pattern.regex.test(sanitizedText)) {
      sanitizedText = sanitizedText.replace(
        pattern.regex,
        `# [BLOCKED FOR SAFETY: Dangerous action '${pattern.name}' detected and prevented by Security Gateway]`
      );
      isModified = true;
    }
  }

  return { text: sanitizedText, wasSanitized: isModified };
}

function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return sanitizeAIOutput(obj).text;
  } else if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = sanitizeObject(obj[key]);
    }
    return newObj;
  }
  return obj;
}

// ==========================================
// SYSTEM STATS HELPER
// ==========================================

async function getDiskUsage() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execPromise(
        'powershell -Command "Get-PSDrive C | Select-Object Size, Used, Free | ConvertTo-Json"'
      );
      const data = JSON.parse(stdout.trim());
      const sizeBytes = data.Size;
      const freeBytes = data.Free;
      const usedBytes = data.Used;
      if (sizeBytes) {
        return {
          total: (sizeBytes / 1024 / 1024 / 1024).toFixed(1) + ' GB',
          free: (freeBytes / 1024 / 1024 / 1024).toFixed(1) + ' GB',
          used: (usedBytes / 1024 / 1024 / 1024).toFixed(1) + ' GB',
          percentUsed: ((usedBytes / sizeBytes) * 100).toFixed(1) + '%'
        };
      }
    } else {
      const { stdout } = await execPromise("df -k / | tail -1 | awk '{print $2, $3, $4, $5}'");
      const parts = stdout.trim().split(/\s+/);
      if (parts.length === 4) {
        const sizeKB = parseInt(parts[0]);
        const usedKB = parseInt(parts[1]);
        const freeKB = parseInt(parts[2]);
        const percentUsed = parts[3];
        return {
          total: (sizeKB / 1024 / 1024).toFixed(1) + ' GB',
          free: (freeKB / 1024 / 1024).toFixed(1) + ' GB',
          used: (usedKB / 1024 / 1024).toFixed(1) + ' GB',
          percentUsed: percentUsed.endsWith('%') ? percentUsed : percentUsed + '%'
        };
      }
    }
  } catch (err) {
    console.warn('[STATUS] Could not retrieve disk metrics dynamically. Falling back.', err.message);
  }
  return {
    total: '256.0 GB',
    free: '112.5 GB',
    used: '143.5 GB',
    percentUsed: '56.1%'
  };
}

// ==========================================
// MOCK AI ENGINE (For demo out-of-the-box)
// ==========================================

function getMockAnalysis(logText = '') {
  const text = logText.toLowerCase();
  
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
// ENDPOINTS
// ==========================================

/**
 * @route   GET /api/status
 * @desc    Get dynamic server status parameters
 */
app.get('/api/status', async (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const dynamicDisk = await getDiskUsage();

  const statusResponse = {
    uptime: Math.floor(os.uptime()) + ' seconds',
    memoryUsage: {
      total: (totalMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      free: (freeMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      used: (usedMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      percentUsed: ((usedMem / totalMem) * 100).toFixed(1) + '%'
    },
    diskUsage: dynamicDisk,
    currentTimestamp: new Date().toISOString(),
    appStatus: "OK"
  };

  res.json(statusResponse);
});

/**
 * @route   POST /api/analyze-log
 * @desc    Analyze server logs using GenAI (OpenAI API, Ollama, or Local Mock)
 */
app.post('/api/analyze-log', async (req, res) => {
  const { logText } = req.body;

  if (!logText || logText.trim() === "") {
    return res.status(400).json({ error: "Log text cannot be empty." });
  }

  console.log(`[POST /api/analyze-log] Received ${logText.length} chars of log data.`);

  if (isDemoMode) {
    console.log('[DEMO] Generating mock log analysis...');
    await new Promise(resolve => setTimeout(resolve, 800));
    const rawMock = getMockAnalysis(logText);
    const sanitizedMock = sanitizeObject(rawMock);
    return res.json(sanitizedMock);
  }

  try {
    const improvedPrompt = `
You analyze system logs OR command outputs.

INPUT:
${logText}

Your job:
1. Detect if this is:
   - Normal output (OK)
   - Unknown command / invalid syntax
   - Real error / failure

2. Return ONLY JSON:

{
  "summary": "...",
  "severity": "Low" | "Medium" | "High",
  "rootCauses": ["..."],
  "recommendedSteps": ["..."],
  "securityWarnings": null,
  "limitations": {
    "confidenceLevel": "High",
    "missingInformation": null,
    "manualVerification": "..."
  }
}

Rules:
- If output contains "active (running)", "success", "HTTP 200", "OK":
  → severity = "Low"
  → summary = "No issue detected"

- If output contains:
  "command not found", "unknown command", "not recognized", "No such file"
  → severity = "Medium"
  → summary = "Invalid or unknown command"

- If output contains:
  "failed", "error", "denied", "timeout", "connection refused"
  → severity = "High"
  → summary = "An error was detected"
`;

const aiText = await generateAIResponse(improvedPrompt, "", true);

    // Clean up potential markdown formatting block wrapper from LLM
    let cleanJsonString = aiText;
    if (cleanJsonString.startsWith("```json")) {
      cleanJsonString = cleanJsonString.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleanJsonString.startsWith("```")) {

      cleanJsonString = cleanJsonString.replace(/^```/, "").replace(/```$/, "").trim();
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleanJsonString);
    } catch (jsonErr) {
      console.error('[PARSE ERROR] Failed to parse JSON returned by AI Model:', cleanJsonString);
      parsedResult = {
        summary: "Log diagnostic returned non-standard format. Summary extracted manually.",
        severity: "High",
        rootCauses: ["Failed to parse AI structure. Raw text: " + aiText.slice(0, 150)],
        recommendedSteps: ["Inspect log contents manually for explicit error keywords."],
        securityWarnings: null,
        limitations: {
          confidenceLevel: "Low",
          missingInformation: "AI response failed structured formatting constraints.",
          manualVerification: "Audit configuration parameters on active server units."
        }
      };
    }

    const sanitizedResult = sanitizeObject(parsedResult);
    res.json(sanitizedResult);

  } catch (error) {
    console.error('[API ERROR /api/analyze-log]', error);
    res.status(500).json({ 
      error: "GenAI log analysis failed.", 
      details: error.message 
    });
  }
});

app.post('/api/analyze-command-output', async (req, res) => {
  const { command, output } = req.body;

  if (!output || output.trim() === "") {
    return res.status(400).json({ error: "Command output cannot be empty." });
  }

  console.log(`[POST /api/analyze-command-output] Received ${output.length} chars`);

  if (isDemoMode) {
    return res.json({
      status: "OK",
      summary: "Demo mode: no issue detected",
      possibleCauses: [],
      recommendedSteps: []
    });
  }

  try {
    const userPrompt = `
COMMAND:
${command}

OUTPUT:
${output}

Analyze this command output.

Return ONLY valid JSON:
{
  "status": "OK" | "Warning" | "Critical",
  "summary": "...",
  "possibleCauses": ["..."],
  "recommendedSteps": ["..."]
}

Rules:
- If output shows success, active (running), HTTP 200/301/302, reachable, or no errors → status = "OK"
- If output shows failed, error, denied, timeout, connection refused → Warning or Critical
`;

    const aiText = await generateAIResponse(userPrompt, "", true);

    let cleanJson = aiText;
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/```[a-z]*\n?/gi, "").replace(/```$/, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      parsed = {
        status: "Warning",
        summary: "Could not parse AI response",
        possibleCauses: ["Unexpected output format"],
        recommendedSteps: ["Review manually"]
      };
    }

    res.json(parsed);

  } catch (error) {
    console.error("[API ERROR /api/analyze-command-output]", error);
    res.status(500).json({
      error: "Command analysis failed",
      details: error.message
    });
  }
});

/**
 * @route   POST /api/generate-commands
 * @desc    Generate safe debugging and check commands
 */
app.post('/api/generate-commands', async (req, res) => {
  const { logText, analysis } = req.body;

  if (!logText || logText.trim() === "") {
    return res.status(400).json({ error: "Log text cannot be empty." });
  }

  console.log(`[POST /api/generate-commands] Generating safe scripts...`);

  if (isDemoMode) {
    await new Promise(resolve => setTimeout(resolve, 800));
    const rawMock = getMockCommands(logText);
    const sanitizedMock = sanitizeAIOutput(rawMock).text;
    return res.json({ commandsMarkdown: sanitizedMock });
  }

  try {
    const analysisStr = typeof analysis === 'object' ? JSON.stringify(analysis) : analysis;
    const userPrompt = `=== ORIGINAL LOG ===\n${logText}\n\n=== PRIOR ANALYSIS ===\n${analysisStr}`;

    const rawResponse = await generateAIResponse(userPrompt, COMMAND_GENERATOR_PROMPT, false);
    const { text: sanitizedText, wasSanitized } = sanitizeAIOutput(rawResponse);

    if (wasSanitized) {
      console.warn('[SECURITY GATEWAY] Dangerous commands detected in LLM response and successfully blocked!');
    }

    res.json({ 
      commandsMarkdown: sanitizedText,
      sanitizationTriggered: wasSanitized
    });

  } catch (error) {
    console.error('[API ERROR /api/generate-commands]', error);
    res.status(500).json({ 
      error: "Command generation failed.", 
      details: error.message 
    });
  }
});

/**
 * @route   POST /api/generate-report
 * @desc    Generate a structured professional incident report
 */
app.post('/api/generate-report', async (req, res) => {
  const { logText, analysis } = req.body;

  if (!logText || logText.trim() === "") {
    return res.status(400).json({ error: "Log text cannot be empty." });
  }

  console.log(`[POST /api/generate-report] Compiling formal report...`);

  if (isDemoMode) {
    await new Promise(resolve => setTimeout(resolve, 800));
    const analysisObj = typeof analysis === 'object' ? analysis : null;
    const rawMock = getMockReport(logText, analysisObj);
    const sanitizedMock = sanitizeAIOutput(rawMock).text;
    return res.json({ reportMarkdown: sanitizedMock });
  }

  try {
    const analysisStr = typeof analysis === 'object' ? JSON.stringify(analysis) : analysis;
    const userPrompt = `=== ORIGINAL LOG ===\n${logText}\n\n=== LOG ANALYSIS ===\n${analysisStr}`;

    const rawResponse = await generateAIResponse(userPrompt, REPORT_GENERATOR_PROMPT, false);
    const { text: sanitizedText } = sanitizeAIOutput(rawResponse);

    res.json({ reportMarkdown: sanitizedText });

  } catch (error) {
    console.error('[API ERROR /api/generate-report]', error);
    res.status(500).json({ 
      error: "Report generation failed.", 
      details: error.message 
    });
  }
});

app.post('/api/run-safe-check', async (req, res) => {
  const { checkType } = req.body;

  const safeChecks = {
    nginx: 'systemctl status nginx --no-pager',
    backend: 'pm2 status',
    disk: 'df -h /',
    memory: 'free -h'
  };

  if (!safeChecks[checkType]) {
    return res.status(400).json({
      error: 'Invalid check type.'
    });
  }

  try {
    const { stdout, stderr } = await execPromise(safeChecks[checkType], {
      timeout: 5000
    });

    res.json({
      checkType,
      command: safeChecks[checkType],
      output: stdout || stderr || 'No output returned.'
    });
  } catch (error) {
    res.json({
      checkType,
      command: safeChecks[checkType],
      output: error.stdout || error.stderr || error.message
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`  AI Ops Assistant Server is active!`);
  console.log(`  Local Endpoint: http://localhost:${PORT}`);
  console.log(`  Provider:       ${aiProvider.toUpperCase()} (${isDemoMode ? 'DEMO/MOCK fallback active' : 'LIVE API active'})`);
  console.log(`  Active Model:   ${
    aiProvider === 'groq'
      ? (process.env.GROQ_MODEL || 'llama-3.1-8b-instant')
      : aiProvider === 'openai'
        ? openAIModel
        : ollamaModel
}`);
console.log(`================================================================`);
});
