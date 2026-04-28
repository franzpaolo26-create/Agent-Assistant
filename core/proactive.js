/**
 * JARVIS OS — Proactive Heartbeat Engine
 * Monitors system health and fires proactive WhatsApp notifications.
 * Runs as background cron jobs — Jarvis acts without being asked.
 */

const cron   = require('node-cron');
const os     = require('os');
const memory = require('./memory');

// Lazy-loaded to avoid circular dependency
let whatsapp = null;
function getWA() {
  if (!whatsapp) whatsapp = require('../channels/whatsapp');
  return whatsapp;
}

// ── Thresholds ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  cpu:        80,    // % CPU uso medio para alertar
  mem:        90,    // % RAM para alertar
  costDaily:  0.50,  // USD — aviso si supera este coste en un día
  costMonthly: 5.00, // USD — aviso mensual
};

// ── System metrics ────────────────────────────────────────────────────────────
function getCpuPercent() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const [type, time] of Object.entries(cpu.times)) {
      total += time;
      if (type === 'idle') idle += time;
    }
  }
  return Math.round((1 - idle / total) * 100);
}

function getMemPercent() {
  const free  = os.freemem();
  const total = os.totalmem();
  return Math.round((1 - free / total) * 100);
}

function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function uptime() {
  const sec  = Math.floor(os.uptime());
  const h    = Math.floor(sec / 3600);
  const m    = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

/**
 * Morning briefing — 09:00 every day.
 * Sends a daily summary to Franz.
 */
function scheduleMorningBriefing() {
  cron.schedule('0 9 * * *', async () => {
    console.log('[Proactive] 🌅 Ejecutando Morning Briefing...');
    try {
      const stats = memory.todayStats();
      const month = memory.monthlyTotal();

      let msg = `🌅 *Buenos días, Señor.*\n\n`;
      msg += `📊 *Resumen de ayer:*\n`;

      if (stats.length === 0) {
        msg += `  Sin actividad registrada.\n`;
      } else {
        for (const s of stats) {
          msg += `  • ${s.model}: ${s.calls} consultas — $${s.cost.toFixed(4)}\n`;
        }
      }

      msg += `\n💰 Coste mensual acumulado: *$${month.toFixed(4)}*`;
      msg += `\n🖥️ Servidor en línea — Uptime: ${uptime()}`;
      msg += `\n\n_JARVIS operativo. Listo para servirle, Señor._`;

      await getWA().sendProactive(msg);
    } catch (err) {
      console.error('[Proactive] Error en morning briefing:', err.message);
    }
  }, { timezone: 'Europe/Madrid' });

  console.log('[Proactive] ✅ Morning briefing programado (09:00 Madrid)');
}

/**
 * System health check — every 30 minutes.
 * Only alerts if thresholds are exceeded.
 */
function scheduleHealthCheck() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const cpu = getCpuPercent();
      const mem = getMemPercent();

      const alerts = [];
      if (cpu > THRESHOLDS.cpu) alerts.push(`⚠️ CPU al ${cpu}% — Actividad elevada`);
      if (mem > THRESHOLDS.mem) alerts.push(`⚠️ RAM al ${mem}% — ${formatBytes(os.freemem())} disponibles`);

      if (alerts.length > 0) {
        const msg = `🔔 *JARVIS — Alerta del sistema*\n\n${alerts.join('\n')}`;
        await getWA().sendProactive(msg);
      }
    } catch (err) {
      console.error('[Proactive] Error en health check:', err.message);
    }
  });

  console.log('[Proactive] ✅ Health check programado (cada 30 min)');
}

/**
 * Cost watchdog — every hour.
 * Alerts if daily cost exceeds threshold.
 */
function scheduleCostWatchdog() {
  cron.schedule('0 * * * *', async () => {
    try {
      const stats = memory.todayStats();
      const dailyCost = stats.reduce((acc, s) => acc + s.cost, 0);

      if (dailyCost > THRESHOLDS.costDaily) {
        const msg = `💸 *JARVIS — Alerta de coste*\n\n` +
          `El gasto de hoy ha superado *$${THRESHOLDS.costDaily}*.\n` +
          `Total: *$${dailyCost.toFixed(4)}*\n\n` +
          `_Considere si las tareas complejas pueden delegarse a modelos locales._`;
        await getWA().sendProactive(msg);
      }
    } catch (err) {
      console.error('[Proactive] Error en cost watchdog:', err.message);
    }
  });

  console.log('[Proactive] ✅ Cost watchdog programado (cada hora)');
}

/**
 * Tailscale heartbeat — every 5 minutes (prepara para Fase 2).
 * Placeholder que se activará cuando Tailscale esté configurado.
 */
function scheduleTailscaleHeartbeat() {
  // TODO Fase 2: Verificar conectividad Tailscale y reportar dispositivos offline
  console.log('[Proactive] ⏳ Tailscale heartbeat — pendiente (Fase 2)');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start all proactive jobs.
 */
function start() {
  console.log('[Proactive] 🚀 Iniciando motor proactivo...');
  scheduleMorningBriefing();
  scheduleHealthCheck();
  scheduleCostWatchdog();
  scheduleTailscaleHeartbeat();
  console.log('[Proactive] ✅ Todos los jobs activos.');
}

/**
 * Send a manual alert (called from other modules).
 */
async function alert(message) {
  await getWA().sendProactive(`🔔 *JARVIS — Notificación*\n\n${message}`);
}

module.exports = { start, alert };
