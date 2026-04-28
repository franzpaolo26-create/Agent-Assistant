/**
 * JARVIS OS — Gmail Integration
 * Read, summarize, and manage Gmail for Franz.
 * Routed via Gemini Flash (Tier 2) for cost efficiency.
 */

const { google }    = require('googleapis');
const { authorize } = require('../auth');

let _auth = null;
async function getAuth() {
  if (!_auth) _auth = await authorize();
  return _auth;
}
function getGmail(auth) { return google.gmail({ version: 'v1', auth }); }

// ── Decode ────────────────────────────────────────────────────────────────────
function decodeBase64(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return '';
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

// ── List unread emails ────────────────────────────────────────────────────────

/**
 * Get unread emails, newest first.
 * @param {number} [maxResults=10]
 * @param {string} [query]  Gmail search query (e.g. 'from:jefe@empresa.com')
 * @returns {Promise<object[]>}
 */
async function getUnread(maxResults = 10, query = 'is:unread') {
  const auth  = await getAuth();
  const gmail = getGmail(auth);

  const list = await gmail.users.messages.list({
    userId: 'me',
    q:      query,
    maxResults,
  });

  const messages = list.data.messages ?? [];
  if (messages.length === 0) return [];

  const full = await Promise.all(
    messages.map(m =>
      gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
        .then(r => r.data)
        .catch(() => null)
    )
  );

  return full.filter(Boolean).map(msg => {
    const headers = msg.payload?.headers ?? [];
    return {
      id:      msg.id,
      from:    getHeader(headers, 'from'),
      subject: getHeader(headers, 'subject'),
      date:    getHeader(headers, 'date'),
      snippet: msg.snippet ?? '',
      body:    extractBody(msg.payload).slice(0, 2000),
    };
  });
}

/**
 * Format unread emails as a WhatsApp-friendly digest.
 * @param {number} [limit=5]
 * @returns {Promise<string>}
 */
async function unreadDigest(limit = 5) {
  try {
    const emails = await getUnread(limit);
    if (emails.length === 0) {
      return '_Sin correos no leídos, Señor. La bandeja de entrada está limpia._';
    }

    const lines = emails.map((e, i) => {
      const date = new Date(e.date).toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
      return `${i + 1}. 📧 *${e.subject || '(sin asunto)'}*\n   De: ${e.from}\n   ${date}\n   _${e.snippet.slice(0, 100)}..._`;
    });

    return `📬 *${emails.length} correos no leídos:*\n\n${lines.join('\n\n')}`;
  } catch (err) {
    console.error('[Gmail] Error:', err.message);
    return `_Error al acceder a Gmail: ${err.message}_`;
  }
}

/**
 * Get emails from VIP senders only (P1 priority).
 * VIP list stored in env: GMAIL_VIP=boss@company.com,client@corp.com
 */
async function getVIPEmails() {
  const vips = (process.env.GMAIL_VIP ?? '').split(',').filter(Boolean);
  if (vips.length === 0) return [];

  const query = `is:unread (${vips.map(v => `from:${v}`).join(' OR ')})`;
  return getUnread(5, query);
}

/**
 * Mark an email as read.
 */
async function markRead(messageId) {
  const auth  = await getAuth();
  const gmail = getGmail(auth);
  await gmail.users.messages.modify({
    userId:      'me',
    id:          messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

/**
 * Search emails.
 * @param {string} query
 */
async function search(query, limit = 5) {
  const emails = await getUnread(limit, query);
  if (emails.length === 0) return `_Sin resultados para "${query}", Señor._`;

  const lines = emails.map((e, i) =>
    `${i + 1}. *${e.subject}* — ${e.from}\n   _${e.snippet.slice(0, 100)}_`
  );
  return `🔍 *Resultados para "${query}":*\n\n${lines.join('\n\n')}`;
}

module.exports = { getUnread, unreadDigest, getVIPEmails, markRead, search };
