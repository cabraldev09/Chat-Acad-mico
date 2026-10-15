#!/usr/bin/env bash
# Files and database are backed up together; cron must surface any failure.
set -euo pipefail
umask 077
cd /opt/chat-academico/deploy/vps
mkdir -p /opt/backups
STAMP=$(date +%F-%H%M%S)
ARCHIVE="/opt/backups/dados-$STAMP.tar.gz"
DUMP="/opt/backups/banco-$STAMP.dump"
trap 'rm -f "$ARCHIVE.partial" "$DUMP.partial"' EXIT
# Match the project's supported Postgres major. pg_dump is not included in the API image.
docker compose run --rm --no-deps -T --entrypoint node api -e '
 const {spawnSync}=require("child_process");
 if (!process.env.DATABASE_URL) { console.error("DATABASE_URL ausente; backup do banco não realizado."); process.exit(1); }
' >/dev/null
# Read credentials through the container environment, never print them into logs.
docker compose run --rm --no-deps -T --entrypoint node api -e 'process.stdout.write(process.env.DATABASE_URL + "\n")' |
  docker run --rm -i --env-file .env postgres:16-alpine sh -c 'read -r backup_database_url; pg_dump --dbname="$backup_database_url" --format=custom --no-owner --no-acl' > "$DUMP.partial"
test -s "$DUMP.partial"
docker run --rm -v chat-academico-data:/data:ro alpine tar czf - -C /data . > "$ARCHIVE.partial"
mv "$DUMP.partial" "$DUMP"
mv "$ARCHIVE.partial" "$ARCHIVE"
find /opt/backups -name 'dados-*.tar.gz' -mtime +7 -delete
find /opt/backups -name 'banco-*.dump' -mtime +7 -delete
echo "$(date '+%F %T') backup concluído: arquivos e PostgreSQL."
