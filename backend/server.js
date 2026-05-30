import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import fs from 'fs';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { WebSocketServer, WebSocket } from 'ws';

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
const server = http.createServer(app);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const USER_USERNAME = process.env.USER_USERNAME || 'user';
const USER_PASSWORD_HASH = process.env.USER_PASSWORD_HASH || '';
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'change_me_in_production';
const wsClients = new Set();
const DATA_DIR = './data';
const MAX_TEXT_INPUT = 20000;
const rateLimitBuckets = new Map();

const apiRuntimeMetrics = {
  totalRequests: 0,
  failedRequests: 0,
  totalLatencyMs: 0,
  successfulAIAnalyses: 0,
  failedAIAnalyses: 0
};

const operationalAlerts = [];
const acknowledgedAlertValues = new Map();

const ALERT_THRESHOLDS = {
  cpuWarning: 75,
  cpuCritical: 90,
  ramWarning: 75,
  ramCritical: 90,
  diskWarning: 80,
  diskCritical: 90,
  latencyWarning: 1000,
  latencyCritical: 3000,
  failedRequestsWarning: 0,
  aiFailuresWarning: 0
};

const TIMELINE_DIR = DATA_DIR;
const TIMELINE_FILE = './data/timeline.json';

function ensureSafeJsonPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const allowed = ['./data/', 'data/', './history.json', 'history.json'];

  if (!allowed.some((prefix) => normalized.startsWith(prefix) || normalized === prefix)) {
    throw new Error('Unsafe storage path rejected.');
  }
}

async function readJsonFile(filePath, fallbackValue) {
  ensureSafeJsonPath(filePath);

  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }

    if (error instanceof SyntaxError) {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      try {
        await fs.promises.rename(filePath, corruptPath);
        console.warn(`[STORAGE] Corrupted JSON moved to ${corruptPath}`);
      } catch (renameError) {
        console.warn('[STORAGE] Could not move corrupted JSON:', renameError.message);
      }
      return fallbackValue;
    }

    throw error;
  }
}

async function writeJsonFileAtomic(filePath, value) {
  ensureSafeJsonPath(filePath);
  await fs.promises.mkdir(filePath.includes('/data/') || filePath.startsWith('data/') ? DATA_DIR : '.', { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.promises.rename(tempPath, filePath);
}

function validateText(value, maxLength = MAX_TEXT_INPUT) {
  const text = String(value || '').trim();
  return text.slice(0, maxLength);
}

function createRateLimiter({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}:${req.user?.username || ''}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
    }

    next();
  };
}

const loginRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'login' });
const aiRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 20, keyPrefix: 'ai' });

async function readTimelineEvents() {
  const events = await readJsonFile(TIMELINE_FILE, []);
  return Array.isArray(events) ? events : [];
}

async function writeTimelineEvents(events) {
  await fs.promises.mkdir(TIMELINE_DIR, { recursive: true });
  await writeJsonFileAtomic(TIMELINE_FILE, events.slice(0, 500));
}

async function recordTimelineEvent({
  type = 'general',
  category = 'General',
  actor = 'system',
  role = 'system',
  severity = 'Info',
  description = '',
  metadata = {}
}) {
  try {
    const events = await readTimelineEvents();
    events.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type: String(type).slice(0, 80),
      category: String(category).slice(0, 40),
      actor: String(actor || 'system').slice(0, 80),
      role: String(role || 'system').slice(0, 40),
      severity: String(severity || 'Info').slice(0, 40),
      description: String(description || '').slice(0, 500),
      metadata: sanitizeObject(metadata || {})
    });
    await writeTimelineEvents(events);
    broadcastTimelineEvent(events[0]);
  } catch (error) {
    console.warn('[TIMELINE] Could not record event:', error.message);
  }
}

function queueTimelineEvent(event) {
  recordTimelineEvent(event).catch((error) => {
    console.warn('[TIMELINE] Could not queue event:', error.message);
  });
}

// Enable CORS, JSON parsing, and baseline security headers.
app.disable('x-powered-by');
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    apiRuntimeMetrics.totalRequests += 1;
    apiRuntimeMetrics.totalLatencyMs += elapsedMs;

    if (res.statusCode >= 400) {
      apiRuntimeMetrics.failedRequests += 1;
    }
  });

  next();
});

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

function normalizeAnalysisResult(result) {
  const normalized = result && typeof result === 'object' ? { ...result } : {};
  const evidence = Array.isArray(normalized.evidenceFound) ? normalized.evidenceFound : [];
  const safeCommands = Array.isArray(normalized.safeCommands) ? normalized.safeCommands : [];
  const nextAction = normalized.nextAction ? String(normalized.nextAction) : '';
  const escalationCriteria = normalized.escalationCriteria ? String(normalized.escalationCriteria) : '';

  normalized.rootCauses = Array.isArray(normalized.rootCauses) ? normalized.rootCauses : [];
  normalized.recommendedSteps = Array.isArray(normalized.recommendedSteps) ? normalized.recommendedSteps : [];

  evidence.slice(0, 4).forEach((item) => {
    normalized.rootCauses.push(`Evidence found: ${String(item).slice(0, 240)}`);
  });

  safeCommands.slice(0, 4).forEach((item) => {
    normalized.recommendedSteps.push(`Safe command to verify manually: ${String(item).slice(0, 240)}`);
  });

  if (nextAction) {
    normalized.recommendedSteps.push(`Next action: ${nextAction.slice(0, 240)}`);
  }

  if (escalationCriteria) {
    normalized.recommendedSteps.push(`Escalate when: ${escalationCriteria.slice(0, 240)}`);
  }

  return normalized;
}

function classifyDiagnosticInput(logText = '') {
  const text = String(logText);
  const lower = text.toLowerCase();
  const hasUnknownCommandEvidence =
    lower.includes('command not found') ||
    lower.includes('unknown command') ||
    lower.includes('not recognized as an internal or external command') ||
    lower.includes('unknown option') ||
    lower.includes('invalid command') ||
    lower.includes('invalid option');

  if (hasUnknownCommandEvidence) {
    return {
      inputType: 'unknown_command_error',
      expectedInterpretation: 'Treat as a malformed or unavailable command only if the provided output proves the command failed.'
    };
  }

  if (
    lower.includes('input type: quick_check') ||
    lower.includes('diagnostic source:') ||
    lower.includes('quick check status:')
  ) {
    return {
      inputType: 'quick_check',
      expectedInterpretation: 'This is a diagnostic output sample from a known tool. Analyze the observed status, evidence, and output; do not call it an unknown command.'
    };
  }

  if (lower.includes('simulated incident') || lower.includes('simulation scenario') || lower.includes('simulated server state')) {
    return {
      inputType: 'simulation',
      expectedInterpretation: 'This is simulated training evidence. Diagnose it as a scenario while making clear that no real server state is changed.'
    };
  }

  if (
    lower.includes('command observed:') ||
    lower.includes('output:') ||
    /\b(systemctl|journalctl|df -h|free -h|pm2|curl|nginx -t|node -v|npm -v)\b/i.test(text)
  ) {
    return {
      inputType: 'command_output',
      expectedInterpretation: 'This appears to be command output from a known administrative tool. Analyze the output content and status.'
    };
  }

  if (/\b(error|warn|failed|accepted|denied|timeout|exception|traceback|journal|syslog|nginx|apache|sshd)\b/i.test(text)) {
    return {
      inputType: 'logs',
      expectedInterpretation: 'This appears to be log text. Analyze events, severity, evidence, and likely operational cause.'
    };
  }

  return {
    inputType: 'mixed',
    expectedInterpretation: 'This input may contain mixed notes, logs, and command output. Classify conservatively from explicit evidence only.'
  };
}

function buildAnalysisPromptInput(logText) {
  const classification = classifyDiagnosticInput(logText);

  return [
    'Input classification metadata:',
    `inputType: ${classification.inputType}`,
    `expectedInterpretation: ${classification.expectedInterpretation}`,
    '',
    'Raw diagnostic input:',
    logText
  ].join('\n');
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

function parseUsagePercent(value) {
  const parsed = parseFloat(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(1)) : 0;
}

function getCpuTimes() {
  return os.cpus().reduce(
    (totals, cpu) => {
      totals.idle += cpu.times.idle;
      totals.total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
      return totals;
    },
    { idle: 0, total: 0 }
  );
}

async function getCpuLoadPercent() {
  const start = getCpuTimes();

  await new Promise((resolve) => setTimeout(resolve, 100));

  const end = getCpuTimes();
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;

  if (totalDelta <= 0) {
    return 0;
  }

  return Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1));
}

function getBackendProcessStatus() {
  const pm2Id = process.env.pm_id ?? process.env.PM2_ID;

  return {
    status: 'running',
    pm2Managed: pm2Id !== undefined,
    pm2Id: pm2Id !== undefined ? String(pm2Id) : null,
    processId: process.pid
  };
}

async function getServerMetricsSnapshot() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const dynamicDisk = await getDiskUsage();
  const processMemory = process.memoryUsage();
  const averageLatencyMs = apiRuntimeMetrics.totalRequests > 0
    ? apiRuntimeMetrics.totalLatencyMs / apiRuntimeMetrics.totalRequests
    : 0;

  const metrics = {
    cpuLoadPercent: await getCpuLoadPercent(),
    memoryUsagePercent: Number(((usedMem / totalMem) * 100).toFixed(1)),
    diskUsagePercent: parseUsagePercent(dynamicDisk.percentUsed),
    runtime: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      hostname: os.hostname(),
      backendStatus: getBackendProcessStatus()
    },
    processMemory: {
      rssBytes: processMemory.rss,
      heapUsedBytes: processMemory.heapUsed,
      heapTotalBytes: processMemory.heapTotal,
      externalBytes: processMemory.external,
      heapUsedPercent: processMemory.heapTotal
        ? Number(((processMemory.heapUsed / processMemory.heapTotal) * 100).toFixed(1))
        : 0
    },
    requests: {
      total: apiRuntimeMetrics.totalRequests,
      failed: apiRuntimeMetrics.failedRequests,
      averageLatencyMs: Number(averageLatencyMs.toFixed(1))
    },
    aiAnalyses: {
      successful: apiRuntimeMetrics.successfulAIAnalyses,
      failed: apiRuntimeMetrics.failedAIAnalyses
    },
    timestamp: new Date().toISOString()
  };

  evaluateOperationalAlerts(metrics);
  metrics.alerts = getAlertsSnapshot();
  return metrics;
}

function createAlertId(type) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getAlertsSnapshot() {
  return operationalAlerts
    .slice()
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'Active' ? -1 : 1;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

function getActiveAlertCount() {
  return operationalAlerts.filter((alert) => alert.status === 'Active').length;
}

function resolveActiveAlert(type, resolvedAt = new Date().toISOString()) {
  const alert = operationalAlerts.find((item) => item.type === type && item.status === 'Active');

  if (!alert) {
    return;
  }

  alert.status = 'Resolved';
  alert.resolvedAt = resolvedAt;
  queueTimelineEvent({
    type: 'alert_resolved',
    category: 'Alerts',
    actor: 'system',
    role: 'system',
    severity: 'Info',
    description: `Alert resolved: ${alert.title}.`,
    metadata: {
      alertType: alert.type,
      value: alert.value,
      threshold: alert.threshold
    }
  });
}

function upsertOperationalAlert(definition) {
  const now = new Date().toISOString();
  const acknowledgedValue = acknowledgedAlertValues.get(definition.type);

  if (acknowledgedValue !== undefined && Number(definition.value) <= Number(acknowledgedValue)) {
    return;
  }

  acknowledgedAlertValues.delete(definition.type);

  const existing = operationalAlerts.find((alert) => alert.type === definition.type && alert.status === 'Active');

  if (existing) {
    existing.severity = definition.severity;
    existing.title = definition.title;
    existing.message = definition.message;
    existing.value = definition.value;
    existing.threshold = definition.threshold;
    existing.updatedAt = now;
    return;
  }

  operationalAlerts.unshift({
    id: createAlertId(definition.type),
    type: definition.type,
    severity: definition.severity,
    title: definition.title,
    message: definition.message,
    source: definition.source,
    value: definition.value,
    threshold: definition.threshold,
    createdAt: now,
    status: 'Active'
  });
  queueTimelineEvent({
    type: 'alert_triggered',
    category: 'Alerts',
    actor: 'system',
    role: 'system',
    severity: definition.severity,
    description: `Alert triggered: ${definition.title}.`,
    metadata: {
      alertType: definition.type,
      source: definition.source,
      value: definition.value,
      threshold: definition.threshold
    }
  });

  if (operationalAlerts.length > 100) {
    operationalAlerts.length = 100;
  }
}

function evaluateThresholdAlert({ type, value, warning, critical, source, titleBase, unit = '' }) {
  const numericValue = Number(value || 0);

  if (numericValue >= critical) {
    upsertOperationalAlert({
      type,
      severity: 'Critical',
      title: `${titleBase} critical`,
      message: `${titleBase} is ${numericValue}${unit}, at or above the critical threshold ${critical}${unit}.`,
      source,
      value: numericValue,
      threshold: critical
    });
    return;
  }

  if (numericValue >= warning) {
    upsertOperationalAlert({
      type,
      severity: 'Warning',
      title: `${titleBase} warning`,
      message: `${titleBase} is ${numericValue}${unit}, at or above the warning threshold ${warning}${unit}.`,
      source,
      value: numericValue,
      threshold: warning
    });
    return;
  }

  acknowledgedAlertValues.delete(type);
  resolveActiveAlert(type);
}

function evaluateCountAlert({ type, value, threshold, source, title, message }) {
  const numericValue = Number(value || 0);

  if (numericValue > threshold) {
    upsertOperationalAlert({
      type,
      severity: 'Warning',
      title,
      message,
      source,
      value: numericValue,
      threshold
    });
    return;
  }

  acknowledgedAlertValues.delete(type);
  resolveActiveAlert(type);
}

function evaluateOperationalAlerts(metrics) {
  evaluateThresholdAlert({
    type: 'cpu',
    value: metrics.cpuLoadPercent,
    warning: ALERT_THRESHOLDS.cpuWarning,
    critical: ALERT_THRESHOLDS.cpuCritical,
    source: 'system.cpu',
    titleBase: 'CPU usage',
    unit: '%'
  });
  evaluateThresholdAlert({
    type: 'ram',
    value: metrics.memoryUsagePercent,
    warning: ALERT_THRESHOLDS.ramWarning,
    critical: ALERT_THRESHOLDS.ramCritical,
    source: 'system.memory',
    titleBase: 'RAM usage',
    unit: '%'
  });
  evaluateThresholdAlert({
    type: 'disk',
    value: metrics.diskUsagePercent,
    warning: ALERT_THRESHOLDS.diskWarning,
    critical: ALERT_THRESHOLDS.diskCritical,
    source: 'system.disk',
    titleBase: 'Disk usage',
    unit: '%'
  });
  evaluateThresholdAlert({
    type: 'api_latency',
    value: metrics.requests?.averageLatencyMs,
    warning: ALERT_THRESHOLDS.latencyWarning,
    critical: ALERT_THRESHOLDS.latencyCritical,
    source: 'api.latency',
    titleBase: 'API latency',
    unit: ' ms'
  });
  evaluateCountAlert({
    type: 'failed_requests',
    value: metrics.requests?.failed,
    threshold: ALERT_THRESHOLDS.failedRequestsWarning,
    source: 'api.requests',
    title: 'Failed requests detected',
    message: `${Number(metrics.requests?.failed || 0)} failed API request(s) have been recorded.`
  });
  evaluateCountAlert({
    type: 'ai_failures',
    value: metrics.aiAnalyses?.failed,
    threshold: ALERT_THRESHOLDS.aiFailuresWarning,
    source: 'ai.analysis',
    title: 'AI analysis failures detected',
    message: `${Number(metrics.aiAnalyses?.failed || 0)} failed AI analysis request(s) have been recorded.`
  });
}

function getMockMetricsAnalysis(metrics = {}) {
  const cpu = Number(metrics.cpuLoadPercent || 0);
  const ram = Number(metrics.memoryUsagePercent || 0);
  const disk = Number(metrics.diskUsagePercent || 0);
  const latency = Number(metrics.requests?.averageLatencyMs || 0);
  const failedRequests = Number(metrics.requests?.failed || 0);
  const criticalSignals = [cpu, ram, disk].filter(value => value >= 90).length;
  const warningSignals = [cpu, ram, disk].filter(value => value >= 75).length;
  const overallHealth = criticalSignals > 0 || latency > 2000
    ? 'Critical'
    : (warningSignals > 0 || failedRequests > 0 ? 'Warning' : 'Healthy');

  return {
    summary: overallHealth === 'Healthy'
      ? 'Live server metrics are within normal operating ranges.'
      : 'Live server metrics show conditions that should be reviewed by an administrator.',
    overallHealth,
    risks: overallHealth === 'Healthy'
      ? ['No immediate CPU, RAM, disk, latency, or request-health risk detected.']
      : ['One or more resource or request-health indicators is elevated.'],
    recommendations: [
      'Continue monitoring CPU, RAM, disk, latency, and failed request trends.',
      'Review recent application logs if failed requests or latency increase.'
    ],
    priorityActions: overallHealth === 'Healthy'
      ? ['No urgent action required.']
      : ['Inspect the highest resource consumer and recent backend errors first.'],
    confidenceLevel: 'High'
  };
}

// ==========================================
// MOCK AI ENGINE (For demo out-of-the-box)
// ==========================================

function getMockAnalysis(logText = '') {
  const text = logText.toLowerCase();

  if (
    text.includes('quick check status: normal') ||
    text.includes('active (running)') ||
    text.includes('status: online') ||
    text.includes('operating normally') ||
    text.includes('healthy operating range')
  ) {
    return {
      summary: "No issue detected in this quick check sample.",
      severity: "Low",
      rootCauses: [],
      recommendedSteps: ["Continue routine monitoring and review live metrics for trend changes."],
      securityWarnings: null,
      limitations: {
        confidenceLevel: "High",
        missingInformation: "This quick check is a point-in-time sample, not a full historical audit.",
        manualVerification: "Verify current service status on the server if symptoms appear."
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

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication token missing.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, AUTH_TOKEN_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(403).json({
      error: 'Invalid or expired token.'
    });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required.'
    });
  }

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        error: 'Insufficient role permissions.'
      });
    }

    next();
  };
}

// ==========================================
// ENDPOINTS
// ==========================================

/**
 * @route   GET /api/status
 * @desc    Get dynamic server status parameters
 */

app.post('/api/login', loginRateLimit, async (req, res) => {
  const username = validateText(req.body?.username, 80);
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({
      error: 'Username and password are required.'
    });
  }

  if (!ADMIN_PASSWORD_HASH && !USER_PASSWORD_HASH) {
    return res.status(500).json({
      error: 'Authentication is not configured on the server.'
    });
  }

  const users = [
    { username: ADMIN_USERNAME, passwordHash: ADMIN_PASSWORD_HASH, role: 'admin' },
    { username: USER_USERNAME, passwordHash: USER_PASSWORD_HASH, role: 'user' }
  ].filter((user) => Boolean(user.passwordHash));
  const matchedUser = users.find((user) => user.username === username);
  const passwordMatches = matchedUser
    ? await bcrypt.compare(password, matchedUser.passwordHash)
    : false;

  if (!matchedUser || !passwordMatches) {
    return res.status(401).json({
      error: 'Invalid username or password.'
    });
  }

  const token = jwt.sign(
    { username: matchedUser.username, role: matchedUser.role },
    AUTH_TOKEN_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      username: matchedUser.username,
      role: matchedUser.role
    }
  });
  queueTimelineEvent({
    type: 'login_success',
    category: 'Auth',
    actor: matchedUser.username,
    role: matchedUser.role,
    severity: 'Info',
    description: `${matchedUser.role} login succeeded.`
  });
});

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

app.get('/api/metrics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await getServerMetricsSnapshot());
  } catch (error) {
    console.error('[METRICS ERROR]', error);
    res.status(500).json({
      error: 'Could not retrieve server metrics.'
    });
  }
});

app.get('/api/alerts', authenticateToken, requireAdmin, async (req, res) => {
  res.json({
    alerts: getAlertsSnapshot(),
    activeCount: getActiveAlertCount()
  });
});

app.get('/api/timeline', authenticateToken, requireAdmin, async (req, res) => {
  const events = await readTimelineEvents();
  res.json(events);
});

app.post('/api/timeline', authenticateToken, requireRole('admin', 'user'), async (req, res) => {
  const { type, category, severity, description, metadata } = req.body || {};
  await recordTimelineEvent({
    type: type || 'ui_event',
    category: category || 'General',
    actor: req.user.username,
    role: req.user.role,
    severity: severity || 'Info',
    description: description || 'User interface event recorded.',
    metadata: metadata || {}
  });
  res.json({ saved: true });
});

app.patch('/api/alerts/:id/acknowledge', authenticateToken, requireAdmin, async (req, res) => {
  const alert = operationalAlerts.find((item) => item.id === req.params.id);

  if (!alert) {
    return res.status(404).json({
      error: 'Alert not found.'
    });
  }

  alert.status = 'Resolved';
  alert.acknowledgedAt = new Date().toISOString();
  alert.acknowledgedBy = req.user.username;
  alert.resolvedAt = alert.acknowledgedAt;
  acknowledgedAlertValues.set(alert.type, Number(alert.value || 0));
  broadcastToAdmins({
    type: 'alerts',
    alerts: getAlertsSnapshot(),
    activeCount: getActiveAlertCount()
  });
  queueTimelineEvent({
    type: 'alert_acknowledged',
    category: 'Alerts',
    actor: req.user.username,
    role: req.user.role,
    severity: alert.severity,
    description: `Alert acknowledged: ${alert.title}.`,
    metadata: {
      alertType: alert.type,
      value: alert.value,
      threshold: alert.threshold
    }
  });

  res.json({ saved: true, alert });
});

app.post('/api/analyze-alerts', authenticateToken, requireAdmin, aiRateLimit, async (req, res) => {
  try {
    const alerts = Array.isArray(req.body?.alerts)
      ? req.body.alerts
      : getAlertsSnapshot().filter((alert) => alert.status === 'Active');
    const metrics = req.body?.metrics || await getServerMetricsSnapshot();

    if (isDemoMode) {
      const activeAlerts = alerts.filter((alert) => alert.status === 'Active');
      queueTimelineEvent({
        type: 'ai_alerts_analysis',
        category: 'AI',
        actor: req.user.username,
        role: req.user.role,
        severity: activeAlerts.some((alert) => alert.severity === 'Critical') ? 'Critical' : 'Info',
        description: `AI alert explanation requested for ${activeAlerts.length} active alert(s).`
      });
      return res.json({
        summary: activeAlerts.length
          ? `${activeAlerts.length} active operational alert(s) need administrator review.`
          : 'No active operational alerts are currently present.',
        likelyCauses: activeAlerts.length
          ? activeAlerts.map((alert) => `${alert.title}: current value ${alert.value}, threshold ${alert.threshold}.`)
          : ['Current metrics are below configured alert thresholds.'],
        recommendedFirstChecks: [
          'Confirm current CPU, RAM, disk, latency, and failure counters on the dashboard.',
          'Review backend logs for errors around the alert timestamp.',
          'Check recent deploys or traffic spikes before taking action.'
        ],
        priorityActions: activeAlerts
          .filter((alert) => alert.severity === 'Critical')
          .map((alert) => `Address critical alert: ${alert.title}.`)
          .concat(activeAlerts.some((alert) => alert.severity === 'Critical') ? [] : ['Continue monitoring and acknowledge reviewed alerts.'])
      });
    }

    const prompt = `
Explain these defensive operations alerts for an admin dashboard.

Active alerts JSON:
${JSON.stringify(alerts, null, 2)}

Current metrics JSON:
${JSON.stringify(metrics, null, 2)}

Return ONLY valid JSON with this shape:
{
  "summary": "...",
  "likelyCauses": ["..."],
  "recommendedFirstChecks": ["..."],
  "priorityActions": ["..."]
}

Rules:
- Be concise and operational.
- Do not suggest destructive commands.
- Focus on first checks a junior administrator can safely verify.
`;

    const aiText = await generateAIResponse(prompt, '', true);
    let cleanJson = aiText.trim();

    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    queueTimelineEvent({
      type: 'ai_alerts_analysis',
      category: 'AI',
      actor: req.user.username,
      role: req.user.role,
      severity: 'Info',
      description: `AI alert explanation requested for ${alerts.filter((alert) => alert.status === 'Active').length} active alert(s).`
    });
    res.json(sanitizeObject(JSON.parse(cleanJson)));
  } catch (error) {
    console.error('[API ERROR /api/analyze-alerts]', error);
    res.status(500).json({
      error: 'Alert analysis failed.'
    });
  }
});

app.post('/api/analyze-metrics', authenticateToken, requireAdmin, aiRateLimit, async (req, res) => {
  try {
    const metrics = req.body?.metrics || await getServerMetricsSnapshot();

    if (isDemoMode) {
      queueTimelineEvent({
        type: 'ai_metrics_analysis',
        category: 'AI',
        actor: req.user.username,
        role: req.user.role,
        severity: 'Info',
        description: 'AI metrics analysis requested.'
      });
      return res.json(getMockMetricsAnalysis(metrics));
    }

    const prompt = `
Analyze these live server metrics for an operations dashboard.

Metrics JSON:
${JSON.stringify(metrics, null, 2)}

Return ONLY valid JSON with this shape:
{
  "summary": "...",
  "overallHealth": "Healthy" | "Warning" | "Critical",
  "risks": ["..."],
  "recommendations": ["..."],
  "priorityActions": ["..."],
  "confidenceLevel": "Low" | "Medium" | "High"
}

Rules:
- Treat CPU, RAM, or disk under 75% as healthy unless request failures or latency suggest otherwise.
- Treat 75-89% as Warning.
- Treat 90% or higher, severe latency, or repeated request failures as Critical.
- Be concise and practical for a junior system administrator.
`;

    const aiText = await generateAIResponse(prompt, '', true);
    let cleanJson = aiText.trim();

    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('[PARSE ERROR] Failed to parse AI metrics analysis:', cleanJson);
      parsed = getMockMetricsAnalysis(metrics);
      parsed.confidenceLevel = 'Medium';
    }

    queueTimelineEvent({
      type: 'ai_metrics_analysis',
      category: 'AI',
      actor: req.user.username,
      role: req.user.role,
      severity: parsed.overallHealth || 'Info',
      description: 'AI metrics analysis requested.'
    });
    res.json(sanitizeObject(parsed));
  } catch (error) {
    console.error('[API ERROR /api/analyze-metrics]', error);
    res.status(500).json({
      error: 'Metrics analysis failed.'
    });
  }
});

app.post('/api/remediation-plan', authenticateToken, requireRole('admin', 'user'), aiRateLimit, async (req, res) => {
  try {
    const analysis = req.body?.analysis || {};
    const metrics = req.body?.metrics || null;
    const alerts = Array.isArray(req.body?.alerts) ? req.body.alerts : [];

    const fallbackPlan = {
      immediateActions: [
        'Confirm the affected service and scope using read-only status checks.',
        'Preserve relevant logs and timestamps before making changes.',
        'Apply the lowest-risk corrective action first.'
      ],
      verificationCommands: [
        'systemctl status <service> --no-pager',
        'journalctl -u <service> -n 80 --no-pager',
        'df -h',
        'free -h'
      ],
      rollbackPlan: [
        'Document any configuration change before applying it.',
        'Restore the previous known-good configuration if checks worsen.',
        'Restart only the affected service after review.'
      ],
      riskNotes: [
        'Review commands before running them.',
        'Avoid destructive commands and broad restarts without approval.'
      ],
      escalationCriteria: [
        'Escalate if customer-facing errors continue after first checks.',
        'Escalate if security indicators or data exposure are suspected.'
      ]
    };

    if (isDemoMode) {
      queueTimelineEvent({
        type: 'remediation_plan_generated',
        category: 'AI',
        actor: req.user.username,
        role: req.user.role,
        severity: analysis.severity || 'Info',
        description: `AI remediation plan generated for analysis: ${String(analysis.summary || 'No summary').slice(0, 140)}`
      });
      return res.json(fallbackPlan);
    }

    const prompt = `
Create a defensive remediation plan for this AI Ops analysis.

Analysis JSON:
${JSON.stringify(analysis, null, 2)}

Current metrics JSON:
${JSON.stringify(metrics, null, 2)}

Current active alerts JSON:
${JSON.stringify(alerts, null, 2)}

Return ONLY valid JSON with this shape:
{
  "immediateActions": ["..."],
  "verificationCommands": ["..."],
  "rollbackPlan": ["..."],
  "riskNotes": ["..."],
  "escalationCriteria": ["..."]
}

Rules:
- Defensive operations only.
- Commands must be read-only or clearly safe service checks.
- Do not include destructive commands.
- Include "Review before running commands" in risk notes.
- Be concise and practical.
`;

    const aiText = await generateAIResponse(prompt, '', true);
    let cleanJson = aiText.trim();

    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      parsed = fallbackPlan;
    }

    queueTimelineEvent({
      type: 'remediation_plan_generated',
      category: 'AI',
      actor: req.user.username,
      role: req.user.role,
      severity: analysis.severity || 'Info',
      description: `AI remediation plan generated for analysis: ${String(analysis.summary || 'No summary').slice(0, 140)}`
    });
    res.json(sanitizeObject(parsed));
  } catch (error) {
    console.error('[API ERROR /api/remediation-plan]', error);
    res.status(500).json({
      error: 'Remediation plan failed.'
    });
  }
});

/**
 * @route   POST /api/analyze-log
 * @desc    Analyze server logs using GenAI (OpenAI API, Ollama, or Local Mock)
 */
app.post('/api/analyze-log', authenticateToken, aiRateLimit, async (req, res) => {
  const logText = validateText(req.body?.logText, MAX_TEXT_INPUT);

  if (!logText) {
    apiRuntimeMetrics.failedAIAnalyses += 1;
    return res.status(400).json({ error: "Log text cannot be empty." });
  }

  console.log(`[POST /api/analyze-log] Received ${logText.length} chars of log data.`);

  if (isDemoMode) {
    console.log('[DEMO] Generating mock log analysis...');
    await new Promise(resolve => setTimeout(resolve, 800));
    const rawMock = getMockAnalysis(logText);
    const sanitizedMock = normalizeAnalysisResult(sanitizeObject(rawMock));
    apiRuntimeMetrics.successfulAIAnalyses += 1;
    queueTimelineEvent({
      type: 'ai_analysis_run',
      category: 'AI',
      actor: req.user.username,
      role: req.user.role,
      severity: sanitizedMock.severity || 'Info',
      description: `AI log analysis completed: ${String(sanitizedMock.summary || 'No summary').slice(0, 160)}`
    });
    return res.json(sanitizedMock);
  }

  try {
    const aiText = await generateAIResponse(buildAnalysisPromptInput(logText), LOG_ANALYZER_PROMPT, true);

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

    const sanitizedResult = normalizeAnalysisResult(sanitizeObject(parsedResult));
    apiRuntimeMetrics.successfulAIAnalyses += 1;
    queueTimelineEvent({
      type: 'ai_analysis_run',
      category: 'AI',
      actor: req.user.username,
      role: req.user.role,
      severity: sanitizedResult.severity || 'Info',
      description: `AI log analysis completed: ${String(sanitizedResult.summary || 'No summary').slice(0, 160)}`
    });
    res.json(sanitizedResult);

  } catch (error) {
    console.error('[API ERROR /api/analyze-log]', error);
    apiRuntimeMetrics.failedAIAnalyses += 1;
    res.status(500).json({ 
      error: "GenAI log analysis failed."
    });
  }
});

app.post('/api/analyze-command-output', aiRateLimit, async (req, res) => {
  const command = validateText(req.body?.command, 1000);
  const output = validateText(req.body?.output, MAX_TEXT_INPUT);

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
      error: "Command analysis failed"
    });
  }
});

/**
 * @route   POST /api/generate-commands
 * @desc    Generate safe debugging and check commands
 */
app.post('/api/generate-commands', authenticateToken, requireAdmin, aiRateLimit, async (req, res) => {
  const logText = validateText(req.body?.logText, MAX_TEXT_INPUT);
  const analysis = req.body?.analysis;

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
      error: "Command generation failed."
    });
  }
});

/**
 * @route   POST /api/generate-report
 * @desc    Generate a structured professional incident report
 */
app.post('/api/generate-report', authenticateToken, requireAdmin, aiRateLimit, async (req, res) => {
  const logText = validateText(req.body?.logText, MAX_TEXT_INPUT);
  const analysis = req.body?.analysis;

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
      error: "Report generation failed."
    });
  }
});

app.post('/api/run-safe-check', authenticateToken, requireAdmin, async (req, res) => {
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




// ==========================================
// HISTORY STORAGE (NEW FEATURE)
// ==========================================

const HISTORY_FILE = './history.json';

app.post('/api/history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const entry = req.body;
    let history = await readJsonFile(HISTORY_FILE, []);
    history = Array.isArray(history) ? history : [];

    history.unshift({
      time: new Date().toISOString(),
      input: validateText(entry.input, 300),
      severity: validateText(entry.severity, 40) || 'Unknown',
      summary: validateText(entry.summary, 300) || 'No summary'
    });

    history = history.slice(0, 50);

    await writeJsonFileAtomic(HISTORY_FILE, history);

    return res.json({ saved: true, count: history.length });
  } catch (error) {
    console.error('[HISTORY ERROR]', error);
    return res.status(500).json({
      error: 'Could not save history'
    });
  }
});

app.get('/api/history', authenticateToken, requireAdmin, async (req, res) => {
  const history = await readJsonFile(HISTORY_FILE, []);
  return res.json(Array.isArray(history) ? history : []);
});

const TICKETS_DIR = './data';
const TICKETS_FILE = './data/tickets.json';
const TICKET_STATUSES = ['New', 'In progress', 'Resolved'];

async function readTickets() {
  const tickets = await readJsonFile(TICKETS_FILE, []);
  return Array.isArray(tickets) ? tickets : [];
}

async function writeTickets(tickets) {
  await fs.promises.mkdir(TICKETS_DIR, { recursive: true });
  await writeJsonFileAtomic(TICKETS_FILE, tickets);
}

function canViewTicket(ticket, user) {
  return user.role === 'admin' ||
    ticket.from === user.username ||
    ticket.targetUser === user.username;
}

function getUnreadTicketCountFor(username) {
  return readTickets().then((tickets) => tickets.filter((ticket) => (
    (ticket.from === username || ticket.targetUser === username || username === ADMIN_USERNAME) &&
    !(Array.isArray(ticket.readBy) && ticket.readBy.includes(username))
  )).length);
}

function markTicketUnreadFor(ticket, username) {
  ticket.readBy = Array.isArray(ticket.readBy) ? ticket.readBy : [];
  ticket.readBy = ticket.readBy.filter((reader) => reader !== username);
}

function markTicketReadFor(ticket, username) {
  ticket.readBy = Array.isArray(ticket.readBy) ? ticket.readBy : [];

  if (!ticket.readBy.includes(username)) {
    ticket.readBy.push(username);
  }
}

function getTicketCounterparty(ticket, actorUsername) {
  if (ticket.from && ticket.from !== actorUsername) {
    return ticket.from;
  }

  return ticket.targetUser || (actorUsername === ADMIN_USERNAME ? USER_USERNAME : ADMIN_USERNAME);
}

app.post('/api/tickets', authenticateToken, requireRole('admin', 'user'), async (req, res) => {
  const allowedTypes = ['ticket', 'suggestion', 'feedback'];
  const requestedType = validateText(req.body?.type || 'feedback', 40);
  const cleanType = allowedTypes.includes(requestedType) ? requestedType : 'feedback';
  const cleanMessage = validateText(req.body?.message, 2000);

  if (!cleanMessage) {
    return res.status(400).json({
      error: 'Ticket message is required.'
    });
  }

  try {
    const tickets = await readTickets();
    const ticket = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toISOString(),
      type: cleanType,
      message: cleanMessage.slice(0, 2000),
      from: req.user.username,
      role: req.user.role,
      targetUser: req.user.role === 'admin' ? USER_USERNAME : ADMIN_USERNAME,
      status: 'New',
      readBy: [req.user.username],
      replies: []
    };

    tickets.unshift(ticket);
    await writeTickets(tickets.slice(0, 200));
    broadcastInboxUnreadCounts();
    queueTimelineEvent({
      type: 'ticket_created',
      category: 'Tickets',
      actor: req.user.username,
      role: req.user.role,
      severity: 'Info',
      description: `${req.user.role} created ${ticket.type}: ${ticket.message.slice(0, 140)}`
    });

    res.json({ saved: true, ticket });
  } catch (error) {
    console.error('[TICKET ERROR]', error);
    res.status(500).json({
      error: 'Could not save ticket.'
    });
  }
});

app.get('/api/tickets/my', authenticateToken, requireRole('admin', 'user'), async (req, res) => {
  const tickets = await readTickets();
  res.json(tickets.filter((ticket) => canViewTicket(ticket, req.user)));
});

app.get('/api/tickets/admin', authenticateToken, requireAdmin, async (req, res) => {
  res.json(await readTickets());
});

app.delete('/api/tickets/:id', authenticateToken, requireRole('admin', 'user'), async (req, res) => {
  const tickets = await readTickets();
  const ticketIndex = tickets.findIndex((item) => item.id === req.params.id);

  if (ticketIndex === -1) {
    return res.status(404).json({
      error: 'Ticket not found.'
    });
  }

  const ticket = tickets[ticketIndex];
  const ownsTicket = ticket.from === req.user.username;

  if (req.user.role !== 'admin' && !ownsTicket) {
    return res.status(403).json({
      error: 'You can only delete your own tickets.'
    });
  }

  tickets.splice(ticketIndex, 1);
  await writeTickets(tickets);
  broadcastInboxUnreadCounts();
  res.json({ deleted: true });
});

app.patch('/api/tickets/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const { status } = req.body || {};

  if (!TICKET_STATUSES.includes(status)) {
    return res.status(400).json({
      error: 'Invalid ticket status.'
    });
  }

  const tickets = await readTickets();
  const ticket = tickets.find((item) => item.id === req.params.id);

  if (!ticket) {
    return res.status(404).json({
      error: 'Ticket not found.'
    });
  }

  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  markTicketReadFor(ticket, req.user.username);
  markTicketUnreadFor(ticket, getTicketCounterparty(ticket, req.user.username));
  await writeTickets(tickets);
  broadcastInboxUnreadCounts();
  queueTimelineEvent({
    type: 'ticket_status_changed',
    category: 'Tickets',
    actor: req.user.username,
    role: req.user.role,
    severity: status === 'Resolved' ? 'Info' : 'Warning',
    description: `Ticket status changed to ${status}.`
  });
  res.json({ saved: true, ticket });
});

app.patch('/api/tickets/:id/read', authenticateToken, requireRole('admin', 'user'), async (req, res) => {
  const tickets = await readTickets();
  const ticket = tickets.find((item) => item.id === req.params.id);

  if (!ticket) {
    return res.status(404).json({
      error: 'Ticket not found.'
    });
  }

  if (!canViewTicket(ticket, req.user)) {
    return res.status(403).json({
      error: 'You can only mark visible tickets as read.'
    });
  }

  markTicketReadFor(ticket, req.user.username);
  ticket.updatedAt = new Date().toISOString();
  await writeTickets(tickets);
  broadcastInboxUnreadCounts();
  res.json({ saved: true, ticket });
});

app.post('/api/tickets/:id/reply', authenticateToken, requireRole('admin', 'user'), async (req, res) => {
  const message = validateText(req.body?.message, 1200);

  if (!message) {
    return res.status(400).json({
      error: 'Reply message is required.'
    });
  }

  const tickets = await readTickets();
  const ticket = tickets.find((item) => item.id === req.params.id);

  if (!ticket) {
    return res.status(404).json({
      error: 'Ticket not found.'
    });
  }

  if (!canViewTicket(ticket, req.user)) {
    return res.status(403).json({
      error: 'You can only reply to visible tickets.'
    });
  }

  ticket.replies = Array.isArray(ticket.replies) ? ticket.replies : [];
  ticket.replies.push({
    time: new Date().toISOString(),
    from: req.user.username,
    message: message.slice(0, 1200)
  });
  ticket.updatedAt = new Date().toISOString();
  markTicketReadFor(ticket, req.user.username);
  markTicketUnreadFor(ticket, getTicketCounterparty(ticket, req.user.username));

  await writeTickets(tickets);
  broadcastInboxUnreadCounts();
  queueTimelineEvent({
    type: 'ticket_replied',
    category: 'Tickets',
    actor: req.user.username,
    role: req.user.role,
    severity: 'Info',
    description: `Ticket reply added: ${message.slice(0, 140)}`
  });
  res.json({ saved: true, ticket });
});

function verifyWebSocketToken(token) {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, AUTH_TOKEN_SECRET);
    return {
      username: decoded.username,
      role: decoded.role === 'admin' ? 'admin' : 'user'
    };
  } catch {
    return null;
  }
}

function sendWsMessage(client, payload) {
  if (client.readyState === WebSocket.OPEN && client.user) {
    client.send(JSON.stringify(payload));
  }
}

function broadcastToAdmins(payload) {
  wsClients.forEach((client) => {
    if (client.user?.role === 'admin') {
      sendWsMessage(client, payload);
    }
  });
}

function broadcastTimelineEvent(event) {
  broadcastToAdmins({
    type: 'timeline_event',
    event
  });
}

async function sendInboxUnreadCount(client) {
  if (!client.user) {
    return;
  }

  const count = await getUnreadTicketCountFor(client.user.username);
  sendWsMessage(client, {
    type: 'inbox_unread',
    count
  });
}

async function broadcastInboxUnreadCounts() {
  await Promise.all([...wsClients]
    .filter((client) => client.user)
    .map((client) => sendInboxUnreadCount(client)));
}

function hasAdminWsClients() {
  return [...wsClients].some((client) => client.user?.role === 'admin');
}

const wss = new WebSocketServer({
  server,
  path: '/ws'
});

wss.on('connection', (socket, request) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  socket.user = verifyWebSocketToken(url.searchParams.get('token'));
  socket.isAlive = true;
  wsClients.add(socket);

  if (socket.user) {
    sendWsMessage(socket, {
      type: 'live_status',
      status: 'connected',
      role: socket.user.role
    });
    sendInboxUnreadCount(socket);
  } else {
    socket.send(JSON.stringify({
      type: 'auth_required'
    }));
    setTimeout(() => {
      if (!socket.user && socket.readyState === WebSocket.OPEN) {
        socket.close(1008, 'Unauthorized');
      }
    }, 5000);
  }

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (message) => {
    try {
      const data = JSON.parse(String(message));

      if (data.type === 'auth' && !socket.user) {
        socket.user = verifyWebSocketToken(data.token);

        if (!socket.user) {
          socket.close(1008, 'Unauthorized');
          return;
        }

        sendWsMessage(socket, {
          type: 'live_status',
          status: 'connected',
          role: socket.user.role
        });
        sendInboxUnreadCount(socket);
      }
    } catch {
      // Ignore malformed live messages.
    }
  });

  socket.on('close', () => {
    wsClients.delete(socket);
  });
});

setInterval(async () => {
  try {
    if (hasAdminWsClients()) {
      const metrics = await getServerMetricsSnapshot();
      broadcastToAdmins({
        type: 'metrics',
        metrics
      });
      broadcastToAdmins({
        type: 'alerts',
        alerts: metrics.alerts || [],
        activeCount: getActiveAlertCount()
      });
    }

    await broadcastInboxUnreadCounts();
  } catch (error) {
    console.warn('[WS] Live update failed:', error.message);
  }
}, 3000);

setInterval(() => {
  wsClients.forEach((client) => {
    if (client.isAlive === false) {
      wsClients.delete(client);
      client.terminate();
      return;
    }

    client.isAlive = false;
    client.ping();
  });
}, 30000);


// Start Server
server.listen(PORT, () => {
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
  console.log(`  Auth Admin:     username="${ADMIN_USERNAME}", hash present=${Boolean(ADMIN_PASSWORD_HASH)}`);
  console.log(`  Auth User:      username="${USER_USERNAME}", hash present=${Boolean(USER_PASSWORD_HASH)}`);
console.log(`================================================================`);
});
