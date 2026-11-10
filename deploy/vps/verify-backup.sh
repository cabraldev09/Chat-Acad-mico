#!/usr/bin/env bash
# Restore an existing dump into a disposable, network-isolated PostgreSQL; production is untouched.
set -euo pipefail
umask 077
cd /opt/chat-academico/deploy/vps
SEARCH_ROOT=/opt/backups
if [ "${1:-}" = "--offsite" ]; then
  if [ -f .backup.env ]; then
    bash ./offsite.sh restore
    SEARCH_ROOT=/opt/backups/restored-offsite/backups
  else
    echo 'Backup externo não configurado; verificação somente local.' >&2
  fi
  shift
fi
DUMP=${1:-}
if [ -z "$DUMP" ]; then DUMP=$(find "$SEARCH_ROOT" -maxdepth 1 \( -name 'banco-*.dump' -o -name 'banco-*.dump.enc' \) -type f | sort | tail -n 1); fi
if [ -z "$DUMP" ] || [ ! -s "$DUMP" ]; then echo 'Backup de banco não encontrado.' >&2; exit 1; fi
ENCRYPTED=false
RESTORE_DUMP="$DUMP"
if [[ "$DUMP" = *.enc ]]; then
  ENCRYPTED=true
  export BACKUP_PASSPHRASE_ENV=$(grep -E '^BACKUP_PASSPHRASE=' .env | head -1 | cut -d= -f2- | tr -d '\"')
  RESTORE_DUMP=$(mktemp /opt/backups/.restore-check-XXXXXX)
  openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE_ENV -in "$DUMP" -out "$RESTORE_DUMP"
fi
ARCHIVE=$(find "$SEARCH_ROOT" -maxdepth 1 -type f \( -name 'dados-*.tar.gz' -o -name 'dados-*.tar.gz.enc' \) | sort | tail -n 1)
if [ -z "$ARCHIVE" ] || [ ! -s "$ARCHIVE" ]; then echo 'Arquivo de mídias não encontrado.' >&2; exit 1; fi
PG_MAJOR=17
DUMP_BASE=${DUMP%.enc}
if [ -f "${DUMP_BASE%.dump}.major" ]; then PG_MAJOR=$(cat "${DUMP_BASE%.dump}.major"); fi
case "$PG_MAJOR" in ''|*[!0-9]*) echo 'Versão de backup inválida.' >&2; exit 1 ;; esac
CHECK_CONTAINER="chat-restore-check-$(date +%s)-$$"
cleanup() { docker stop "$CHECK_CONTAINER" >/dev/null 2>&1 || true; if [ "$ENCRYPTED" = true ]; then rm -f "$RESTORE_DUMP"; fi; }
trap cleanup EXIT
# --network none prevents the restored data from being reached over TCP.
docker run --rm -d --network none --name "$CHECK_CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restore_check "postgres:$PG_MAJOR-alpine" >/dev/null
ready=false
for attempt in $(seq 1 40); do
  if docker exec "$CHECK_CONTAINER" pg_isready -U postgres -d restore_check >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'PostgreSQL de teste não iniciou.' >&2; exit 1; fi
docker exec -i "$CHECK_CONTAINER" pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl -U postgres -d restore_check < "$RESTORE_DUMP"
docker exec "$CHECK_CONTAINER" psql -X -U postgres -d restore_check -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS leads FROM "Leads"; SELECT COUNT(*) AS mensagens FROM "Messages";'
# A full decompression detects truncated/corrupt archives without exposing files on the host.
if [[ "$ARCHIVE" = *.enc ]]; then
  export BACKUP_PASSPHRASE_ENV=$(grep -E '^BACKUP_PASSPHRASE=' .env | head -1 | cut -d= -f2- | tr -d '\"')
  openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE_ENV -in "$ARCHIVE" | docker run --rm -i alpine:3.22 tar tzf - >/dev/null
else
  docker run --rm -i alpine:3.22 tar tzf - < "$ARCHIVE" >/dev/null
fi
printf '%s restauração isolada verificada: banco e integridade do arquivo de mídias.\n' "$(date '+%F %T')"
