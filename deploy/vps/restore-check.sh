#!/usr/bin/env bash
# Proves that the backup can be restored: takes the newest database dump of /opt/backups (or the file given as the first argument), restores it
# into a throwaway Postgres container and compares a few tables with what was dumped. It NEVER touches the real database; the container
# is removed at the end. Run it by hand after changing the backup, and once a month (cron) to know the copy is good before it is needed:
#   0 4 1 * *  /opt/chat-academico/deploy/vps/restore-check.sh >> /var/log/chat-academico-restore.log 2>&1
# To really restore after a disaster, see docs/BANCO-DE-DADOS.md ("Restaurar").
set -uo pipefail
cd /opt/chat-academico/deploy/vps 2>/dev/null || true

env_of() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }
PASSPHRASE=$(env_of BACKUP_PASSPHRASE)
IMAGE=$(env_of PG_DUMP_IMAGE); IMAGE=${IMAGE:-postgres:17-alpine}
PING=$(env_of HEALTHCHECK_URL)
ping_monitor() { [ -n "$PING" ] && curl -fsS -m 10 --retry 2 "$PING$1" >/dev/null 2>&1 || true; }

FILE=${1:-$(ls -1t /opt/backups/banco-*.dump* 2>/dev/null | head -1)}
if [ -z "$FILE" ] || [ ! -s "$FILE" ]; then echo "$(date '+%F %T') ERRO: nenhum backup do banco encontrado em /opt/backups" >&2; ping_monitor "/fail"; exit 1; fi
echo "$(date '+%F %T') testando a restauração de $FILE ($(du -h "$FILE" | cut -f1))"

NAME="restore-check-$$"
WORK=$(mktemp -d); trap 'docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$WORK"' EXIT
if [[ "$FILE" == *.enc ]]; then
  [ -n "$PASSPHRASE" ] || { echo "ERRO: o backup é criptografado e BACKUP_PASSPHRASE não está no .env" >&2; ping_monitor "/fail"; exit 1; }
  BACKUP_PASSPHRASE_ENV="$PASSPHRASE" openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE_ENV -in "$FILE" -out "$WORK/db.dump" || { echo "ERRO: não foi possível abrir o backup (senha errada?)" >&2; ping_monitor "/fail"; exit 1; }
else
  cp "$FILE" "$WORK/db.dump"
fi

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=check -e POSTGRES_DB=check "$IMAGE" >/dev/null || { echo "ERRO: não foi possível iniciar o Postgres de teste" >&2; ping_monitor "/fail"; exit 1; }
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres -d check >/dev/null 2>&1 && break; sleep 1; done
docker cp "$WORK/db.dump" "$NAME:/tmp/db.dump"
# warnings about roles and extensions that do not exist in the test server are normal; what matters is that the data comes back
docker exec "$NAME" pg_restore --no-owner --no-acl --exit-on-error -U postgres -d check /tmp/db.dump 2>"$WORK/restore.err" || {
  if grep -qiE "error" "$WORK/restore.err"; then echo "ERRO ao restaurar:" >&2; head -5 "$WORK/restore.err" >&2; ping_monitor "/fail"; exit 1; fi
}

q() { docker exec "$NAME" psql -U postgres -d check -Atc "$1" 2>/dev/null; }
TABLES=$(q "select count(*) from information_schema.tables where table_schema='public'")
USERS=$(q 'select count(*) from "Users"')
CONTACTS=$(q 'select count(*) from "Contacts"')
MESSAGES=$(q 'select count(*) from "Messages"')
LEADS=$(q 'select count(*) from "Leads"')
echo "$(date '+%F %T') restaurado: $TABLES tabelas · $USERS usuários · $CONTACTS contatos · $MESSAGES mensagens · $LEADS leads"
if [ -z "$USERS" ] || [ "${USERS:-0}" -lt 1 ] || [ "${TABLES:-0}" -lt 20 ]; then
  echo "ERRO: o banco restaurado está vazio ou incompleto" >&2; ping_monitor "/fail"; exit 1
fi
echo "$(date '+%F %T') OK: o backup restaura e tem dados"
ping_monitor ""
