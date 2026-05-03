#!/usr/bin/env bash
# =============================================================================
# GeoAnalytics — Deploy Script
# Uso: bash deploy.sh [--rollback]
#
# Uso:
#   bash deploy.sh            — deploy normal
#   bash deploy.sh --rollback — reverte para o commit anterior
#   bash deploy.sh --force    — força rebuild mesmo sem mudanças
#   bash deploy.sh --clean    — limpa VPS sem fazer deploy
#
# O que o deploy FAZ:
#   - git pull (branch main)
#   - rebuild apenas backend e frontend
#   - preserva postgis e geoserver (dados nunca são apagados)
#   - cria backup do .env antes de qualquer coisa
#   - limpa containers/imagens/volumes/cache Docker após subir
#   - exibe espaço livre em disco no final
#
# O que NÃO faz:
#   - NÃO apaga volumes nomeados do banco (postgis_data, geoserver_data)
#   - NÃO derruba postgis/geoserver
#   - NÃO usa --force nem --no-verify
# =============================================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BACKUP_DIR="$APP_DIR/.deploy_backups"

# ── Cores ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[deploy]${NC} $*" | tee -a "$LOG_FILE"; }
ok()   { echo -e "${GREEN}[ok]${NC}    $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[erro]${NC}  $*" | tee -a "$LOG_FILE"; }

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"
echo "" >> "$LOG_FILE"
log "========== Deploy iniciado em $TIMESTAMP =========="

# ── Rollback ───────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--rollback" ]]; then
    warn "Modo ROLLBACK ativado"
    PREV_COMMIT=$(cat "$BACKUP_DIR/last_commit" 2>/dev/null || echo "")
    if [[ -z "$PREV_COMMIT" ]]; then
        err "Nenhum commit anterior registrado em $BACKUP_DIR/last_commit"
        exit 1
    fi
    log "Voltando para commit: $PREV_COMMIT"
    git checkout "$PREV_COMMIT" -- backend/ frontend/
    docker compose up -d --build --no-deps backend frontend
    ok "Rollback concluído para $PREV_COMMIT"
    exit 0
fi

# ── Limpeza isolada (sem deploy) ───────────────────────────────────────────────
if [[ "${1:-}" == "--clean" ]]; then
    warn "Modo LIMPEZA ISOLADA ativado (sem deploy)"
    docker container prune -f
    docker image prune -a -f
    docker volume prune -f
    docker network prune -f
    docker builder prune -f
    DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')
    ok "Limpeza concluída. Espaço livre: $DISK_FREE"
    exit 0
fi

# ── Backup do .env ─────────────────────────────────────────────────────────────
if [[ -f ".env" ]]; then
    cp .env "$BACKUP_DIR/.env.bak.$(date '+%Y%m%d_%H%M%S')"
    ok "Backup do .env salvo em $BACKUP_DIR"
fi

# ── Registra commit atual (para rollback) ──────────────────────────────────────
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "$CURRENT_COMMIT" > "$BACKUP_DIR/last_commit"
log "Commit atual registrado: $CURRENT_COMMIT"

# ── Git pull ───────────────────────────────────────────────────────────────────
log "Buscando atualizações do repositório..."
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [[ "$LOCAL" == "$REMOTE" ]]; then
    warn "Nada de novo no repositório. Deploy abortado (use --force para forçar)."
    if [[ "${1:-}" != "--force" ]]; then
        exit 0
    fi
fi

git pull origin main
NEW_COMMIT=$(git rev-parse HEAD)
ok "Atualizado para commit: $NEW_COMMIT"

# ── Verifica containers de dados ───────────────────────────────────────────────
log "Verificando containers de dados (postgis, geoserver)..."
for SVC in postgis geoserver; do
    STATUS=$(docker compose ps "$SVC" --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('State','?'))" 2>/dev/null || echo "unknown")
    log "  $SVC: $STATUS"
done

# ── Rebuild backend e frontend ─────────────────────────────────────────────────
log "Rebuilding backend e frontend (postgis/geoserver não são afetados)..."
docker compose build --pull backend frontend
ok "Build concluído"

log "Subindo containers atualizados..."
docker compose up -d --no-deps backend frontend
ok "Containers backend e frontend reiniciados"

# ── Health check ───────────────────────────────────────────────────────────────
log "Aguardando backend ficar saudável..."
MAX_TRIES=20
WAIT=3
for i in $(seq 1 $MAX_TRIES); do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || echo "000")
    if [[ "$HTTP" == "200" ]]; then
        ok "Backend respondendo (HTTP $HTTP) após ${i}x${WAIT}s"
        break
    fi
    if [[ $i -eq $MAX_TRIES ]]; then
        err "Backend não respondeu após $((MAX_TRIES * WAIT))s (HTTP $HTTP)"
        err "Verifique os logs: docker compose logs --tail=50 backend"
        exit 1
    fi
    sleep $WAIT
done

# ── Logs resumidos ─────────────────────────────────────────────────────────────
log "Últimas linhas de log do backend:"
docker compose logs --tail=20 backend 2>&1 | tee -a "$LOG_FILE"

# ── Limpeza da VPS ────────────────────────────────────────────────────────────
log "Iniciando limpeza da VPS..."

# Containers parados (exceto os do projeto)
log "  Removendo containers parados..."
docker container prune -f >> "$LOG_FILE" 2>&1

# Imagens sem tag e camadas intermediárias (build cache)
log "  Removendo imagens não utilizadas..."
docker image prune -a -f >> "$LOG_FILE" 2>&1

# Volumes anônimos não ligados a nenhum container
# ATENÇÃO: volumes nomeados (postgis_data, geoserver_data) são preservados
log "  Removendo volumes anônimos não utilizados..."
docker volume prune -f >> "$LOG_FILE" 2>&1

# Redes não utilizadas
log "  Removendo redes não utilizadas..."
docker network prune -f >> "$LOG_FILE" 2>&1

# Build cache do Docker BuildKit
log "  Limpando build cache..."
docker builder prune -f >> "$LOG_FILE" 2>&1

# Logs de deploy antigos (mantém últimos 10)
log "  Rotacionando backups de .env antigos (mantém últimos 10)..."
ls -t "$BACKUP_DIR"/.env.bak.* 2>/dev/null | tail -n +11 | xargs -r rm -f

# Espaço em disco após limpeza
DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')
log "  Espaço livre em disco após limpeza: $DISK_FREE"
ok "Limpeza da VPS concluída"

ok "========== Deploy finalizado em $(date '+%Y-%m-%d %H:%M:%S') =========="
log "Commit deployado: $NEW_COMMIT"
