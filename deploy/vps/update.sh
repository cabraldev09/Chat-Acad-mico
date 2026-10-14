#!/usr/bin/env bash
# Atualiza o sistema quando há commit novo no GitHub. Roda a cada 5 minutos pelo cron (ou à mão).
set -euo pipefail
cd /opt/chat-academico
exec 9>/tmp/chat-academico-update.lock
flock -n 9 || exit 0

git fetch -q origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then exit 0; fi

echo "$(date '+%F %T') atualizando ${LOCAL:0:7} -> ${REMOTE:0:7}"
git reset -q --hard origin/main
cd deploy/vps
docker compose up -d --build
docker image prune -f >/dev/null
echo "$(date '+%F %T') pronto"
