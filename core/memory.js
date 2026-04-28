/**
 * JARVIS OS — Memory Engine
 * SQLite persistence layer: conversations, preferences, tool logs, cost tracking.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// ── Data directory ────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'jarvis.db');
const db      = new Database(DB_PATH);

// ── WAL mode for concurrent reads ─────────────────────────────────────────────
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          DATETIME DEFAULT (datetime('now')),
    role        TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content     TEXT NOT NULL,
    model       TEXT,
    tier        INTEGER,
    tokens      INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS preferences (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tool_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          DATETIME DEFAULT (datetime('now')),
    tool        TEXT NOT NULL,
    input       TEXT,
    result      TEXT,
    output      TEXT,
    model       TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS cost_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          DATETIME DEFAULT (datetime('now')),
    model       TEXT NOT NULL,
    tokens_in   INTEGER DEFAULT 0,
    tokens_out  INTEGER DEFAULT 0,
    usd_approx  REAL DEFAULT 0
  );
`);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmts = {
  insertMsg:    db.prepare('INSERT INTO conversations (role, content, model, tier, tokens) VALUES (?, ?, ?, ?, ?)'),
  recentMsgs:   db.prepare('SELECT role, content FROM conversations ORDER BY id DESC LIMIT ?'),
  insertPref:   db.prepare('INSERT OR REPLACE INTO preferences (key, value, updated_at) VALUES (?, ?, datetime("now"))'),
  getPref:      db.prepare('SELECT value FROM preferences WHERE key = ?'),
  insertTool:   db.prepare('INSERT INTO tool_logs (tool, input, result, model, duration_ms) VALUES (?, ?, ?, ?, ?)'),
  insertCost:   db.prepare('INSERT INTO cost_log (model, tokens_in, tokens_out, usd_approx) VALUES (?, ?, ?, ?)'),
  totalCost:    db.prepare('SELECT COALESCE(SUM(usd_approx), 0) AS total FROM cost_log WHERE ts >= date(\'now\', \'start of month\')'),
  statsToday:   db.prepare(`
    SELECT
      model,
      COUNT(*) AS calls,
      COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens,
      COALESCE(SUM(usd_approx), 0) AS cost
    FROM cost_log
    WHERE ts >= date('now')
    GROUP BY model
  `),
};

// ── USD cost per 1M tokens (approx) ──────────────────────────────────────────
const COST_TABLE = {
  'ollama':          { in: 0,     out: 0     },
  'gemini-flash':    { in: 0.075, out: 0.30  },
  'gemini-pro':      { in: 1.25,  out: 5.00  },
  'claude-sonnet':   { in: 3.00,  out: 15.00 },
  'claude-opus':     { in: 15.00, out: 75.00 },
};

function calcCost(model, tokensIn, tokensOut) {
  const key    = Object.keys(COST_TABLE).find(k => model.toLowerCase().includes(k)) ?? 'ollama';
  const rates  = COST_TABLE[key];
  return (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a message to conversation history.
 * @param {'user'|'assistant'|'system'} role
 * @param {string} content
 * @param {object} [meta] { model, tier, tokens }
 */
function saveMessage(role, content, meta = {}) {
  stmts.insertMsg.run(role, content, meta.model ?? null, meta.tier ?? null, meta.tokens ?? 0);
}

/**
 * Retrieve recent conversation turns, oldest first (for LLM context).
 * @param {number} [limit=12]
 * @returns {{ role: string, content: string }[]}
 */
function getRecentHistory(limit = 12) {
  return stmts.recentMsgs.all(limit).reverse();
}

/**
 * Get or set a preference value.
 */
function setPref(key, value) {
  stmts.insertPref.run(key, String(value));
}

function getPref(key, defaultValue = null) {
  const row = stmts.getPref.get(key);
  return row ? row.value : defaultValue;
}

/**
 * Log a tool invocation.
 */
function logTool(tool, input, result, model, durationMs) {
  stmts.insertTool.run(tool, JSON.stringify(input), String(result).slice(0, 2000), model, durationMs);
}

/**
 * Track API cost.
 */
function trackCost(model, tokensIn, tokensOut) {
  const usd = calcCost(model, tokensIn, tokensOut);
  stmts.insertCost.run(model, tokensIn, tokensOut, usd);
  return usd;
}

/**
 * Get this month's total cost in USD.
 */
function monthlyTotal() {
  return stmts.totalCost.get().total;
}

/**
 * Get today's per-model stats.
 */
function todayStats() {
  return stmts.statsToday.all();
}

module.exports = {
  saveMessage,
  getRecentHistory,
  setPref,
  getPref,
  logTool,
  trackCost,
  monthlyTotal,
  todayStats,
  db,
};
