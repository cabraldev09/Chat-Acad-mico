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
# Match the server major, including Supabase projects upgraded independently of the API.
PG_MAJOR=$(docker compose run --rm --no-deps -T --entrypoint node api -e '
 const {Client}=require("pg");
 const raw=require("./dist/config/database"); const cfg={...raw,...raw.lock};
 const c=new Client({host:cfg.host,port:cfg.port||5432,user:cfg.username,password:cfg.password,database:cfg.database,ssl:cfg.dialectOptions?.ssl,connectionTimeoutMillis:10000});
 (async()=>{await c.connect();const r=await c.query("SHOW server_version_num");process.stdout.write(String(Math.floor(Number(r.rows[0].server_version_num)/10000)));await c.end()})().catch(()=>{console.error("Não foi possível identificar a versão do banco para o backup.");process.exit(1)});
')
case "$PG_MAJOR" in ''|*[!0-9]*) echo 'Versão PostgreSQL inválida.' >&2; exit 1 ;; esac
# Read credentials through the container environment, never print them into logs.
docker compose run --rm --no-deps -T --entrypoint node api -e 'process.stdout.write(process.env.DATABASE_URL + "\n")' |
  docker run --rm -i --env-file .env "postgres:$PG_MAJOR-alpine" sh -c 'read -r backup_database_url; pg_dump --dbname="$backup_database_url" --format=custom --schema=public --no-owner --no-acl' > "$DUMP.partial"
test -s "$DUMP.partial"
docker run --rm -v chat-academico-data:/data:ro alpine tar czf - -C /data . > "$ARCHIVE.partial"
mv "$DUMP.partial" "$DUMP"
printf '%s\n' "$PG_MAJOR" > "${DUMP%.dump}.major"
mv "$ARCHIVE.partial" "$ARCHIVE"
find /opt/backups -name 'dados-*.tar.gz' -mtime +7 -delete
find /opt/backups -name 'banco-*.dump' -mtime +7 -delete
find /opt/backups -name 'banco-*.major' -mtime +7 -delete
if [ -f .backup.env ] && grep -Eq '^RESTIC_REPOSITORY=.+$' .backup.env; then
  bash ./offsite.sh backup
else
  echo 'ATENÇÃO: backup somente local; configure RESTIC_REPOSITORY para cópia externa criptografada.' >&2
fi
echo "$(date '+%F %T') backup concluído: arquivos e PostgreSQL."
