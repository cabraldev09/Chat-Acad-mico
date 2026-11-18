#!/usr/bin/env bash
# Instala o Chat Acadêmico (API) em um VPS Ubuntu 22/24 novo (Hostinger, Contabo, Hetzner...). Rode como root.
# O repositório é privado: passe um token do GitHub só de leitura (usado no primeiro clone e apagado em seguida) e a chave
# pública de deploy (a que corresponde ao segredo VPS_SSH_KEY do GitHub Actions), para as atualizações automáticas entrarem:
#   GH_TOKEN=github_pat_... DEPLOY_PUBKEY="ssh-ed25519 AAAA... deploy" bash install.sh
# Pode rodar de novo sem medo: não apaga o .env nem os dados.
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "Rode como root (ssh root@IP-DO-SERVIDOR)."; exit 1; }

REPO="${REPO:-https://github.com/cabraldev09/Chat-Acad-mico.git}"
GH_TOKEN="${GH_TOKEN:-}"
# Sem perguntas (GitHub Actions): NONINTERACTIVE=1 com API_DOMAIN, FRONT, ADM_EMAIL, ADM_PASS[, ADM_NAME] e DB_URL ou LOCAL_DB=1
# (LOCAL_DB=1: o banco Postgres roda no próprio servidor, em docker-compose.localdb.yml)
NONINTERACTIVE="${NONINTERACTIVE:-}"
LOCAL_DB="${LOCAL_DB:-}"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-}"
DIR=/opt/chat-academico
say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

say "1/7 Pacotes básicos"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw fail2ban cron

say "2/7 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# a chave de deploy do GitHub Actions entra no root (só ela, além das que já existem)
if [ -n "$DEPLOY_PUBKEY" ]; then
  install -m 700 -d /root/.ssh
  touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
  grep -qxF "$DEPLOY_PUBKEY" /root/.ssh/authorized_keys || echo "$DEPLOY_PUBKEY" >> /root/.ssh/authorized_keys
fi

say "3/7 Memória extra (swap de 4 GB) e firewall"
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true

say "4/7 Código"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin main && git -C "$DIR" reset -q --hard origin/main
else
  if [ -n "$GH_TOKEN" ]; then
    git clone -q "https://x-access-token:${GH_TOKEN}@${REPO#https://}" "$DIR"
    # o token não fica guardado no servidor: as atualizações usam o token temporário do GitHub Actions
    git -C "$DIR" remote set-url origin "$REPO"
  else
    git clone -q "$REPO" "$DIR"
  fi
fi
cd "$DIR/deploy/vps"
chmod +x update.sh backup.sh offsite.sh verify-backup.sh

say "5/7 Configuração"
if [ -f .env ]; then
  echo "Já existe um .env: mantido. (Para refazer, apague $DIR/deploy/vps/.env e rode de novo.)"
else
  IP=$(curl -4 -fsS https://ifconfig.me || true)
  DEFAULT_DOMAIN="${IP//./-}.sslip.io"
  # se o registro DNS "api" já aponta para este servidor, usa o endereço definitivo
  PREFERRED="${PREFERRED_DOMAIN:-}"
  if [ -n "$PREFERRED" ] && [ -n "$IP" ] && [ "$(getent ahostsv4 "$PREFERRED" 2>/dev/null | awk 'NR==1{print $1}')" = "$IP" ]; then DEFAULT_DOMAIN="$PREFERRED"; fi
  if [ -n "$NONINTERACTIVE" ]; then
    API_DOMAIN=${API_DOMAIN:-$DEFAULT_DOMAIN}
    FRONT=${FRONT:-https://www.cruzeirodosulvirtual.app.br}
    DB_URL=${DB_URL:-}
    ADM_NAME=${ADM_NAME:-Administrador}
  else
    echo "Responda as perguntas. Enter aceita o valor entre colchetes."
    read -r -p "Endereço da API [$DEFAULT_DOMAIN]: " API_DOMAIN; API_DOMAIN=${API_DOMAIN:-$DEFAULT_DOMAIN}
    read -r -p "Endereço do site [https://www.cruzeirodosulvirtual.app.br]: " FRONT; FRONT=${FRONT:-https://www.cruzeirodosulvirtual.app.br}
    if [ -z "$LOCAL_DB" ]; then
      echo "Cole a conexão do banco (Supabase → Connect → Session pooler). Vazio = banco no próprio servidor. Não aparece na tela."
      read -r -s -p "DATABASE_URL: " DB_URL; echo
    fi
    read -r -p "E-mail do administrador: " ADM_EMAIL
    read -r -s -p "Senha do administrador (mínimo 8 caracteres): " ADM_PASS; echo
    read -r -p "Nome do administrador [Administrador]: " ADM_NAME; ADM_NAME=${ADM_NAME:-Administrador}
  fi
  [ -n "${ADM_EMAIL:-}" ] || { echo "O e-mail do administrador é obrigatório."; exit 1; }
  [ "${#ADM_PASS}" -ge 8 ] || { echo "Use uma senha com pelo menos 8 caracteres."; exit 1; }
  # sem banco externo: Postgres no próprio servidor
  DB_EXTRA=""
  if [ -z "${DB_URL:-}" ]; then
    LOCAL_PASS=$(openssl rand -hex 24)
    DB_URL="postgres://chat:${LOCAL_PASS}@db:5432/chat"
    DB_EXTRA="COMPOSE_FILE=docker-compose.yml:docker-compose.localdb.yml
LOCAL_DB_PASSWORD=$LOCAL_PASS"
  fi
  JWT1=$(openssl rand -hex 32); JWT2=$(openssl rand -hex 32)
  umask 077
  cat > .env <<ENV
API_DOMAIN=$API_DOMAIN
BACKEND_URL=https://$API_DOMAIN
PUBLIC_URL=https://$API_DOMAIN
FRONTEND_URL=$FRONT
DB_DIALECT=postgres
DATABASE_URL=$DB_URL
DB_SSL=$([ -n "$DB_EXTRA" ] && echo false || echo true)
JWT_SECRET=$JWT1
JWT_REFRESH_SECRET=$JWT2
TRUST_PROXY=1
APP_TIMEZONE=America/Porto_Velho
NODE_ENV=production
ADMIN_EMAIL=$ADM_EMAIL
ADMIN_PASSWORD=$ADM_PASS
ADMIN_NAME=$ADM_NAME
UPLOAD_DIR=/data/public
WWEBJS_AUTH_PATH=/data/wwebjs
ZAPO_AUTH_PATH=/data/zapo/state.sqlite
WHATSAPP_MAX_QR=10
$DB_EXTRA
ENV
  chmod 600 .env
fi

say "6/7 Subindo o sistema (o primeiro build leva uns 5 minutos)"
docker compose up -d --build

say "7/7 Atualização automática e backup"
cat > /etc/cron.d/chat-academico <<CRON
*/5 * * * * root /opt/chat-academico/deploy/vps/update.sh >> /var/log/chat-academico-update.log 2>&1
0 3 * * * root /opt/chat-academico/deploy/vps/backup.sh >> /var/log/chat-academico-backup.log 2>&1
0 5 * * 0 root /opt/chat-academico/deploy/vps/verify-backup.sh --offsite >> /var/log/chat-academico-restore-check.log 2>&1
17 * * * * root BACKUP_ONLY=db /opt/chat-academico/deploy/vps/backup.sh >> /var/log/chat-academico-backup.log 2>&1

CRON
chmod 644 /etc/cron.d/chat-academico

DOMAIN=$(grep '^API_DOMAIN=' .env | cut -d= -f2)
echo; echo "Aguardando a API responder em https://$DOMAIN/health (até 3 minutos)..."
for i in $(seq 1 36); do
  if curl -fsS -m 5 "https://$DOMAIN/health" >/dev/null 2>&1; then
    echo; printf '\033[1;32mPRONTO: https://%s/health respondeu.\033[0m\n' "$DOMAIN"
    curl -fsS "https://$DOMAIN/health"; echo
    echo "Agora coloque https://$DOMAIN/ em VITE_BACKEND_URL na Vercel e faça Redeploy."
    IP=$(curl -4 -fsS https://ifconfig.me || true)
    echo; echo "Linha para deploy/vps/known_hosts (envie para quem cuida do GitHub):"
    printf '%s %s\n' "$IP" "$(awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub)"
    exit 0
  fi
  sleep 5
done
echo; echo "Ainda não respondeu. Veja o motivo com:  cd $DIR/deploy/vps && docker compose logs --tail 80 api caddy"
exit 1
