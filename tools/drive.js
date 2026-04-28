/**
 * JARVIS OS — Google Drive Tool (refactored)
 * List, search, and summarize files from Franz's 2TB Drive.
 * Routed through Gemini (Tier 2) for document processing.
 */

const { google }  = require('googleapis');
const { authorize } = require('../auth');

let _auth = null;

async function getAuth() {
  if (!_auth) _auth = await authorize();
  return _auth;
}

function getDrive(auth) {
  return google.drive({ version: 'v3', auth });
}

// ── List files ────────────────────────────────────────────────────────────────

/**
 * List recent files in Drive.
 * @param {string|null} [query] — search query (e.g. 'presupuesto 2024')
 * @param {number}      [limit=15]
 * @returns {Promise<string>} — formatted list for WhatsApp
 */
async function listFiles(query = null, limit = 15) {
  try {
    const auth  = await getAuth();
    const drive = getDrive(auth);

    const q = query
      ? `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`
      : 'trashed = false';

    const res = await drive.files.list({
      q,
      pageSize: limit,
      orderBy:  'modifiedTime desc',
      fields:   'files(id, name, mimeType, modifiedTime, size, webViewLink)',
    });

    const files = res.data.files ?? [];
    if (files.length === 0) {
      return query
        ? `_No encontré archivos que coincidan con "${query}", Señor._`
        : '_Su Drive parece vacío, Señor. Inusual._';
    }

    const icon = mimeType => {
      if (mimeType.includes('folder'))       return '📁';
      if (mimeType.includes('spreadsheet'))  return '📊';
      if (mimeType.includes('document'))     return '📄';
      if (mimeType.includes('presentation')) return '📑';
      if (mimeType.includes('pdf'))          return '📕';
      if (mimeType.includes('image'))        return '🖼️';
      if (mimeType.includes('video'))        return '🎬';
      if (mimeType.includes('audio'))        return '🎵';
      return '📎';
    };

    const header = query
      ? `🔍 *Resultados para "${query}":*\n`
      : `📂 *Archivos recientes en Drive:*\n`;

    const lines = files.map((f, i) => {
      const date = new Date(f.modifiedTime).toLocaleDateString('es-ES');
      return `${i + 1}. ${icon(f.mimeType)} *${f.name}*\n   _${date}_`;
    });

    return header + lines.join('\n\n');

  } catch (err) {
    console.error('[Drive] Error:', err.message);
    return `_Error al acceder a Drive: ${err.message}_`;
  }
}

/**
 * Get a shareable link for a file by name.
 */
async function getFileLink(fileName) {
  try {
    const auth  = await getAuth();
    const drive = getDrive(auth);

    const res = await drive.files.list({
      q:          `name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize:   1,
      fields:     'files(id, name, webViewLink)',
    });

    const file = res.data.files?.[0];
    if (!file) return `_No encontré un archivo llamado "${fileName}", Señor._`;
    return `📎 *${file.name}*\n${file.webViewLink}`;
  } catch (err) {
    return `_Error: ${err.message}_`;
  }
}

/**
 * Upload a file to Drive.
 * @param {string} fileName
 * @param {string} mimeType
 * @param {Buffer|string} content
 */
async function uploadFile(fileName, mimeType, content) {
  try {
    const auth  = await getAuth();
    const drive = getDrive(auth);

    const res = await drive.files.create({
      requestBody: { name: fileName },
      media:       { mimeType, body: content },
      fields:      'id, name, webViewLink',
    });

    return `✅ *${res.data.name}* subido correctamente.\n${res.data.webViewLink}`;
  } catch (err) {
    return `_Error al subir archivo: ${err.message}_`;
  }
}

module.exports = { listFiles, getFileLink, uploadFile };
