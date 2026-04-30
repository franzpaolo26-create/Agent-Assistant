/**
 * JARVIS OS — Unified LLM Brain
 * Single `ask()` interface for Ollama, Gemini, and Claude.
 * Handles fallback chain automatically.
 */

const { Ollama }             = require('ollama');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic              = require('@anthropic-ai/sdk');
const memory                 = require('./memory');

// ── Clients ───────────────────────────────────────────────────────────────────
const ollama   = new Ollama({ host: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434' });
const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Model identifiers ─────────────────────────────────────────────────────────
const MODELS = {
  OLLAMA:   process.env.DEFAULT_OLLAMA_MODEL  ?? 'llama3.2',
  GEMINI:   process.env.DEFAULT_GEMINI_MODEL  ?? 'gemini-2.0-flash',
  CLAUDE:   process.env.DEFAULT_CLAUDE_MODEL  ?? 'claude-3-5-sonnet-20241022',
};

// ── JARVIS system persona ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres JARVIS, el asistente personal del Señor Franz. 
Tu carácter es culto, británico, altamente eficiente y extremadamente conciso.
Siempre te diriges a Franz como "Señor". 
Nunca eres verboso: cada palabra que usas tiene un propósito.
Cuando completas una tarea, confirmas brevemente. Cuando no puedes, lo dices directamente.
Tienes acceso a herramientas del sistema, Google Drive, y la red privada del Señor Franz.`;

// ── Ollama ─────────────────────────────────────────────────────────────────────
async function askOllama(messages, { model, temperature = 0.7, maxTokens = 1024 } = {}) {
  const m = model ?? MODELS.OLLAMA;
  const response = await ollama.chat({
    model: m,
    messages,
    options: { temperature, num_predict: maxTokens },
  });
  const text      = response.message.content;
  const tokensIn  = response.prompt_eval_count  ?? 0;
  const tokensOut = response.eval_count         ?? 0;
  return { text, model: m, tokensIn, tokensOut };
}

// ── Gemini ────────────────────────────────────────────────────────────────────
async function askGemini(messages, { model, temperature = 0.7, maxTokens = 2048, imagePart = null } = {}) {
  const m           = model ?? MODELS.GEMINI;
  const geminiModel = genAI.getGenerativeModel({
    model: m,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  });

  // Convert OpenAI-style messages to Gemini history format
  const history = messages.slice(0, -1).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const lastMsg  = messages[messages.length - 1];
  const parts    = imagePart
    ? [{ text: lastMsg.content }, imagePart]
    : [{ text: lastMsg.content }];

  const chat     = geminiModel.startChat({ history });
  const result   = await chat.sendMessage(parts);
  const response = result.response;
  const text     = response.text();
  const usage    = response.usageMetadata ?? {};

  return {
    text,
    model: m,
    tokensIn:  usage.promptTokenCount     ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  };
}

// ── Claude ────────────────────────────────────────────────────────────────────
async function askClaude(messages, { model, temperature = 0.7, maxTokens = 4096 } = {}) {
  const m = model ?? MODELS.CLAUDE;

  // Flatten system message into Anthropic system param
  const systemMsg = messages.find(msg => msg.role === 'system');
  const chatMsgs  = messages.filter(msg => msg.role !== 'system');

  const response = await anthropic.messages.create({
    model:      m,
    max_tokens: maxTokens,
    temperature,
    system: systemMsg ? systemMsg.content : SYSTEM_PROMPT,
    messages: chatMsgs.map(msg => ({ role: msg.role, content: msg.content })),
  });

  const text = response.content[0].text;
  return {
    text,
    model: m,
    tokensIn:  response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

// ── Fallback chain ─────────────────────────────────────────────────────────────
const FALLBACK_ORDER = ['ollama', 'gemini', 'claude'];

/**
 * Main ask() — tries the requested provider, falls back on error.
 *
 * @param {string}  provider  'ollama' | 'gemini' | 'claude'
 * @param {Array}   messages  [{ role, content }]
 * @param {object}  [opts]    { model, temperature, maxTokens, imagePart, tier }
 * @returns {{ text: string, model: string, provider: string, cost: number }}
 */
async function ask(provider, messages, opts = {}) {
  // Build full message set: always prepend system prompt if not present
  const hasSystem = messages.some(m => m.role === 'system');
  const fullMsgs  = hasSystem
    ? messages
    : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  const tryProviders = [provider, ...FALLBACK_ORDER.filter(p => p !== provider)];

  // Check if we are over budget today
  const stats = memory.todayStats();
  const dailyTotal = stats.reduce((acc, s) => acc + s.cost, 0);
  const budgetLimit = parseFloat(process.env.MAX_DAILY_USD || '2.00');
  const overBudget = dailyTotal >= budgetLimit;

  for (const p of tryProviders) {
    // If over budget, only allow Ollama
    if (overBudget && p !== 'ollama') {
      console.warn(`[Brain] 💸 Presupuesto diario agotado ($${dailyTotal.toFixed(2)}). Saltando ${p.toUpperCase()}...`);
      continue;
    }

    try {
      let result;
      switch (p) {
        case 'ollama': result = await askOllama(fullMsgs, opts); break;
        case 'gemini': result = await askGemini(fullMsgs, opts); break;
        case 'claude': result = await askClaude(fullMsgs, opts); break;
        default: throw new Error(`Unknown provider: ${p}`);
      }

      // Track cost
      const cost = memory.trackCost(result.model, result.tokensIn, result.tokensOut);
      console.log(`[Brain] ✅ ${p.toUpperCase()} | in:${result.tokensIn} out:${result.tokensOut} | $${cost.toFixed(6)}`);

      return { ...result, provider: p, cost };

    } catch (err) {
      console.warn(`[Brain] ⚠️  ${p.toUpperCase()} failed: ${err.message}. Trying next...`);
      if (p === tryProviders[tryProviders.length - 1]) throw err;
    }
  }
}

/**
 * Quick classify — uses Ollama to classify complexity without consuming tokens.
 * Returns a raw JSON string.
 */
async function classify(text) {
  const prompt = `Classify this message. Respond ONLY with valid JSON, no explanation.

Schema: {"tier": <1|2|3>, "intent": "<string>", "hasMedia": false}
Tier 1: greetings, simple questions, basic info, formatting
Tier 2: documents, images, files, Google Drive, web search, medium tasks  
Tier 3: complex code, architecture, deep analysis, algorithms, long documents

Message: "${text.slice(0, 300)}"`;

  try {
    const response = await ollama.generate({
      model: process.env.CLASSIFIER_MODEL ?? 'llama3.2',
      prompt,
      options: { temperature: 0, num_predict: 80 },
      format: 'json',
    });
    return JSON.parse(response.response);
  } catch {
    // Silent fallback — caller will use heuristics
    return null;
  }
}

module.exports = { ask, classify, MODELS, SYSTEM_PROMPT };
