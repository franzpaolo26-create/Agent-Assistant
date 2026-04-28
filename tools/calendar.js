/**
 * JARVIS OS — Google Calendar & Tasks Integration
 * Read upcoming events, create reminders, manage task list.
 * Routed via Gemini Flash (Tier 2).
 */

const { google }    = require('googleapis');
const { authorize } = require('../auth');

let _auth = null;
async function getAuth() {
  if (!_auth) _auth = await authorize();
  return _auth;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

/**
 * Get upcoming events from Google Calendar.
 * @param {number} [days=7]      — look-ahead window
 * @param {number} [maxResults=10]
 * @returns {Promise<string>} — WhatsApp-formatted agenda
 */
async function getAgenda(days = 7, maxResults = 10) {
  try {
    const auth     = await getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const now     = new Date();
    const future  = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      now.toISOString(),
      timeMax:      future.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy:      'startTime',
    });

    const events = res.data.items ?? [];
    if (events.length === 0) {
      return `_Agenda libre durante los próximos ${days} días, Señor._`;
    }

    const lines = events.map(evt => {
      const start = evt.start.dateTime ?? evt.start.date;
      const dt    = new Date(start);
      const isAllDay = !evt.start.dateTime;

      const dateStr = dt.toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      const timeStr = isAllDay
        ? 'Todo el día'
        : dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      return `📅 *${evt.summary ?? '(sin título)'}*\n   ${dateStr} · ${timeStr}${evt.location ? `\n   📍 ${evt.location}` : ''}`;
    });

    return `🗓️ *Agenda — próximos ${days} días:*\n\n${lines.join('\n\n')}`;
  } catch (err) {
    console.error('[Calendar] Error:', err.message);
    return `_Error al acceder al calendario: ${err.message}_`;
  }
}

/**
 * Get events happening TODAY.
 */
async function getTodayEvents() {
  try {
    const auth     = await getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      startOfDay.toISOString(),
      timeMax:      endOfDay.toISOString(),
      maxResults:   15,
      singleEvents: true,
      orderBy:      'startTime',
    });

    return res.data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Create a calendar event.
 */
async function createEvent({ title, date, time, duration = 60, description = '' }) {
  try {
    const auth     = await getAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const startDt = new Date(`${date}T${time ?? '09:00'}:00`);
    const endDt   = new Date(startDt.getTime() + duration * 60 * 1000);

    const res = await calendar.events.insert({
      calendarId:  'primary',
      requestBody: {
        summary:     title,
        description,
        start: { dateTime: startDt.toISOString(), timeZone: 'Europe/Madrid' },
        end:   { dateTime: endDt.toISOString(),   timeZone: 'Europe/Madrid' },
      },
    });

    const link = res.data.htmlLink;
    return `✅ *"${title}"* añadido al calendario.\n🔗 ${link}`;
  } catch (err) {
    return `_Error al crear evento: ${err.message}_`;
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/**
 * Get pending Google Tasks.
 * @param {number} [limit=10]
 * @returns {Promise<string>}
 */
async function getPendingTasks(limit = 10) {
  try {
    const auth  = await getAuth();
    const tasks = google.tasks({ version: 'v1', auth });

    // Get the primary task list
    const lists = await tasks.tasklists.list({ maxResults: 1 });
    const listId = lists.data.items?.[0]?.id;
    if (!listId) return '_Sin listas de tareas, Señor._';

    const res = await tasks.tasks.list({
      tasklist:      listId,
      showCompleted: false,
      maxResults:    limit,
    });

    const items = res.data.items ?? [];
    if (items.length === 0) return '_Lista de tareas vacía, Señor._';

    const lines = items.map((t, i) => {
      const due = t.due ? `— ⏰ ${new Date(t.due).toLocaleDateString('es-ES')}` : '';
      return `${i + 1}. ☐ *${t.title}* ${due}`;
    });

    return `✅ *Tareas pendientes (${items.length}):*\n\n${lines.join('\n')}`;
  } catch (err) {
    console.error('[Tasks] Error:', err.message);
    return `_Error al acceder a Tasks: ${err.message}_`;
  }
}

/**
 * Add a task to Google Tasks.
 */
async function addTask(title, dueDate = null) {
  try {
    const auth  = await getAuth();
    const tasks = google.tasks({ version: 'v1', auth });

    const lists  = await tasks.tasklists.list({ maxResults: 1 });
    const listId = lists.data.items?.[0]?.id;
    if (!listId) throw new Error('No task list found');

    const body = { title };
    if (dueDate) body.due = new Date(dueDate).toISOString();

    await tasks.tasks.insert({ tasklist: listId, requestBody: body });
    return `✅ Tarea *"${title}"* añadida${dueDate ? ` para el ${dueDate}` : ''}.`;
  } catch (err) {
    return `_Error al añadir tarea: ${err.message}_`;
  }
}

module.exports = { getAgenda, getTodayEvents, createEvent, getPendingTasks, addTask };
