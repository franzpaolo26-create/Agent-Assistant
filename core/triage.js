/**
 * JARVIS OS — Priority Triage System
 * Classifies every incoming event into P0→P3 and determines response urgency.
 *
 * P0 Critical  → Immediate WhatsApp alert, never queue
 * P1 High      → Proactive notification, execute within minutes
 * P2 Medium    → Silent execution, include in daily digest
 * P3 Low       → Queue for nocturnal execution on VPS
 */

// ── Priority definitions ──────────────────────────────────────────────────────
const PRIORITY = {
  P0: { level: 0, label: 'CRÍTICA',   emoji: '🚨', maxResponseMs: 0      },
  P1: { level: 1, label: 'ALTA',      emoji: '🔴', maxResponseMs: 60_000 },
  P2: { level: 2, label: 'MEDIA',     emoji: '🟡', maxResponseMs: null   },
  P3: { level: 3, label: 'BAJA',      emoji: '🟢', maxResponseMs: null   },
};

// ── Pattern matchers ──────────────────────────────────────────────────────────
const P0_SIGNALS = [
  // Server/security events
  /servidor caído|server down|down|crítico|critical/i,
  /hack|intrusión|intrusion|acceso no autorizado|unauthorized/i,
  /disco lleno|disk full|out of (disk|memory|space)/i,
  /error fatal|fatal error|crash|kernel panic/i,
  // Urgent personal
  /emergencia|emergency|urgente ahora|right now/i,
];

const P1_SIGNALS = [
  /reunión en \d+ min|meeting in \d+ min/i,
  /correo de (jefe|boss|cliente|client|ceo|cto)/i,
  /pago pendiente|payment due|factura vencida/i,
  /recordatorio|reminder|no olvides|don't forget/i,
  /alerta|alert|aviso urgente/i,
  /llamada|call|videoconferencia/i,
];

const P3_SIGNALS = [
  /backup|copia de seguridad|indexa|optimiza|limpia|cleanup/i,
  /nocturno|noche|overnight|while i sleep/i,
  /mañana|tomorrow|cuando puedas|whenever/i,
];

// ── Triage engine ─────────────────────────────────────────────────────────────

/**
 * Determine the priority of an incoming message or system event.
 *
 * @param {object} input
 * @param {string}  input.text        — message text
 * @param {string}  [input.source]    — 'whatsapp' | 'system' | 'gmail' | 'cron'
 * @param {boolean} [input.hasMedia]  — image or document
 * @param {number}  [input.tier]      — router tier (0-3) if already classified
 * @returns {{ priority: string, level: number, emoji: string, label: string, reason: string }}
 */
function triage(input) {
  const { text = '', source = 'whatsapp', hasMedia = false, tier } = input;

  // System events always P0
  if (source === 'system' && tier === 0) {
    return { priority: 'P0', ...PRIORITY.P0, reason: 'System critical event' };
  }

  // Check P0 patterns
  if (P0_SIGNALS.some(rx => rx.test(text))) {
    return { priority: 'P0', ...PRIORITY.P0, reason: 'Critical keyword detected' };
  }

  // Check P1 patterns
  if (P1_SIGNALS.some(rx => rx.test(text))) {
    return { priority: 'P1', ...PRIORITY.P1, reason: 'High priority keyword' };
  }

  // Media (images/docs) → P1 minimum (needs immediate attention)
  if (hasMedia) {
    return { priority: 'P1', ...PRIORITY.P1, reason: 'Media attachment — needs processing' };
  }

  // Check P3 patterns
  if (P3_SIGNALS.some(rx => rx.test(text))) {
    return { priority: 'P3', ...PRIORITY.P3, reason: 'Low priority / schedulable task' };
  }

  // Gmail events
  if (source === 'gmail') {
    return { priority: 'P2', ...PRIORITY.P2, reason: 'Email — queued for digest' };
  }

  // Default: P2 (normal conversation)
  return { priority: 'P2', ...PRIORITY.P2, reason: 'Standard request' };
}

/**
 * Format a priority badge for WhatsApp messages.
 */
function badge(priority) {
  const p = PRIORITY[priority];
  return p ? `${p.emoji} [${p.label}]` : '';
}

/**
 * Should this priority be executed immediately (vs queued)?
 */
function isImmediate(priority) {
  return priority === 'P0' || priority === 'P1';
}

/**
 * Should this priority be queued for nocturnal execution?
 */
function isNocturnal(priority) {
  return priority === 'P3';
}

// ── Nocturnal task queue ──────────────────────────────────────────────────────
const nocturnalQueue = [];

function queueNocturnal(task) {
  nocturnalQueue.push({ ...task, queuedAt: new Date().toISOString() });
  console.log(`[Triage] 🟢 Tarea encolada para ejecución nocturna: ${task.description}`);
}

function drainNocturnalQueue() {
  const tasks = [...nocturnalQueue];
  nocturnalQueue.length = 0;
  return tasks;
}

module.exports = {
  triage,
  badge,
  isImmediate,
  isNocturnal,
  queueNocturnal,
  drainNocturnalQueue,
  PRIORITY,
};
