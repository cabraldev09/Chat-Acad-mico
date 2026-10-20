#!/usr/bin/env bash
# Backup: the database (pg_dump) and the files of the volume (WhatsApp sessions, uploads). Runs every night from cron; ANY failure is loud:
#   - exit code != 0 (cron mails/logs it) and, when HEALTHCHECK_URL is set in .env, a "/fail" ping to the monitor;
#   - the database dump never depends on the file archive (one failing does not stop the other).
# Optional in .env:
#   BACKUP_PASSPHRASE   encrypts both files (openssl aes-256, the file gets the ".enc" suffix)
#   BACKUP_RCLONE_REMOTE  e.g. "r2:meu-bucket/chat-academico": copies the files out of the server (rclone must be installed and configured)
#   HEALTHCHECK_URL     e.g. https://hc-ping.com/<uuid>: pinged at the start, on success and on failure
#   PG_DUMP_IMAGE       image with a pg_dump at least as new as the database server (default postgres:17-alpine)
set -uo pipefail
umask 077
cd /opt/chat-academico/deploy/vps
mkdir -p /opt/backups

env_of() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }
PASSPHRASE=$(env_of BACKUP_PASSPHRASE)
REMOTE=$(env_of BACKUP_RCLONE_REMOTE)
PING=$(env_of HEALTHCHECK_URL)
IMAGE=$(env_of PG_DUMP_IMAGE); IMAGE=${IMAGE:-postgres:17-alpine}
KEEP_DAYS=${KEEP_DAYS:-14}

ping_monitor() { [ -n "$PING" ] && curl -fsS -m 10 --retry 2 "$PING$1" >/dev/null 2>&1 || true; }
ping_monitor "/start"

STAMP=$(date +%F-%H%M%S)
ARCHIVE="/opt/backups/dados-$STAMP.tar.gz"
DUMP="/opt/backups/banco-$STAMP.dump"
FAILED=0
trap 'rm -f "$ARCHIVE.partial" "$DUMP.partial"' EXIT

encrypt() { # stdin -> stdout
  if [ -n "$PASSPHRASE" ]; then openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE_ENV; else cat; fi
}
export BACKUP_PASSPHRASE_ENV="$PASSPHRASE"
SUFFIX=""; [ -n "$PASSPHRASE" ] && SUFFIX=".enc"

# 1) database: the URL is read from the container environment and goes by a pipe (never in the arguments, the log or the environment of the dump image)
if docker compose run --rm --no-deps -T --entrypoint node api -e 'if(!process.env.DATABASE_URL){process.exit(1)};process.stdout.write(process.env.DATABASE_URL+"\n")' 2>/dev/null |
  docker run --rm -i "$IMAGE" sh -c 'read -r u; pg_dump --dbname="$u" --format=custom --no-owner --no-acl' | encrypt > "$DUMP.partial" && test -s "$DUMP.partial"; then
  mv "$DUMP.partial" "$DUMP$SUFFIX"
  echo "$(date '+%F %T') banco: $(du -h "$DUMP$SUFFIX" | cut -f1)"
else
  echo "$(date '+%F %T') ERRO: o backup do banco falhou (confira a versão do pg_dump: imagem $IMAGE)" >&2
  FAILED=1
fi

# 2) files of the volume (skipped when only the database is wanted, e.g. before a migration)
if [ "${BACKUP_ONLY:-}" != "db" ]; then
if docker run --rm -v chat-academico-data:/data:ro alpine tar czf - -C /data --exclude='*/Cache' --exclude='*/Code Cache' --exclude='*/GPUCache' --exclude='*/Service Worker/CacheStorage' . | encrypt > "$ARCHIVE.partial" && test -s "$ARCHIVE.partial"; then
  mv "$ARCHIVE.partial" "$ARCHIVE$SUFFIX"
  echo "$(date '+%F %T') arquivos: $(du -h "$ARCHIVE$SUFFIX" | cut -f1)"
else
  echo "$(date '+%F %T') ERRO: o backup dos arquivos falhou" >&2
  FAILED=1
fi
fi

# 3) a copy outside this server (a disk that dies takes the local copy with it)
if [ -n "$REMOTE" ] && [ "$FAILED" = "0" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$DUMP$SUFFIX" "$REMOTE" --quiet && rclone copy "$ARCHIVE$SUFFIX" "$REMOTE" --quiet || { echo "$(date '+%F %T') ERRO: a cópia para $REMOTE falhou" >&2; FAILED=1; }
  else
    echo "$(date '+%F %T') AVISO: BACKUP_RCLONE_REMOTE definido, mas o rclone não está instalado" >&2
    FAILED=1
  fi
fi

# 4) old copies (kept KEEP_DAYS days; never removes the most recent ones when the backup failed today)
if [ "$FAILED" = "0" ]; then
  find /opt/backups -name 'dados-*' -mtime +"$KEEP_DAYS" -delete
  find /opt/backups -name 'banco-*' -mtime +"$KEEP_DAYS" -delete
fi

if [ "$FAILED" = "0" ]; then
  echo "$(date '+%F %T') backup concluído: arquivos e PostgreSQL."
  ping_monitor ""
  exit 0
fi
ping_monitor "/fail"
exit 1
