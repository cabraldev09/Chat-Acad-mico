# Backend (API + WhatsApp sessions + workers) for Railway/Docker.
# The frontend is deployed separately (Vercel, root directory "frontend").
FROM node:22-bookworm-slim

# git: whatsapp-web.js is installed from GitHub; chromium: WhatsApp Web + PDF; poppler: draws the pages of a PDF with no text so the AI can read them
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates chromium ffmpeg poppler-utils fonts-liberation fonts-noto-color-emoji dumb-init gosu \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=384 \
    WHATSAPP_PROVIDER=wwebjs \
    CHROME_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --no-zygote"

WORKDIR /app/backend
COPY backend/package*.json backend/.npmrc ./
RUN npm ci --include=dev --no-audit --no-fund

COPY backend/ ./
# the small heap above is for running the API next to Chromium; compiling needs more
RUN NODE_OPTIONS=--max-old-space-size=3072 npm run build && mkdir -p /data

# Mount the Railway volume at /data and set:
#   UPLOAD_DIR=/data/public  WWEBJS_AUTH_PATH=/data/wwebjs  ZAPO_AUTH_PATH=/data/zapo/state.sqlite
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
EXPOSE 8080
# the entrypoint hands the volume to the "node" user and starts the CMD without root privileges
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
# "exec": the server replaces the shell, so it receives the stop signal (SIGTERM) and closes the WhatsApp browsers cleanly. Without it the shell kept the signal, Docker killed the
# server after 60 s, and every restart lost the WhatsApp logins (a new QR Code for each number).
CMD ["sh", "-c", "mkdir -p \"${UPLOAD_DIR:-public}\" && node scripts/db-preflight.js && node_modules/.bin/sequelize db:migrate && node scripts/bootstrap-production.js && exec node dist/server.js"]
