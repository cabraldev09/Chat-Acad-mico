#!/usr/bin/env bash
# Atualiza o sistema quando há commit novo no GitHub. Roda a cada 5 minutos pelo cron (ou à mão).
set -euo pipefail
cd /opt/chat-academico
exec 9>/tmp/chat-academico-update.lock
flock -n 9 || exit 0

# Updating restarts the API for about a minute, so the automatic update waits for the quiet hours (22h to 6h in
# Porto Velho). "update.sh --force" updates right away.
if [ "${1:-}" != "--force" ]; then
  HOUR=$(TZ=America/Porto_Velho date +%H)
  if [ "$HOUR" -ge 6 ] && [ "$HOUR" -lt 22 ]; then exit 0; fi
fi

git fetch -q origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then exit 0; fi

# The exact commit must have passed checks; a push alone is not a release approval.
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps -T   -v /opt/chat-academico/deploy/vps/check-ci.js:/tmp/check-ci.js:ro --entrypoint node api /tmp/check-ci.js "$REMOTE"

echo "$(date '+%F %T') atualizando ${LOCAL:0:7} -> ${REMOTE:0:7}"
git reset -q --hard origin/main
cd deploy/vps
docker compose up -d --build
docker image prune -f >/dev/null
echo "$(date '+%F %T') pronto"
