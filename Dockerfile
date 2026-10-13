# Backend (API + WhatsApp sessions + workers) for Railway/Docker.
# The frontend is deployed separately (Vercel, root directory "frontend").
FROM node:22-bookworm-slim

# git: whatsapp-web.js is installed from GitHub; chromium: WhatsApp Web + PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates chromium ffmpeg fonts-liberation fonts-noto-color-emoji dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=1024 \
    WHATSAPP_PROVIDER=wwebjs \
    CHROME_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --no-zygote"

WORKDIR /app/backend
COPY backend/package*.json backend/.npmrc ./
RUN npm install --include=dev --no-audit --no-fund

COPY backend/ ./
RUN npm run build && mkdir -p /data

# Mount the Railway volume at /data and set:
#   UPLOAD_DIR=/data/public  WWEBJS_AUTH_PATH=/data/wwebjs  ZAPO_AUTH_PATH=/data/zapo/state.sqlite
EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "mkdir -p \"${UPLOAD_DIR:-public}\" && node scripts/db-preflight.js && npx sequelize db:migrate && node scripts/bootstrap-production.js && node dist/server.js"]
