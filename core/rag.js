/**
 * JARVIS OS — RAG Memory (ChromaDB + Ollama Embeddings)
 * Long-term vector memory: stores conversations, documents, and preferences.
 * Enables semantic search over months of context.
 */

const { ChromaClient, OllamaEmbeddingFunction } = require('chromadb');

// ── Config ────────────────────────────────────────────────────────────────────
const CHROMA_URL       = process.env.CHROMA_URL          ?? 'http://localhost:8000';
const EMBED_MODEL      = process.env.EMBED_MODEL          ?? 'nomic-embed-text';
const OLLAMA_URL       = process.env.OLLAMA_BASE_URL      ?? 'http://ollama:11434';
const COLLECTION_NAMES = {
  CONVERSATIONS: 'jarvis_conversations',
  DOCUMENTS:     'jarvis_documents',
  PREFERENCES:   'jarvis_preferences',
};

// ── Client + Embedder ─────────────────────────────────────────────────────────
let client     = null;
let embedder   = null;
let collections = {};
let initialized = false;

function getEmbedder() {
  if (!embedder) {
    embedder = new OllamaEmbeddingFunction({
      url:   `${OLLAMA_URL}/api/embeddings`,
      model: EMBED_MODEL,
    });
  }
  return embedder;
}

async function getCollection(name) {
  if (collections[name]) return collections[name];
  const col = await client.getOrCreateCollection({
    name,
    embeddingFunction: getEmbedder(),
    metadata: { 'hnsw:space': 'cosine' },
  });
  collections[name] = col;
  return col;
}

/**
 * Initialize ChromaDB connection.
 * Non-fatal if unavailable — falls back gracefully.
 */
async function init() {
  if (initialized) return true;
  try {
    client = new ChromaClient({ path: CHROMA_URL });
    await client.heartbeat();
    // Pre-init collections
    await getCollection(COLLECTION_NAMES.CONVERSATIONS);
    await getCollection(COLLECTION_NAMES.DOCUMENTS);
    await getCollection(COLLECTION_NAMES.PREFERENCES);
    initialized = true;
    console.log(`[RAG] ✅ ChromaDB conectado: ${CHROMA_URL}`);
    return true;
  } catch (err) {
    console.warn(`[RAG] ⚠️  ChromaDB no disponible (${err.message}). RAG desactivado.`);
    return false;
  }
}

// ── Write operations ──────────────────────────────────────────────────────────

/**
 * Save a conversation turn to long-term memory.
 * @param {string} role     'user' | 'assistant'
 * @param {string} content
 * @param {object} [meta]   { model, tier, intent }
 */
async function saveConversation(role, content, meta = {}) {
  if (!initialized) return;
  try {
    const col = await getCollection(COLLECTION_NAMES.CONVERSATIONS);
    const id  = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await col.add({
      ids:       [id],
      documents: [content],
      metadatas: [{
        role,
        ts:     new Date().toISOString(),
        model:  meta.model  ?? 'unknown',
        tier:   meta.tier   ?? 0,
        intent: meta.intent ?? 'general',
      }],
    });
  } catch (err) {
    console.warn('[RAG] Error guardando conversación:', err.message);
  }
}

/**
 * Save a document (email, Drive file, etc.) to long-term memory.
 * @param {string} content
 * @param {object} meta   { source, title, date }
 */
async function saveDocument(content, meta = {}) {
  if (!initialized) return;
  try {
    const col   = await getCollection(COLLECTION_NAMES.DOCUMENTS);
    const id    = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Chunk large docs into segments of ~500 chars
    const chunks = chunkText(content, 500);
    const ids    = chunks.map((_, i) => `${id}_chunk${i}`);
    const metas  = chunks.map(() => ({
      source: meta.source ?? 'unknown',
      title:  meta.title  ?? 'Untitled',
      date:   meta.date   ?? new Date().toISOString(),
    }));
    await col.add({ ids, documents: chunks, metadatas: metas });
  } catch (err) {
    console.warn('[RAG] Error guardando documento:', err.message);
  }
}

// ── Read operations ───────────────────────────────────────────────────────────

/**
 * Semantic search across all memory types.
 * @param {string} query
 * @param {number} [nResults=5]
 * @returns {Promise<string[]>} — relevant context snippets
 */
async function search(query, nResults = 5) {
  if (!initialized) return [];
  try {
    const results = [];

    for (const colName of [COLLECTION_NAMES.CONVERSATIONS, COLLECTION_NAMES.DOCUMENTS]) {
      const col = await getCollection(colName);
      const res = await col.query({ queryTexts: [query], nResults });
      if (res.documents?.[0]) {
        results.push(...res.documents[0].filter(Boolean));
      }
    }

    return results.slice(0, nResults);
  } catch (err) {
    console.warn('[RAG] Error en búsqueda semántica:', err.message);
    return [];
  }
}

/**
 * Build a RAG context string to inject into LLM prompts.
 * @param {string} query
 * @returns {Promise<string>}
 */
async function buildContext(query) {
  const snippets = await search(query, 4);
  if (snippets.length === 0) return '';
  return `\n\n[Memoria relevante del Señor Franz]\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function chunkText(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  init,
  saveConversation,
  saveDocument,
  search,
  buildContext,
};
