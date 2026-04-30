# ═══════════════════════════════════════════════════════════════
#   JARVIS OS — Dockerfile
#   Base: Node.js 22 Slim + Chromium (puppeteer) + ffmpeg (audio)
# ═══════════════════════════════════════════════════════════════

FROM node:22-slim AS base

# ── System dependencies ──────────────────────────────────────
# Chromium  → whatsapp-web.js (puppeteer)
# ffmpeg    → audio conversion (.ogg → .wav for Whisper)
# curl      → health checks
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    ffmpeg \
    curl \
    fonts-liberation \
    fonts-noto-color-emoji \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use installed Chromium instead of downloading
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_BIN=/usr/bin/chromium \
    NODE_ENV=production

# ── App setup ────────────────────────────────────────────────
WORKDIR /app

# Install dependencies (layered for better caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Create data and logs directories
RUN mkdir -p data logs

# ── Health check endpoint (lightweight HTTP server) ──────────
# index.js includes a /health endpoint via express
EXPOSE 3000

# ── Non-root user for security ───────────────────────────────
RUN groupadd -r jarvis && useradd -r -g jarvis -G audio,video jarvis \
    && chown -R jarvis:jarvis /app
USER jarvis

# ── Entrypoint ───────────────────────────────────────────────
CMD ["node", "index.js"]
