#!/usr/bin/env bash
# Backup automatico de Postgres -> local + DigitalOcean Spaces.
# Instalar en /opt/ppa/deploy/backup-db.sh y ejecutar por cron (ver README).
#
# Regla: un backup que vive solo en el mismo disco que la base de datos
# NO es un backup. Por eso sube a Spaces.

set -euo pipefail

ENV_FILE=/opt/ppa/backend/.env
BACKUP_DIR=/var/backups/ppa
LOG_TAG=ppa-backup

log() { logger -t "$LOG_TAG" "$1"; echo "[$(date -Is)] $1"; }
fail() { log "ERROR: $1"; exit 1; }

[ -f "$ENV_FILE" ] || fail "no existe $ENV_FILE"

# Cargar variables sin ejecutar el archivo
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL no definida}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
DUMP="$BACKUP_DIR/ppa-$STAMP.dump"

log "iniciando dump"
# -Fc = formato comprimido, restaurable con pg_restore
pg_dump "$DATABASE_URL" -Fc -f "$DUMP" || fail "pg_dump fallo"

# Un dump valido de esta app nunca pesa 0. Si pesa poco, algo salio mal.
SIZE=$(stat -c%s "$DUMP")
[ "$SIZE" -gt 1024 ] || fail "dump sospechosamente pequeno ($SIZE bytes)"
log "dump OK: $DUMP ($SIZE bytes)"

# Verificar que el dump se puede leer (detecta corrupcion silenciosa)
pg_restore --list "$DUMP" > /dev/null || fail "dump ilegible, posible corrupcion"
log "dump verificado"

# --- Subida a Spaces (opcional) ---
if [ -n "${SPACES_BUCKET:-}" ] && [ -n "${SPACES_KEY:-}" ]; then
    if ! command -v s3cmd > /dev/null; then
        log "AVISO: s3cmd no instalado, se omite subida remota"
    else
        log "subiendo a Spaces"
        s3cmd put "$DUMP" "s3://$SPACES_BUCKET/db/" \
            --host="${SPACES_ENDPOINT#https://}" \
            --host-bucket="%(bucket)s.${SPACES_ENDPOINT#https://}" \
            --access_key="$SPACES_KEY" \
            --secret_key="$SPACES_SECRET" \
            || fail "subida a Spaces fallo"
        log "subida OK"
    fi
else
    log "AVISO: Spaces no configurado, backup solo local (riesgo: muere con el droplet)"
fi

# --- Backup de archivos subidos (comprobantes, avatares) ---
UPLOADS_TAR="$BACKUP_DIR/uploads-$STAMP.tar.gz"
if [ -d /opt/ppa/backend/uploads ]; then
    tar czf "$UPLOADS_TAR" -C /opt/ppa/backend uploads
    log "uploads empaquetados: $UPLOADS_TAR"
    if [ -n "${SPACES_BUCKET:-}" ] && command -v s3cmd > /dev/null; then
        s3cmd put "$UPLOADS_TAR" "s3://$SPACES_BUCKET/uploads/" \
            --host="${SPACES_ENDPOINT#https://}" \
            --host-bucket="%(bucket)s.${SPACES_ENDPOINT#https://}" \
            --access_key="$SPACES_KEY" \
            --secret_key="$SPACES_SECRET" || log "AVISO: subida de uploads fallo"
    fi
fi

# --- Retencion local ---
find "$BACKUP_DIR" -name 'ppa-*.dump'      -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
log "retencion aplicada (${RETENTION_DAYS}d)"

# --- Ping de exito (para enterarte si el cron deja de correr) ---
if [ -n "${BACKUP_PING_URL:-}" ]; then
    curl -fsS -m 10 "$BACKUP_PING_URL" > /dev/null || log "AVISO: ping fallo"
fi

log "backup completado"
