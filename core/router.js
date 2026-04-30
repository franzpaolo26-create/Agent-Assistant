/**
 * JARVIS OS — OpenClaw Router (Orchestrator Brain)
 * Analyzes every incoming request and decides which LLM tier to invoke.
 * Uses a cascade of heuristics → Ollama classifier → LLM call.
 */

const brain  = require('./brain');
const memory = require('./memory');
const triage = require('./triage');
const rag    = require('./rag');

// ── Keyword heuristics (no LLM needed, zero cost) ────────────────────────────
const TIER3_KEYWORDS = [
  'arquitectura', 'refactoriza', 'algoritmo', 'diseña', 'optimiza',
  'analiza en profundidad', 'depura', 'explica el código', 'explícame cómo funciona',
  'architecture', 'refactor', 'algorithm', 'deep analysis', 'debug this',
];

const TIER2_KEYWORDS = [
  'drive', 'documento', 'archivo', 'pdf', 'imagen', 'foto', 'busca en',
  'googlea', 'descarga', 'sube', 'lee el archivo', 'resume este',
  'document', 'file', 'search', 'image', 'photo', 'upload', 'download',
];

const TIER1_PATTERNS = [
  /^hola/i, /^hey/i, /^ok/i, /^gracias/i, /^perfecto/i, /^bien/i,
  /^hi/i, /^thanks/i, /^good/i, /^adiós/i, /^chau/i, /^bye/i,
  /^sí/i, /^no/i, /^yes/i, /^no/i, /^vale/i, /^entendido/i,
];

// ── Zero Cost Responses (Heuristics) ──────────────────────────────────────────
const HEURISTIC_RESPONSES = {
  'hola':    '¡Hola, Señor! ¿En qué puedo ayudarle hoy?',
  'gracias': 'Es un placer servirle, Señor.',
  'ok':      'Entendido, Señor.',
  'perfecto': 'Excelente, Señor.',
  'adiós':   'Hasta pronto, Señor. Estaré aquí si me necesita.',
};

/**
 * Fast heuristic classification (no API calls).
 * @returns {number|null} tier (1|2|3) or null if inconclusive
 */
function heuristicTier(text, hasMedia) {
  if (hasMedia) return 2; // Always Gemini for images/docs

  const trimmed = text.trim().toLowerCase();
  
  // Tier 0: Direct heuristic response for extremely common words
  if (HEURISTIC_RESPONSES[trimmed]) return 0;

  if (TIER3_KEYWORDS.some(kw => trimmed.includes(kw)))      return 3;
  if (TIER2_KEYWORDS.some(kw => trimmed.includes(kw)))      return 2;
  if (TIER1_PATTERNS.some(rx => rx.test(trimmed)))          return 1;
  if (trimmed.split(/\s+/).length <= 12)                    return 1; // Short message (up to 12 words) → Ollama

  return null; // Inconclusive → ask classifier
}

/**
 * Map tier to provider name.
 */
function tierToProvider(tier) {
  switch (tier) {
    case 1:  return 'ollama';
    case 2:  return 'gemini';
    case 3:  return 'claude';
    default: return 'ollama';
  }
}

// ── Command detector ──────────────────────────────────────────────────────────
const COMMANDS = {
  '/drive':    { tier: 2, intent: 'drive_list'       },
  '/gmail':    { tier: 2, intent: 'gmail_digest'     },
  '/agenda':   { tier: 2, intent: 'calendar_agenda'  },
  '/tareas':   { tier: 2, intent: 'tasks_list'       },
  '/status':   { tier: 0, intent: 'system_status'    },
  '/coste':    { tier: 0, intent: 'cost_report'      },
  '/shell':    { tier: 2, intent: 'shell_exec'       },
  '/memoria':  { tier: 1, intent: 'memory_search'    },
  '/help':     { tier: 0, intent: 'help'             },
};

function detectCommand(text) {
  const trimmed = text.trim();
  for (const [cmd, meta] of Object.entries(COMMANDS)) {
    if (trimmed.toLowerCase().startsWith(cmd)) {
      return { ...meta, args: trimmed.slice(cmd.length).trim() };
    }
  }
  return null;
}

// ── Main route() ──────────────────────────────────────────────────────────────

/**
 * Route an incoming message to the correct LLM and execute it.
 *
 * @param {object} input
 * @param {string}   input.text       — raw message text
 * @param {boolean}  [input.hasMedia] — image or document attached
 * @param {object}   [input.mediaPart]— Gemini-compatible media part
 * @param {string}   [input.audioB64] — base64 audio for transcription
 * @returns {Promise<{ text: string, provider: string, tier: number, cost: number, intent: string }>}
 */
async function route(input) {
  const { text = '', hasMedia = false, mediaPart = null } = input;

  // 1. Priority triage FIRST (P0 = immediate, P3 = queue)
  const priority = triage.triage({ text, hasMedia, source: input.source ?? 'whatsapp' });
  if (triage.isNocturnal(priority.priority)) {
    triage.queueNocturnal({ description: text.slice(0, 100), input });
    return {
      text:      `_Tarea registrada para ejecución nocturna, Señor. La ejecutaré cuando el servidor esté en reposo._`,
      provider:  'local',
      tier:      3,
      priority:  priority.priority,
      intent:    'nocturnal_queue',
      cost:      0,
      isQueued:  true,
    };
  }

  // 2. Check for explicit slash commands
  const command = detectCommand(text);
  if (command) {
    return { tier: command.tier, intent: command.intent, args: command.args, isCommand: true, priority: priority.priority };
  }

  // 3. Fast heuristic (zero cost)
  let tier   = heuristicTier(text, hasMedia);
  let intent = 'general';

  // Handle Tier 0 (Hardcoded responses)
  if (tier === 0) {
    const trimmed = text.trim().toLowerCase();
    return {
      text:      HEURISTIC_RESPONSES[trimmed] ?? 'Entendido, Señor.',
      provider:  'heuristic',
      tier:      0,
      priority:  priority.priority,
      intent:    'social',
      cost:      0,
    };
  }

  // 4. If inconclusive, ask Ollama classifier (still free)
  if (tier === null) {
    console.log('[Router] Heuristic inconclusive — asking Ollama classifier...');
    const classification = await brain.classify(text);
    if (classification) {
      tier   = classification.tier   ?? 2;
      intent = classification.intent ?? 'general';
      console.log(`[Router] Classifier → tier:${tier} intent:${intent}`);
    } else {
      tier   = 2;
      intent = 'general';
      console.log('[Router] Classifier unavailable → defaulting to tier 2');
    }
  }

  const provider = tierToProvider(tier);
  console.log(`[Router] → Tier ${tier} | ${provider.toUpperCase()} | intent: ${intent} | priority: ${priority.priority}`);

  // 5. Build context: SQLite history + RAG semantic context
  const history    = memory.getRecentHistory(getContextLimit(tier));
  const ragContext = await rag.buildContext(text);

  // Inject RAG context into the last user message
  if (ragContext && history.length > 0) {
    const lastMsg   = history[history.length - 1];
    history[history.length - 1] = {
      ...lastMsg,
      content: lastMsg.content + ragContext,
    };
  }

  // Ensure current message is in history
  const fullHistory = [...history, { role: 'user', content: text }];

  // 6. Invoke LLM via brain (with automatic fallback)
  const result = await brain.ask(provider, fullHistory, {
    tier,
    ...(hasMedia && mediaPart ? { imagePart: mediaPart } : {}),
  });

  // 7. Persist to SQLite + RAG
  memory.saveMessage('user',      text,        {});
  memory.saveMessage('assistant', result.text, { model: result.model, tier, tokens: result.tokensIn + result.tokensOut });
  rag.saveConversation('user',      text,        { tier, intent });
  rag.saveConversation('assistant', result.text, { model: result.model, tier, intent });

  return {
    text:     result.text,
    provider: result.provider,
    model:    result.model,
    tier,
    intent,
    cost:     result.cost,
    priority: priority.priority,
  };
}

/**
 * How much context to pass based on tier (save tokens for cheap models).
 */
function getContextLimit(tier) {
  switch (tier) {
    case 1:  return 6;   // Ollama — keep it lean
    case 2:  return 10;  // Gemini — moderate context
    case 3:  return 20;  // Claude — full context for complex tasks
    default: return 8;
  }
}

module.exports = { route, detectCommand, tierToProvider, heuristicTier };
