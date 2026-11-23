#!/usr/bin/env bash
# Starts what the lead simulator needs (Postgres already running): the stand-in model, a fresh database and the API on 8080, then the data.
# Usage, from the backend folder, after `npm run build`:  bash scripts/lead-sim/start.sh
set -e
pkill -f "dist/server.js" 2>/dev/null || true; pkill -f "lead-sim/mock-model.js" 2>/dev/null || true
export PGUSER=${PGUSER:-postgres} PGHOST=${PGHOST:-localhost} DB_DIALECT=postgres DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASS= DB_NAME=simleads DB_SSL=false DATABASE_URL= DATABASE_URL_POOL=
export JWT_SECRET=sim JWT_REFRESH_SECRET=sim-r PORT=8080 BACKEND_URL=http://localhost PUBLIC_URL=http://localhost:8080 FRONTEND_URL=http://localhost:3000
export SKIP_WHATSAPP_SESSIONS=1 SKIP_DEFAULT_DATA=1 LOG_LEVEL=warn LOGIN_RATE_MAX=100000 ANTHROPIC_API_URL=http://localhost:9911 OPENAI_API_URL=http://localhost:9911
psql -q -c "DROP DATABASE IF EXISTS simleads" 2>/dev/null; psql -q -c "CREATE DATABASE simleads"
npx sequelize db:migrate > /dev/null
NODE_ENV=test npx sequelize db:seed:all > /dev/null
nohup node scripts/lead-sim/mock-model.js > /tmp/lead-sim-model.log 2>&1 &
nohup node dist/server.js > /tmp/lead-sim-api.log 2>&1 &
for i in $(seq 1 60); do curl -fs http://localhost:8080/health > /dev/null && break; sleep 2; done
rm -rf scripts/lead-sim/.conversas
node scripts/lead-sim/setup.js
