#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#   JARVIS OS — VPS Deployment Script
#   Ubuntu 24.04 · Contabo Hub Europe · 6 vCores / 12GB RAM
#   Usage: bash deploy-vps.sh
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail
IFS=$'\n\t'

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

log()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}══ $1 ══${NC}\n"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}${BLUE}"
cat << 'EOF'
     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗     ██████╗ ███████╗
     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝    ██╔═══██╗██╔════╝
     ██║███████║██████╔╝██║   ██║██║███████╗    ██║   ██║███████╗
██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║    ██║   ██║╚════██║
╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║    ╚██████╔╝███████║
 ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝     ╚═════╝ ╚══════╝
         VPS Deployment Script — Contabo Hub Europe
EOF
echo -e "${NC}"

# ── Config ────────────────────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/franzpaolo26/Agent-Asistant.git}"
APP_DIR="${APP_DIR:-/opt/jarvis}"
GITHUB_USER="${GITHUB_USER:-franzpaolo26}"

# ── 1. System Update ──────────────────────────────────────────────────────────
step "PASO 1 — Actualización del Sistema"
apt-get update -qq && apt-get upgrade -y -qq
log "Sistema actualizado"

# ── 2. Install Docker ─────────────────────────────────────────────────────────
step "PASO 2 — Instalación de Docker"
if command -v docker &>/dev/null; then
  warn "Docker ya instalado ($(docker --version)). Omitiendo."
else
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  systemctl enable docker
  systemctl start docker
  log "Docker instalado: $(docker --version)"
fi

# Docker Compose plugin
if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin
fi
log "Docker Compose: $(docker compose version)"

# ── 3. Install Tailscale ──────────────────────────────────────────────────────
step "PASO 3 — Instalación de Tailscale (Red Zero-Trust)"
if command -v tailscale &>/dev/null; then
  warn "Tailscale ya instalado. Omitiendo."
else
  curl -fsSL https://tailscale.com/install.sh | sh
  log "Tailscale instalado"
fi

echo ""
warn "ACCIÓN REQUERIDA: Vincula el VPS a tu red Tailscale:"
echo -e "  ${YELLOW}tailscale up --ssh${NC}"
echo -e "  Luego autoriza en: ${CYAN}https://login.tailscale.com${NC}"
echo ""
read -p "¿Has autorizado el VPS en Tailscale? [s/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
  log "Tailscale vinculado"
else
  warn "Continúa sin Tailscale — puedes vincularlo después."
fi

# ── 4. Clone repository ───────────────────────────────────────────────────────
step "PASO 4 — Clonado del Repositorio"
if [ -d "$APP_DIR" ]; then
  warn "Directorio $APP_DIR ya existe. Actualizando..."
  cd "$APP_DIR" && git pull
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
  log "Repositorio clonado en $APP_DIR"
fi

# ── 5. Environment configuration ─────────────────────────────────────────────
step "PASO 5 — Configuración de Variables de Entorno"
if [ -f "$APP_DIR/.env" ]; then
  warn ".env ya existe. Omitiendo para no sobreescribir."
else
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  log ".env creado desde .env.example"
  echo ""
  echo -e "${YELLOW}ACCIÓN REQUERIDA — Edita el archivo .env:${NC}"
  echo -e "  ${CYAN}nano $APP_DIR/.env${NC}"
  echo ""
  echo "  Variables obligatorias:"
  echo "    GEMINI_API_KEY     → https://aistudio.google.com"
  echo "    ANTHROPIC_API_KEY  → https://console.anthropic.com"
  echo "    OWNER_NUMBER       → Tu número de WhatsApp (34XXXXXXXXX@c.us)"
  echo ""
  read -p "Presiona ENTER cuando hayas configurado el .env..." -r
fi

# ── 6. Launch Docker Stack ────────────────────────────────────────────────────
step "PASO 6 — Lanzamiento del Stack Docker"
cd "$APP_DIR"
docker compose pull
docker compose up -d
log "Stack Docker iniciado"

echo ""
echo "  Estado de los servicios:"
docker compose ps
echo ""

# Wait for Ollama to be ready
echo -n "  Esperando a Ollama"
for i in $(seq 1 30); do
  if docker exec jarvis-ollama ollama list &>/dev/null 2>&1; then
    echo ""
    log "Ollama listo"
    break
  fi
  echo -n "."
  sleep 2
done

# ── 7. Pull AI Models ─────────────────────────────────────────────────────────
step "PASO 7 — Descarga de Modelos de IA (Ollama)"
echo "  Descargando modelos locales... (esto puede tardar ~10 min)"
echo ""

# Main conversation model
echo -e "  ${CYAN}→ llama3.2 (modelo principal de conversación)${NC}"
docker exec jarvis-ollama ollama pull llama3.2

# Embedding model for RAG
echo -e "  ${CYAN}→ nomic-embed-text (embeddings para memoria RAG)${NC}"
docker exec jarvis-ollama ollama pull nomic-embed-text

log "Modelos descargados"
echo ""
echo "  Modelos disponibles:"
docker exec jarvis-ollama ollama list

# ── 8. Configure PM2 / systemd ────────────────────────────────────────────────
step "PASO 8 — Auto-restart en caso de Reinicio"
# Docker already handles restart: unless-stopped
# Add a systemd unit for docker compose
cat > /etc/systemd/system/jarvis.service << EOF
[Unit]
Description=JARVIS OS — AI Agent
Requires=docker.service
After=docker.service network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable jarvis
log "Servicio systemd configurado (auto-inicio)"

# ── 9. WhatsApp QR ────────────────────────────────────────────────────────────
step "PASO 9 — Escaneo del Código QR de WhatsApp"
echo ""
echo -e "${YELLOW}  ACCIÓN REQUERIDA:${NC}"
echo -e "  Abre WhatsApp en el teléfono del número EXTERNO de JARVIS"
echo -e "  Menú → Dispositivos vinculados → Vincular dispositivo"
echo ""
echo -e "  El QR aparecerá en los logs. Ejecútalo ahora:"
echo -e "  ${CYAN}docker logs -f jarvis-core${NC}"
echo ""

# ── 10. Final summary ─────────────────────────────────────────────────────────
step "✅ DESPLIEGUE COMPLETADO"
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║           JARVIS OS está en línea, Señor             ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  📋 Comandos útiles:"
echo -e "  ${CYAN}docker compose logs -f jarvis-core${NC}    → Ver logs en tiempo real"
echo -e "  ${CYAN}docker compose ps${NC}                     → Estado de servicios"
echo -e "  ${CYAN}docker compose restart jarvis-core${NC}    → Reiniciar JARVIS"
echo -e "  ${CYAN}docker compose down && docker compose up -d${NC} → Actualizar"
echo ""
echo "  💰 Recuerda: Presupuesto objetivo < 20€/mes"
echo "     Usa /coste en WhatsApp para monitorizar el gasto."
echo ""
