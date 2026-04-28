<div align="center">

# 🤖 JARVIS OS
### Personal AGI Agent — Multi-Model Orchestration System

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Claude](https://img.shields.io/badge/Claude-3.5_Sonnet-CC785C?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)
[![Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/gemini)
[![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-black?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.ai)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Channel-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://whatsapp.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

> *"Your own JARVIS. Always on. Costs less than a coffee per month."*

**A production-grade, autonomous AI agent running 24/7 on a VPS. Uses WhatsApp as its CLI. Routes every task to the cheapest LLM that can solve it.**

</div>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      VPS (Contabo · 6 vCores · 12GB RAM)               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  OPENCLAW ORCHESTRATOR (ReAct)                   │   │
│  │          Reason → Route → Act → Observe → Respond                │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│       ┌──────────────────────┼──────────────────────┐                  │
│       ▼                      ▼                      ▼                  │
│  ┌─────────┐         ┌─────────────┐       ┌──────────────┐           │
│  │ Ollama  │         │   Gemini    │       │    Claude    │           │
│  │ Tier 0/1│         │   Tier 2   │       │    Tier 3    │           │
│  │  FREE   │         │  ~$0/mo    │       │  Sparingly   │           │
│  └─────────┘         └─────────────┘       └──────────────┘           │
│       │                      │                      │                   │
│  ┌────┴──────────────────────┴──────────────────────┴──────────────┐   │
│  │                    CORE MODULES                                   │   │
│  │  🧠 RAG Memory (ChromaDB)  │  📊 Triage P0→P3  │  🎤 Voice      │   │
│  │  💾 SQLite + Cost Tracking │  📧 Gmail/Calendar │  🐚 Shell      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────┘
                                        │
                              ┌─────────┴─────────┐
                              │   TAILSCALE VPN    │  Zero-Trust Mesh
                              └─────────┬─────────┘
                          ┌─────────────┴─────────────┐
                          │                             │
                 ┌────────┴────────┐         ┌────────┴────────┐
                 │  Franz's PC     │         │  Mobile / IoT   │
                 │  (Home Network) │         │  (Any Device)   │
                 └─────────────────┘         └─────────────────┘
```

## 💰 FinOps — Cost Routing Matrix

| Tier | Engine | When | Monthly Cost |
|------|--------|------|-------------|
| 🟢 **0/1** | Ollama (Local) | Greetings, simple Q&A, system tasks, alerts | **$0** |
| 🔵 **2** | Gemini 2.0 Flash | Documents, images, Gmail, Calendar, Drive | **~$0.50** |
| 🔴 **3** | Claude 3.5 Sonnet | Complex code, architecture, deep reasoning | **< $5** |

> **Target: < 20€/month.** Claude is invoked only when Ollama + Gemini can't handle it.

---

## ✨ Features

### 🤖 Autonomous Agent
- **ReAct Architecture** — Reason, Act, Observe loop for complex tasks
- **Priority Triage** — P0 (Critical) → P3 (Low) classification before acting
- **Proactive Heartbeat** — Daily briefings at 09:00, health monitoring every 30min
- **Nocturnal Queue** — Low-priority tasks executed during off-hours automatically

### 🧠 Memory & Context
- **Long-term RAG Memory** — ChromaDB vector database with Ollama embeddings
- **Short-term SQLite** — Conversation history, preferences, cost logs
- **Semantic Search** — `/memoria <query>` retrieves relevant past context

### 🎤 Multimodal
- **Voice Notes** — Transcribes WhatsApp `.ogg` audio via Whisper (local)
- **Images & Documents** — Processed via Gemini's vision capabilities
- **TTS Responses** — Can reply as voice notes (edge-tts)

### 🌐 Google Workspace
- **Gmail** — Unread digest, VIP alerts, search (`/gmail`)
- **Google Drive (2TB)** — List, search, get links (`/drive`)
- **Calendar** — Upcoming agenda, create events (`/agenda`)
- **Tasks** — Pending tasks, add new ones (`/tareas`)

### 🔐 Zero-Trust Security
- **Strict OWNER_NUMBER filter** — Deaf to all other numbers
- **Tailscale mesh** — Encrypted private network for home devices
- **Shell safety** — Command blocklist + `SHELL_UNRESTRICTED` flag
- **Never leaks secrets** — `.gitignore` protects all credentials

---

## 🚀 Quick Deploy (VPS)

```bash
# 1. Clone on VPS
git clone https://github.com/YOUR_USERNAME/Agent-Asistant.git jarvis
cd jarvis

# 2. Configure environment
cp .env.example .env
nano .env  # Fill in your API keys

# 3. Launch full stack
docker compose up -d

# 4. Pull AI models
docker exec jarvis-ollama ollama pull llama3.2
docker exec jarvis-ollama ollama pull nomic-embed-text

# 5. Scan WhatsApp QR
docker logs -f jarvis-core
```

---

## 📁 Project Structure

```
jarvis-os/
├── core/
│   ├── router.js        # OpenClaw orchestrator — routes to right LLM
│   ├── brain.js         # Unified LLM interface (Ollama/Gemini/Claude)
│   ├── memory.js        # SQLite: conversations, costs, preferences
│   ├── rag.js           # ChromaDB vector memory + semantic search
│   ├── triage.js        # Priority matrix P0→P3
│   └── proactive.js     # Cron: briefings, health checks, backups
│
├── channels/
│   └── whatsapp.js      # Zero-Trust WhatsApp channel
│
├── tools/
│   ├── drive.js         # Google Drive (2TB)
│   ├── gmail.js         # Gmail integration
│   ├── calendar.js      # Calendar + Tasks
│   ├── voice.js         # Whisper transcription + TTS
│   └── shell.js         # Tailscale remote shell
│
├── docker-compose.yml   # Stack: jarvis + ollama + chromadb
├── Dockerfile           # Node 22 + Chromium + ffmpeg
└── .env.example         # All required variables documented
```

---

## 📋 WhatsApp Commands

| Command | Description |
|---------|-------------|
| `/drive [query]` | Search Google Drive (2TB) |
| `/gmail` | Unread email digest |
| `/agenda [days]` | Upcoming calendar events |
| `/tareas` | Pending Google Tasks |
| `/shell <cmd>` | Execute on VPS server |
| `/status` | System health + AI costs |
| `/coste` | Monthly spend summary |
| `/memoria <query>` | Semantic search in long-term memory |
| `/help` | Full command list |
| *(any text)* | Natural language to correct LLM tier |

---

## 🔧 Environment Variables

See [`.env.example`](.env.example) for full documentation.

Key variables:
```bash
GEMINI_API_KEY=        # Google AI Studio
ANTHROPIC_API_KEY=     # Anthropic Console
OWNER_NUMBER=          # Your WhatsApp number (34XXXXXXXXX@c.us)
GMAIL_VIP=             # Comma-separated VIP senders for P1 alerts
```

---

## 📊 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 |
| Containerization | Docker + Compose |
| WhatsApp | whatsapp-web.js |
| Local LLM | Ollama (Llama 3.2, Qwen) |
| Cloud AI | Gemini 2.0 Flash + Claude 3.5 Sonnet |
| Vector DB | ChromaDB |
| Embeddings | Ollama nomic-embed-text |
| Persistence | SQLite (better-sqlite3) |
| Scheduler | node-cron |
| Audio | Whisper + edge-tts + ffmpeg |
| VPN | Tailscale (Zero-Trust) |
| Google APIs | Drive v3, Gmail v1, Calendar v3, Tasks v1 |

---

## 🛡️ Security

- ✅ All credentials via environment variables
- ✅ `.env`, `credentials.json`, `token.json` in `.gitignore`
- ✅ WhatsApp Zero-Trust: only OWNER_NUMBER processed
- ✅ Shell command blocklist (no `rm -rf`, `mkfs`, etc.)
- ✅ Non-root Docker user
- ✅ Tailscale encrypted mesh for home network

---

<div align="center">

*Built with precision for Franz. Inspired by Tony Stark's JARVIS.*

</div>
