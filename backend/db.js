import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'ai_ops.db');
const TICKETS_JSON = path.join(DATA_DIR, 'tickets.json');
const TIMELINE_JSON = path.join(DATA_DIR, 'timeline.json');
const HISTORY_JSON = path.join(__dirname, 'history.json');
const AUDIT_LOGS_JSON = path.join(DATA_DIR, 'audit_logs.json');

let db;

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readJsonFileIfPresent(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[DB] Could not read legacy JSON ${path.basename(filePath)}: ${error.message}`);
    }
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function ensureDb() {
  if (!db) {
    throw new Error('Database has not been initialized.');
  }

  return db;
}

function createSchema() {
  const database = ensureDb();

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      time TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      from_username TEXT NOT NULL,
      role TEXT NOT NULL,
      target_user TEXT NOT NULL,
      status TEXT NOT NULL,
      read_by TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ticket_replies (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      time TEXT NOT NULL,
      from_username TEXT NOT NULL,
      message TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      actor TEXT NOT NULL,
      role TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      input TEXT NOT NULL,
      severity TEXT NOT NULL,
      summary TEXT NOT NULL,
      UNIQUE(time, input, summary)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT NOT NULL,
      value REAL,
      threshold REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      status TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS acknowledged_alerts (
      type TEXT PRIMARY KEY,
      value REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'general',
      resource_id TEXT,
      result TEXT NOT NULL DEFAULT 'success',
      description TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket_id ON ticket_replies(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_target_user ON tickets(target_user);
    CREATE INDEX IF NOT EXISTS idx_tickets_from_username ON tickets(from_username);
    CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_type_status ON alerts(type, status);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
  `);

  ensureColumn('audit_logs', 'resource_type', "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn('audit_logs', 'resource_id', 'TEXT');
  ensureColumn('audit_logs', 'result', "TEXT NOT NULL DEFAULT 'success'");
}

function ensureColumn(tableName, columnName, definition) {
  const database = ensureDb();
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();

  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function normalizeTicket(ticket) {
  return {
    id: String(ticket.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    time: String(ticket.time || ticket.createdAt || new Date().toISOString()),
    type: String(ticket.type || 'feedback'),
    message: String(ticket.message || ''),
    from: String(ticket.from || ticket.fromUsername || 'unknown'),
    role: String(ticket.role || 'user'),
    targetUser: String(ticket.targetUser || ''),
    status: String(ticket.status || 'New'),
    readBy: Array.isArray(ticket.readBy) ? ticket.readBy.map(String) : [],
    updatedAt: ticket.updatedAt ? String(ticket.updatedAt) : null,
    replies: Array.isArray(ticket.replies) ? ticket.replies : []
  };
}

function insertTicket(ticket) {
  const database = ensureDb();
  const clean = normalizeTicket(ticket);

  database.prepare(`
    INSERT OR IGNORE INTO tickets (
      id, time, type, message, from_username, role, target_user, status, read_by, updated_at
    ) VALUES (
      @id, @time, @type, @message, @from, @role, @targetUser, @status, @readBy, @updatedAt
    )
  `).run({
    ...clean,
    readBy: stringifyJson(clean.readBy)
  });

  const insertReply = database.prepare(`
    INSERT OR IGNORE INTO ticket_replies (id, ticket_id, time, from_username, message)
    VALUES (@id, @ticketId, @time, @from, @message)
  `);

  clean.replies.forEach((reply, index) => {
    insertReply.run({
      id: String(reply.id || `${clean.id}-reply-${index}`),
      ticketId: clean.id,
      time: String(reply.time || new Date().toISOString()),
      from: String(reply.from || 'unknown'),
      message: String(reply.message || '')
    });
  });
}

function migrateLegacyTickets() {
  const tickets = readJsonFileIfPresent(TICKETS_JSON, []);

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return;
  }

  const migrate = ensureDb().transaction((items) => {
    items.forEach(insertTicket);
  });

  migrate(tickets);
}

function migrateLegacyTimeline() {
  const events = readJsonFileIfPresent(TIMELINE_JSON, []);

  if (!Array.isArray(events) || events.length === 0) {
    return;
  }

  const insert = ensureDb().prepare(`
    INSERT OR IGNORE INTO timeline_events (
      id, timestamp, type, category, actor, role, severity, description, metadata
    ) VALUES (
      @id, @timestamp, @type, @category, @actor, @role, @severity, @description, @metadata
    )
  `);
  const migrate = ensureDb().transaction((items) => {
    items.forEach((event) => {
      insert.run({
        id: String(event.id || `${event.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        timestamp: String(event.timestamp || event.time || new Date().toISOString()),
        type: String(event.type || 'general'),
        category: String(event.category || 'General'),
        actor: String(event.actor || 'system'),
        role: String(event.role || 'system'),
        severity: String(event.severity || 'Info'),
        description: String(event.description || ''),
        metadata: stringifyJson(event.metadata || {})
      });
    });
  });

  migrate(events);
}

function migrateLegacyHistory() {
  const history = readJsonFileIfPresent(HISTORY_JSON, []);

  if (!Array.isArray(history) || history.length === 0) {
    return;
  }

  const insert = ensureDb().prepare(`
    INSERT OR IGNORE INTO analysis_history (time, input, severity, summary)
    VALUES (@time, @input, @severity, @summary)
  `);
  const migrate = ensureDb().transaction((items) => {
    items.forEach((entry) => {
      insert.run({
        time: String(entry.time || new Date().toISOString()),
        input: String(entry.input || ''),
        severity: String(entry.severity || 'Unknown'),
        summary: String(entry.summary || 'No summary')
      });
    });
  });

  migrate(history);
}

function migrateLegacyJson() {
  migrateLegacyTickets();
  migrateLegacyTimeline();
  migrateLegacyHistory();
}

export function initializeStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  createSchema();
  migrateLegacyJson();
  console.log(`[DB] SQLite persistence ready: ${DB_PATH}`);
}

export function listTimelineEvents(limit = 500) {
  return ensureDb().prepare(`
    SELECT id, timestamp, type, category, actor, role, severity, description, metadata
    FROM timeline_events
    ORDER BY datetime(timestamp) DESC
    LIMIT ?
  `).all(limit).map((event) => ({
    ...event,
    metadata: safeJsonParse(event.metadata, {})
  }));
}

export function addTimelineEvent(event) {
  ensureDb().prepare(`
    INSERT OR REPLACE INTO timeline_events (
      id, timestamp, type, category, actor, role, severity, description, metadata
    ) VALUES (
      @id, @timestamp, @type, @category, @actor, @role, @severity, @description, @metadata
    )
  `).run({
    ...event,
    metadata: stringifyJson(event.metadata || {})
  });
}

export function addHistoryEntry(entry) {
  ensureDb().prepare(`
    INSERT INTO analysis_history (time, input, severity, summary)
    VALUES (@time, @input, @severity, @summary)
  `).run(entry);
}

export function listHistoryEntries(limit = 50) {
  return ensureDb().prepare(`
    SELECT time, input, severity, summary
    FROM analysis_history
    ORDER BY datetime(time) DESC, id DESC
    LIMIT ?
  `).all(limit);
}

export function listTickets(limit = 200) {
  const database = ensureDb();
  const tickets = database.prepare(`
    SELECT id, time, type, message, from_username, role, target_user, status, read_by, updated_at
    FROM tickets
    ORDER BY datetime(COALESCE(updated_at, time)) DESC
    LIMIT ?
  `).all(limit);
  const repliesByTicket = database.prepare(`
    SELECT id, time, from_username, message
    FROM ticket_replies
    WHERE ticket_id = ?
    ORDER BY datetime(time) ASC
  `);

  return tickets.map((ticket) => ({
    id: ticket.id,
    time: ticket.time,
    type: ticket.type,
    message: ticket.message,
    from: ticket.from_username,
    role: ticket.role,
    targetUser: ticket.target_user,
    status: ticket.status,
    readBy: safeJsonParse(ticket.read_by, []),
    updatedAt: ticket.updated_at || undefined,
    replies: repliesByTicket.all(ticket.id).map((reply) => ({
      id: reply.id,
      time: reply.time,
      from: reply.from_username,
      message: reply.message
    }))
  }));
}

export function replaceTickets(tickets) {
  const database = ensureDb();
  const replace = database.transaction((items) => {
    database.prepare('DELETE FROM ticket_replies').run();
    database.prepare('DELETE FROM tickets').run();
    items.slice(0, 200).forEach((ticket) => {
      const clean = normalizeTicket(ticket);
      database.prepare(`
        INSERT INTO tickets (
          id, time, type, message, from_username, role, target_user, status, read_by, updated_at
        ) VALUES (
          @id, @time, @type, @message, @from, @role, @targetUser, @status, @readBy, @updatedAt
        )
      `).run({
        ...clean,
        readBy: stringifyJson(clean.readBy)
      });

      const insertReply = database.prepare(`
        INSERT INTO ticket_replies (id, ticket_id, time, from_username, message)
        VALUES (@id, @ticketId, @time, @from, @message)
      `);
      clean.replies.forEach((reply, index) => {
        insertReply.run({
          id: String(reply.id || `${clean.id}-reply-${index}`),
          ticketId: clean.id,
          time: String(reply.time || new Date().toISOString()),
          from: String(reply.from || 'unknown'),
          message: String(reply.message || '')
        });
      });
    });
  });

  replace(Array.isArray(tickets) ? tickets : []);
}

export function countUnreadTicketsFor(username, adminUsername) {
  return listTickets().filter((ticket) => (
    (ticket.from === username || ticket.targetUser === username || username === adminUsername) &&
    !(Array.isArray(ticket.readBy) && ticket.readBy.includes(username))
  )).length;
}

export function listAlerts(limit = 100) {
  return ensureDb().prepare(`
    SELECT
      id,
      type,
      severity,
      title,
      message,
      source,
      value,
      threshold,
      created_at AS createdAt,
      updated_at AS updatedAt,
      status,
      acknowledged_at AS acknowledgedAt,
      acknowledged_by AS acknowledgedBy,
      resolved_at AS resolvedAt
    FROM alerts
    ORDER BY
      CASE status WHEN 'Active' THEN 0 ELSE 1 END,
      datetime(created_at) DESC
    LIMIT ?
  `).all(limit).map((alert) => Object.fromEntries(
    Object.entries(alert).filter(([, value]) => value !== null && value !== undefined)
  ));
}

export function countActiveAlerts() {
  return ensureDb().prepare(`
    SELECT COUNT(*) AS count
    FROM alerts
    WHERE status = 'Active'
  `).get().count;
}

export function findActiveAlertByType(type) {
  return listAlerts().find((alert) => alert.type === type && alert.status === 'Active');
}

export function findAlertById(id) {
  return listAlerts().find((alert) => alert.id === id) || null;
}

export function saveAlert(alert) {
  ensureDb().prepare(`
    INSERT INTO alerts (
      id, type, severity, title, message, source, value, threshold, created_at,
      updated_at, status, acknowledged_at, acknowledged_by, resolved_at
    ) VALUES (
      @id, @type, @severity, @title, @message, @source, @value, @threshold, @createdAt,
      @updatedAt, @status, @acknowledgedAt, @acknowledgedBy, @resolvedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      severity = excluded.severity,
      title = excluded.title,
      message = excluded.message,
      source = excluded.source,
      value = excluded.value,
      threshold = excluded.threshold,
      updated_at = excluded.updated_at,
      status = excluded.status,
      acknowledged_at = excluded.acknowledged_at,
      acknowledged_by = excluded.acknowledged_by,
      resolved_at = excluded.resolved_at
  `).run({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    source: alert.source,
    value: alert.value ?? null,
    threshold: alert.threshold ?? null,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt ?? null,
    status: alert.status,
    acknowledgedAt: alert.acknowledgedAt ?? null,
    acknowledgedBy: alert.acknowledgedBy ?? null,
    resolvedAt: alert.resolvedAt ?? null
  });
}

export function getAcknowledgedAlertValue(type) {
  const row = ensureDb().prepare('SELECT value FROM acknowledged_alerts WHERE type = ?').get(type);
  return row ? row.value : undefined;
}

export function setAcknowledgedAlertValue(type, value) {
  ensureDb().prepare(`
    INSERT INTO acknowledged_alerts (type, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(type) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(type, Number(value || 0), new Date().toISOString());
}

export function clearAcknowledgedAlertValue(type) {
  ensureDb().prepare('DELETE FROM acknowledged_alerts WHERE type = ?').run(type);
}

function appendAuditLogFallback(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const logs = readJsonFileIfPresent(AUDIT_LOGS_JSON, []);
  const nextLogs = Array.isArray(logs) ? logs : [];
  nextLogs.unshift(entry);
  fs.writeFileSync(AUDIT_LOGS_JSON, JSON.stringify(nextLogs.slice(0, 1000), null, 2), 'utf8');
}

export function addAuditLog(entry) {
  const auditEntry = {
    timestamp: String(entry.timestamp || new Date().toISOString()),
    actor: String(entry.actor || 'unknown').slice(0, 80),
    role: String(entry.role || 'unknown').slice(0, 40),
    action: String(entry.action || 'unknown').slice(0, 80),
    resourceType: String(entry.resourceType || 'general').slice(0, 80),
    resourceId: entry.resourceId ? String(entry.resourceId).slice(0, 120) : null,
    result: String(entry.result || 'success').slice(0, 40),
    description: entry.description ? String(entry.description).slice(0, 500) : '',
    metadata: entry.metadata || {}
  };

  try {
    const result = ensureDb().prepare(`
      INSERT INTO audit_logs (
        timestamp, actor, role, action, resource_type, resource_id, result, description, metadata
      ) VALUES (
        @timestamp, @actor, @role, @action, @resourceType, @resourceId, @result, @description, @metadata
      )
    `).run({
      ...auditEntry,
      metadata: stringifyJson(auditEntry.metadata)
    });

    return { ...auditEntry, id: String(result.lastInsertRowid) };
  } catch (error) {
    const fallbackEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...auditEntry
    };
    appendAuditLogFallback(fallbackEntry);
    return fallbackEntry;
  }
}

export function listAuditLogs({ limit = 300, category = 'All' } = {}) {
  const actionFilters = {
    Auth: ['login_success', 'login_failure', 'logout', 'authorization_denied'],
    Tickets: ['ticket_created', 'ticket_replied', 'ticket_status_changed', 'ticket_marked_read', 'ticket_deleted'],
    AI: ['ai_analysis_run', 'remediation_plan_generated', 'ai_metrics_analysis', 'ai_alerts_analysis', 'ai_security_review', 'safe_commands_generated', 'incident_report_generated'],
    Alerts: ['alert_triggered', 'alert_resolved', 'alert_acknowledged'],
    Security: ['ai_security_review', 'authorization_denied'],
    Simulation: ['simulation_scenario_analyzed']
  };
  const selectedActions = actionFilters[category] || null;

  try {
    let rows;

    if (selectedActions) {
      const placeholders = selectedActions.map(() => '?').join(', ');
      rows = ensureDb().prepare(`
        SELECT
          id,
          timestamp,
          actor,
          role,
          action,
          resource_type AS resourceType,
          resource_id AS resourceId,
          result,
          description,
          metadata
        FROM audit_logs
        WHERE action IN (${placeholders})
        ORDER BY datetime(timestamp) DESC, id DESC
        LIMIT ?
      `).all(...selectedActions, limit);
    } else {
      rows = ensureDb().prepare(`
        SELECT
          id,
          timestamp,
          actor,
          role,
          action,
          resource_type AS resourceType,
          resource_id AS resourceId,
          result,
          description,
          metadata
        FROM audit_logs
        ORDER BY datetime(timestamp) DESC, id DESC
        LIMIT ?
      `).all(limit);
    }

    return rows.map((row) => ({
      ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined)),
      id: String(row.id),
      metadata: safeJsonParse(row.metadata, {})
    }));
  } catch {
    const logs = readJsonFileIfPresent(AUDIT_LOGS_JSON, []);
    const safeLogs = Array.isArray(logs) ? logs : [];
    const filteredLogs = selectedActions
      ? safeLogs.filter((entry) => selectedActions.includes(entry.action))
      : safeLogs;
    return filteredLogs.slice(0, limit);
  }
}
