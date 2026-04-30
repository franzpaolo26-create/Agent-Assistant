/**
 * JARVIS OS — WhatsApp Channel
 * Zero Trust security: only messages from OWNER_NUMBER are processed.
 * Handles text, images, documents, and audio.
 */

require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const router   = require('../core/router');
const memory   = require('../core/memory');
const drive    = require('../tools/drive');
const shell    = require('../tools/shell');
const voice    = require('../tools/voice');
const gmail    = require('../tools/gmail');
const calendar = require('../tools/calendar');
const tasks    = require('../tools/calendar'); // same module
const rag      = require('../core/rag');

// ── WhatsApp Client ───────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'jarvis' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

// ── Event: QR ────────────────────────────────────────────────────────────────
client.on('qr', qr => {
  console.log('\n╔══════════════════════════════╗');
  console.log('║  JARVIS — Escanea el código  ║');
  console.log('╚══════════════════════════════╝\n');
  qrcode.generate(qr, { small: true });
});

// ── Event: Ready ─────────────────────────────────────────────────────────────
client.on('ready', () => {
  console.log('[WhatsApp] ✅ Jarvis online. Todos los sistemas operativos, Señor.');
});

client.on('authenticated', () => {
  console.log('[WhatsApp] 🔐 Autenticación exitosa.');
});

client.on('auth_failure', msg => {
  console.error('[WhatsApp] ❌ Error de autenticación:', msg);
});

client.on('disconnected', reason => {
  console.warn('[WhatsApp] ⚠️  Desconectado:', reason);
});

// ── Zero Trust Validator ──────────────────────────────────────────────────────
function isAuthorized(msg) {
  // Solo procesamos mensajes enviados por la propia cuenta (el Dueño)
  if (!msg.fromMe)                                      return false;
  if (msg.from !== process.env.OWNER_NUMBER)            return false;
  if (msg.isGroup)                                      return false;

  // PROTECCIÓN CONTRA BUCLES: Ignorar mensajes generados por el propio JARVIS
  // Usamos un Zero-Width Space (\u200B) como firma invisible al final de los mensajes.
  if (msg.body && msg.body.includes('\u200B')) {
    console.log('[WhatsApp] 🛡️ Bucle detectado o mensaje propio ignorado.');
    return false;
  }

  // Backup para media: Si el mensaje viene de la web (Puppeteer) es nuestro
  if (msg.deviceType === 'web' && (msg.type === 'audio' || msg.type === 'ptt' || msg.type === 'image')) {
    return false;
  }

  return true;
}

// ── Command handlers (slash commands) ────────────────────────────────────────
async function handleCommand(intent, args, msg) {
  switch (intent) {

    case 'drive_list': {
      await msg.reply('_Consultando su Drive, Señor..._');
      const lista = await drive.listFiles(args || null);
      await msg.reply(lista);
      break;
    }

    case 'gmail_digest': {
      await msg.reply('_Revisando su bandeja de entrada, Señor..._');
      const digest = await gmail.unreadDigest(5);
      await msg.reply(digest);
      break;
    }

    case 'calendar_agenda': {
      await msg.reply('_Consultando su agenda, Señor..._');
      const days   = parseInt(args) || 7;
      const agenda = await calendar.getAgenda(days);
      await msg.reply(agenda);
      break;
    }

    case 'tasks_list': {
      await msg.reply('_Revisando sus tareas pendientes, Señor..._');
      const tasksList = await tasks.getPendingTasks();
      await msg.reply(tasksList);
      break;
    }

    case 'system_status': {
      const stats = memory.todayStats();
      const month = memory.monthlyTotal();
      const info  = await shell.systemInfo();
      let report  = `*🤖 JARVIS OS — Estado del sistema*
`;
      report += `🖥️ ${info.hostname} | ${info.platform} | Node ${info.nodeVersion}
`;
      report += `⏱️ Uptime: ${info.uptime}
`;
      report += `💾 RAM libre: ${info.freeMemGb}GB / ${info.totalMemGb}GB

`;
      report += `📊 *Costes de hoy:*
`;
      if (stats.length === 0) report += `  Sin actividad.
`;
      for (const s of stats) {
        report += `  • ${s.model}: ${s.calls} llamadas — $${s.cost.toFixed(4)}
`;
      }
      report += `
💰 Coste mensual: *$${month.toFixed(4)}*`;
      await msg.reply(report);
      break;
    }

    case 'cost_report': {
      const month = memory.monthlyTotal();
      await msg.reply(`💰 Coste acumulado este mes: *$${month.toFixed(4)}*`);
      break;
    }

    case 'shell_exec': {
      if (!args) {
        await msg.reply('_Señor, indique el comando a ejecutar._');
        break;
      }
      await msg.reply(`_Ejecutando: \`${args}\`..._`);
      const result = await shell.exec(args);
      await msg.reply(`\`\`\`
${result.slice(0, 3500)}
\`\`\``);
      break;
    }

    case 'memory_search': {
      if (!args) { await msg.reply('_¿Qué desea buscar en la memoria, Señor?_'); break; }
      const snippets = await rag.search(args, 3);
      if (snippets.length === 0) {
        await msg.reply(`_No encontré recuerdos relevantes sobre "${args}", Señor._`);
      } else {
        await msg.reply(`🧠 *Memoria relevante:*

${snippets.map((s, i) => `${i + 1}. ${s}`).join('

')}`);
      }
      break;
    }

    case 'help': {
      const helpText = `*🤖 JARVIS OS — Comandos disponibles*

` +
        `/drive [búsqueda] — Google Drive (2TB)
` +
        `/gmail — Bandeja de entrada (no leídos)
` +
        `/agenda [días] — Agenda del calendario
` +
        `/tareas — Tareas pendientes
` +
        `/shell <cmd> — Ejecutar en el servidor
` +
        `/status — Estado del sistema y costes
` +
        `/coste — Coste mensual acumulado
` +
        `/memoria <consulta> — Buscar en memoria RAG
` +
        `/help — Este menú

` +
        `_O simplemente escríbame en lenguaje natural, Señor._`;
      await msg.reply(helpText);
      break;
    }

    default:
      await msg.reply('_Comando no reconocido, Señor. Escriba /help para ver las opciones._');
  }
}

// ── Audio message handler ─────────────────────────────────────────────────────
async function handleAudio(msg) {
  await msg.reply('_Transcribiendo su mensaje de voz, Señor..._');
  const media = await msg.downloadMedia();
  if (!media) {
    await msg.reply('_No pude procesar el audio, Señor._');
    return null;
  }
  const text = await voice.transcribe(media.data, media.mimetype);
  console.log(`[WhatsApp] 🎤 Transcrito: "${text.slice(0, 100)}"`);
  return text;
}

// ── Media extraction (Gemini-compatible) ─────────────────────────────────────
async function extractMediaPart(msg) {
  try {
    const media    = await msg.downloadMedia();
    if (!media) return null;
    return {
      inlineData: {
        data:     media.data,
        mimeType: media.mimetype,
      },
    };
  } catch (err) {
    console.warn('[WhatsApp] Error al descargar media:', err.message);
    return null;
  }
}

// ── Main message handler ──────────────────────────────────────────────────────
client.on('message_create', async msg => {

  // ── Zero Trust Gate ──
  if (!isAuthorized(msg)) return;

  const isAudio  = msg.type === 'ptt' || msg.type === 'audio';
  let   text     = msg.body?.trim() ?? '';
  const hasMedia = msg.hasMedia && !isAudio; // images/docs, not audio

  console.log(`[WhatsApp] 📩 Mensaje recibido: type:${msg.type} media:${hasMedia} audio:${isAudio}`);

  // Send typing indicator
  const chat = await msg.getChat();
  await chat.sendStateTyping();

  try {
    // ── Audio: transcribe first ──
    if (isAudio) {
      const transcribed = await handleAudio(msg);
      if (!transcribed) return;
      text = transcribed;
      await msg.reply(`🎤 _Transcripción:_ "${text}"`);
    }

    // Extract media if present
    let mediaPart = null;
    if (hasMedia) {
      mediaPart = await extractMediaPart(msg);
      if (!mediaPart) {
        await msg.reply('_No he podido procesar ese archivo, Señor. Inténtelo de nuevo._');
        return;
      }
    }

    // Route message through OpenClaw
    const routeResult = await router.route({ text, hasMedia, mediaPart });

    // Handle slash commands
    if (routeResult.isCommand) {
      await handleCommand(routeResult.intent, routeResult.args, msg);
      return;
    }

    // Handle queued nocturnal tasks
    if (routeResult.isQueued) {
      await msg.reply(routeResult.text);
      return;
    }

    // Send LLM response
    if (routeResult.text) {
      // Check if user wants voice response
      if (voice.shouldRespondWithVoice(text)) {
        await msg.reply('_Generando respuesta de voz, Señor..._');
        const oggPath = await voice.textToSpeech(routeResult.text);
        if (oggPath) {
          const { MessageMedia } = require('whatsapp-web.js');
          const media = MessageMedia.fromFilePath(oggPath);
          await client.sendMessage(process.env.OWNER_NUMBER, media, { 
            sendAudioAsVoice: true,
            caption: 'JARVIS_VOICE\u200B' // Invisible signature in caption
          });
          const fs = require('fs');
          try { fs.unlinkSync(oggPath); } catch {}
        } else {
          // Fallback to text if TTS fails
          await msg.reply(routeResult.text);
        }
      } else {
        const chunks = splitMessage(routeResult.text, 4000);
        for (const chunk of chunks) {
          // Add Zero-Width Space signature to prevent loops
          await msg.reply(chunk + '\u200B');
        }
      }

      // Debug tier log
      const tierEmoji = ['🟢', '🟢', '🔵', '🔴'][routeResult.tier] ?? '⚪';
      const prioEmoji = { P0: '🚨', P1: '🔴', P2: '🟡', P3: '🟢' }[routeResult.priority] ?? '';
      console.log(`[WhatsApp] ${tierEmoji} Tier:${routeResult.tier} ${prioEmoji} ${routeResult.priority} | ${routeResult.provider} | $${routeResult.cost?.toFixed(6) ?? 0}`);
    }

  } catch (err) {
    console.error('[WhatsApp] ❌ Error crítico:', err);
    await msg.reply('_Estoy experimentando dificultades técnicas, Señor. Por favor, inténtelo de nuevo en un momento._');
  } finally {
    await chat.clearState();
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let   i      = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}

/**
 * Send a proactive message to the owner (called by proactive.js).
 * @param {string} text
 */
async function sendProactive(text) {
  try {
    const ownerNum = process.env.OWNER_NUMBER;
    if (!ownerNum) throw new Error('OWNER_NUMBER not set');
    // Add Zero-Width Space signature to prevent loops
    await client.sendMessage(ownerNum, text + '\u200B');
    console.log('[WhatsApp] 📤 Mensaje proactivo enviado.');
  } catch (err) {
    console.error('[WhatsApp] Error enviando proactivo:', err.message);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  client.initialize();
}

module.exports = { init, sendProactive, client };
