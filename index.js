/**
 * JARVIS OS — Main Entry Point
 * Boots the system: Memory → Brain → Router → WhatsApp → Proactive Engine
 */

require('dotenv').config();

const memory    = require('./core/memory');
const proactive = require('./core/proactive');
const whatsapp  = require('./channels/whatsapp');
const { authorize } = require('./auth');

// ── ASCII Banner ──────────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║        ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗       ║
║        ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝       ║
║        ██║███████║██████╔╝██║   ██║██║███████╗       ║
║   ██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║       ║
║   ╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║       ║
║    ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝       ║
║                                                       ║
║         OpenClaw Multi-Model Agent — v2.0             ║
║         Desarrollado exclusivamente para el Señor     ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function boot() {
  printBanner();

  // 1. Validate required env vars
  const required = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OWNER_NUMBER'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
    console.error('   Copia .env.example a .env y rellena los valores.');
    process.exit(1);
  }

  console.log('[Boot] 🔧 Iniciando subsistemas...\n');

  // 2. Initialize memory (SQLite)
  try {
    console.log('[Boot] 💾 Memory Engine... OK');
    memory.setPref('last_boot', new Date().toISOString());
  } catch (err) {
    console.error('[Boot] ❌ Memory Engine falló:', err.message);
    process.exit(1);
  }

  // 3. Authorize Google (Drive)
  try {
    await authorize();
    console.log('[Boot] 📂 Google Drive... OK');
  } catch (err) {
    console.warn('[Boot] ⚠️  Google Drive no disponible:', err.message);
    // Non-fatal — continue without Drive
  }

  // 4. Start proactive engine
  try {
    proactive.start();
    console.log('[Boot] 🚀 Proactive Engine... OK');
  } catch (err) {
    console.error('[Boot] ❌ Proactive Engine falló:', err.message);
  }

  // 5. Launch WhatsApp (last — blocks until authenticated)
  console.log('[Boot] 📱 WhatsApp Channel...');
  whatsapp.init();

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', err => {
    console.error('[JARVIS] ❌ Excepción no capturada:', err);
    // Don't exit — let PM2 handle restart if critical
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[JARVIS] ❌ Promise rechazada:', reason);
  });
}

async function shutdown(signal) {
  console.log(`\n[JARVIS] 🔴 Señal ${signal} recibida. Apagando con elegancia...`);
  try {
    const month = memory.monthlyTotal();
    console.log(`[JARVIS] 💰 Coste total del mes: $${month.toFixed(4)}`);
  } catch {}
  console.log('[JARVIS] Hasta pronto, Señor.');
  process.exit(0);
}

boot();