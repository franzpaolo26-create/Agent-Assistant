/**
 * JARVIS OS — Voice Processing Module
 * Transcription: WhatsApp .ogg audio → text (Whisper via Ollama or whisper.cpp)
 * TTS: text → .ogg voice note sent back via WhatsApp
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { exec } = require('../tools/shell');

const TMP_DIR = path.join(os.tmpdir(), 'jarvis_voice');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Whisper Transcription ─────────────────────────────────────────────────────

/**
 * Transcribe a WhatsApp .ogg audio buffer to text.
 * Pipeline: .ogg → ffmpeg → .wav → whisper → text
 *
 * @param {Buffer|string} audioData — raw binary Buffer or base64 string
 * @param {string} [mimeType]
 * @returns {Promise<string>} — transcribed text
 */
async function transcribe(audioData, mimeType = 'audio/ogg') {
  const id      = `voice_${Date.now()}`;
  const oggPath = path.join(TMP_DIR, `${id}.ogg`);
  const wavPath = path.join(TMP_DIR, `${id}.wav`);

  try {
    // 1. Write audio to disk
    const buffer = Buffer.isBuffer(audioData)
      ? audioData
      : Buffer.from(audioData, 'base64');
    fs.writeFileSync(oggPath, buffer);

    // 2. Convert .ogg → .wav with ffmpeg
    await exec(`ffmpeg -y -i "${oggPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`, {
      timeout: 30_000,
    });

    // 3. Transcribe — try Whisper via Ollama first, then whisper binary
    let text = '';

    const whisperStrategy = process.env.WHISPER_STRATEGY ?? 'auto';

    if (whisperStrategy === 'ollama' || whisperStrategy === 'auto') {
      text = await transcribeViaOllama(wavPath);
    }

    if (!text && (whisperStrategy === 'binary' || whisperStrategy === 'auto')) {
      text = await transcribeViaBinary(wavPath);
    }

    return text || '[No se pudo transcribir el audio, Señor]';

  } finally {
    // Cleanup temp files
    [oggPath, wavPath].forEach(f => { try { fs.unlinkSync(f); } catch {} });
  }
}

/**
 * Transcribe via Ollama (if running a whisper-compatible model like `whisper`).
 * Note: Ollama whisper support depends on the model being pulled.
 */
async function transcribeViaOllama(wavPath) {
  try {
    const axios  = require('axios');
    const base64 = fs.readFileSync(wavPath).toString('base64');

    const response = await axios.post(
      `${process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434'}/api/generate`,
      {
        model:  process.env.WHISPER_MODEL ?? 'whisper',
        prompt: '',
        images: [base64],
        stream: false,
      },
      { timeout: 60_000 }
    );

    return response.data?.response?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * Transcribe via whisper.cpp binary (installed on VPS/Docker).
 * Requires: `whisper` or `whisper-cpp` in PATH.
 */
async function transcribeViaBinary(wavPath) {
  try {
    const model  = process.env.WHISPER_MODEL_PATH ?? 'base';
    const result = await exec(
      `whisper "${wavPath}" --model ${model} --output-format txt --language es --output-dir "${TMP_DIR}"`,
      { timeout: 120_000 }
    );
    // Read .txt output
    const txtPath = wavPath.replace('.wav', '.txt');
    if (fs.existsSync(txtPath)) {
      const text = fs.readFileSync(txtPath, 'utf8').trim();
      fs.unlinkSync(txtPath);
      return text;
    }
    return result;
  } catch {
    return '';
  }
}

// ── TTS (Text-to-Speech) ──────────────────────────────────────────────────────

/**
 * Convert text to .ogg voice note using edge-tts or espeak.
 * Returns the path to the generated .ogg file.
 *
 * @param {string} text
 * @returns {Promise<string|null>} — path to .ogg file, or null on failure
 */
async function textToSpeech(text) {
  const id     = `tts_${Date.now()}`;
  const mp3Path = path.join(TMP_DIR, `${id}.mp3`);
  const oggPath = path.join(TMP_DIR, `${id}.ogg`);

  try {
    // Try edge-tts first (Microsoft, free, high quality)
    const edgeResult = await generateWithEdgeTTS(text, mp3Path);
    if (edgeResult) {
      // Convert mp3 → ogg for WhatsApp compatibility
      await exec(`ffmpeg -y -i "${mp3Path}" -c:a libopus "${oggPath}"`, { timeout: 30_000 });
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
      return oggPath;
    }

    // Fallback: espeak (robotic but always available)
    await exec(
      `espeak -v es -s 150 -w "${oggPath}" "${text.replace(/"/g, "'").slice(0, 500)}"`,
      { timeout: 15_000 }
    );
    return fs.existsSync(oggPath) ? oggPath : null;

  } catch (err) {
    console.warn('[Voice] TTS error:', err.message);
    [mp3Path, oggPath].forEach(f => { try { fs.unlinkSync(f); } catch {} });
    return null;
  }
}

async function generateWithEdgeTTS(text, outputPath) {
  try {
    const voice = process.env.TTS_VOICE ?? 'es-ES-AlvaroNeural'; // Male Spanish voice
    await exec(
      `edge-tts --voice "${voice}" --text "${text.replace(/"/g, "'").slice(0, 500)}" --write-media "${outputPath}"`,
      { timeout: 30_000 }
    );
    return fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

/**
 * Should JARVIS respond with voice (based on user preference)?
 */
function shouldRespondWithVoice(message) {
  const voiceTriggers = [/respóndeme con voz|reply with voice|audio por favor/i];
  return voiceTriggers.some(rx => rx.test(message));
}

module.exports = { transcribe, textToSpeech, shouldRespondWithVoice };
