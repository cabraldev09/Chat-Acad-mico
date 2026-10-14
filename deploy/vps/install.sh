#!/usr/bin/env bash
# Instala o Chat Acadêmico (API) em um VPS Ubuntu 22/24 novo. Rode como root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/cabraldev09/Chat-Acad-mico/main/deploy/vps/install.sh)
# Pode rodar de novo sem medo: não apaga o .env nem os dados.
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "Rode como root (ssh root@IP-DO-SERVIDOR)."; exit 1; }

REPO="${REPO:-https://github.com/cabraldev09/Chat-Acad-mico.git}"
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
  git clone -q "$REPO" "$DIR"
fi
cd "$DIR/deploy/vps"
chmod +x update.sh backup.sh

say "5/7 Configuração"
if [ -f .env ]; then
  echo "Já existe um .env: mantido. (Para refazer, apague $DIR/deploy/vps/.env e rode de novo.)"
else
  IP=$(curl -4 -fsS https://ifconfig.me || true)
  DEFAULT_DOMAIN="${IP//./-}.sslip.io"
  # se o registro DNS "api" já aponta para este servidor, usa o endereço definitivo
  PREFERRED="${PREFERRED_DOMAIN:-api.cruzeirodosulvirtual.xyz}"
  if [ -n "$IP" ] && [ "$(getent ahostsv4 "$PREFERRED" 2>/dev/null | awk 'NR==1{print $1}')" = "$IP" ]; then DEFAULT_DOMAIN="$PREFERRED"; fi
  echo "Responda as perguntas. Enter aceita o valor entre colchetes."
  read -r -p "Endereço da API [$DEFAULT_DOMAIN]: " API_DOMAIN; API_DOMAIN=${API_DOMAIN:-$DEFAULT_DOMAIN}
  read -r -p "Endereço do site na Vercel [https://chat-acad-mico.vercel.app]: " FRONT; FRONT=${FRONT:-https://chat-acad-mico.vercel.app}
  echo "Cole a conexão do banco (Supabase → Connect → Session pooler). Não aparece na tela enquanto você cola."
  read -r -s -p "DATABASE_URL: " DB_URL; echo
  [ -n "$DB_URL" ] || { echo "A DATABASE_URL é obrigatória."; exit 1; }
  read -r -p "E-mail do administrador: " ADM_EMAIL
  read -r -s -p "Senha do administrador (mínimo 8 caracteres): " ADM_PASS; echo
  [ "${#ADM_PASS}" -ge 8 ] || { echo "Use uma senha com pelo menos 8 caracteres."; exit 1; }
  read -r -p "Nome do administrador [Administrador]: " ADM_NAME; ADM_NAME=${ADM_NAME:-Administrador}
  JWT1=$(openssl rand -hex 32); JWT2=$(openssl rand -hex 32)
  umask 077
  cat > .env <<ENV
API_DOMAIN=$API_DOMAIN
BACKEND_URL=https://$API_DOMAIN
PUBLIC_URL=https://$API_DOMAIN
FRONTEND_URL=$FRONT
DB_DIALECT=postgres
DATABASE_URL=$DB_URL
DB_SSL=true
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
ENV
  chmod 600 .env
fi

say "6/7 Subindo o sistema (o primeiro build leva uns 5 minutos)"
docker compose up -d --build

say "7/7 Atualização automática e backup"
cat > /etc/cron.d/chat-academico <<CRON
*/5 * * * * root /opt/chat-academico/deploy/vps/update.sh >> /var/log/chat-academico-update.log 2>&1
0 3 * * * root /opt/chat-academico/deploy/vps/backup.sh >> /var/log/chat-academico-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/chat-academico

DOMAIN=$(grep '^API_DOMAIN=' .env | cut -d= -f2)
echo; echo "Aguardando a API responder em https://$DOMAIN/health (até 3 minutos)..."
for i in $(seq 1 36); do
  if curl -fsS -m 5 "https://$DOMAIN/health" >/dev/null 2>&1; then
    echo; printf '\033[1;32mPRONTO: https://%s/health respondeu.\033[0m\n' "$DOMAIN"
    curl -fsS "https://$DOMAIN/health"; echo
    echo "Agora coloque https://$DOMAIN/ em VITE_BACKEND_URL na Vercel e faça Redeploy."
    exit 0
  fi
  sleep 5
done
echo; echo "Ainda não respondeu. Veja o motivo com:  cd $DIR/deploy/vps && docker compose logs --tail 80 api caddy"
exit 1
