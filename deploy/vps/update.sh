#!/usr/bin/env bash
# Atualiza o sistema quando há commit novo no GitHub. Roda a cada 5 minutos pelo cron (ou à mão).
#   ./update.sh            só na janela tranquila (22h às 6h em Porto Velho)
#   ./update.sh --force    agora, mesmo sem commit novo
# O que protege a atualização:
#   1. se o commit novo traz migração de banco, tira um backup do banco antes (BACKUP_ONLY=db);
#   2. a imagem anterior fica guardada (chat-academico-api:prev);
#   3. depois de subir, espera a API ficar saudável; se não ficar, VOLTA sozinho para a versão anterior e avisa (exit 1).
set -euo pipefail
cd /opt/chat-academico
exec 9>/var/lock/chat-academico-update.lock
# the automatic run (cron) just leaves when another update is running; a forced one (deploy by GitHub) WAITS its turn and never reports "ok" without having updated
if [ "${1:-}" = "--force" ]; then
  flock -w 900 9 || { echo "ERRO: outra atualização segurou o bloqueio por mais de 15 minutos"; exit 1; }
else
  flock -n 9 || exit 0
fi

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
# a commit that failed once is not tried again by itself every 5 minutes (a new commit, or --force, tries again)
if [ "${1:-}" != "--force" ] && [ -f .failed-commit ] && [ "$(cat .failed-commit)" = "$REMOTE" ]; then exit 0; fi

log() { echo "$(date '+%F %T') $*"; }
# GitHub's deploy asks for "this commit": when the version in the air already is it (the cron got there first), nothing is restarted
if [ "${WANT_SHA:-}" != "" ] && [ "$(docker exec chat-academico-api-1 printenv GIT_SHA 2>/dev/null | cut -c1-7)" = "${WANT_SHA:0:7}" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' chat-academico-api-1 2>/dev/null)" = "healthy" ]; then
  log "a versão ${WANT_SHA:0:7} já está no ar e saudável: nada a fazer"
  exit 0
fi
log "atualizando ${LOCAL:0:7} -> ${REMOTE:0:7}"

# 1) a migration in the new commit: a fresh dump of the database first (a failure is logged, and the update goes on only when a recent dump exists)
if git diff --name-only "$LOCAL" "$REMOTE" | grep -q 'backend/src/database/migrations/'; then
  log "o commit novo traz migração: backup do banco antes"
  if ! BACKUP_ONLY=db ./deploy/vps/backup.sh; then
    if ! find /opt/backups -name 'banco-*' -mmin -1500 | grep -q .; then
      log "ERRO: sem backup recente do banco; atualização cancelada (rode ./deploy/vps/backup.sh e corrija o erro)"
      exit 1
    fi
    log "AVISO: o backup de agora falhou, mas há um das últimas 24 horas; seguindo"
  fi
fi

# 2) keep what runs now, to go back to it
docker tag chat-academico-api:vps chat-academico-api:prev 2>/dev/null || true

git reset -q --hard origin/main
export GIT_SHA=$(git rev-parse --short HEAD)
cd deploy/vps
if ! docker compose up -d --build; then
  log "ERRO: o build do commit ${REMOTE:0:7} falhou; a versão que estava no ar continua"
  echo "$REMOTE" > /opt/chat-academico/.failed-commit
  cd /opt/chat-academico && git reset -q --hard "$LOCAL"
  exit 1
fi

# 3) healthy, or back to the previous version
for i in $(seq 1 72); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' chat-academico-api-1 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    docker image prune -f >/dev/null
    rm -f /opt/chat-academico/.failed-commit
    log "pronto (${GIT_SHA})"
    exit 0
  fi
  sleep 5
done

log "ERRO: a API não ficou saudável em 6 minutos; voltando para ${LOCAL:0:7}"
echo "$REMOTE" > /opt/chat-academico/.failed-commit
docker logs --tail 30 chat-academico-api-1 2>&1 | sed 's/^/  | /' || true
if docker image inspect chat-academico-api:prev >/dev/null 2>&1; then
  docker tag chat-academico-api:prev chat-academico-api:vps
  cd /opt/chat-academico && git reset -q --hard "$LOCAL"
  export GIT_SHA=$(git rev-parse --short HEAD)
  cd deploy/vps && docker compose up -d --no-build
  log "versão anterior (${GIT_SHA}) no ar; o commit ${REMOTE:0:7} precisa de correção"
else
  log "não há imagem anterior guardada: confira os logs da API"
fi
exit 1
