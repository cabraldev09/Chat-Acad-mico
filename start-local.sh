#!/bin/bash
# Sobe MariaDB + backend (8080) + frontend (3000) em localhost
DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH=/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH
mkdir -p "$DIR/logs"
# PostgreSQL local (o mesmo motor do Supabase). Em produção use DATABASE_URL do Supabase.
brew services start postgresql@16 >/dev/null 2>&1
cd "$DIR/backend" && npx sequelize db:migrate >/dev/null 2>&1
# first run: creates the administrator (random password written to logs/bootstrap.log) and the base settings
node scripts/bootstrap-production.js > "$DIR/logs/bootstrap.log" 2>&1
nohup node dist/server.js > "$DIR/logs/backend.log" 2>&1 & echo $! > "$DIR/logs/backend.pid"
cd "$DIR/frontend" && nohup npx vite --open false > "$DIR/logs/frontend.log" 2>&1 & echo $! > "$DIR/logs/frontend.pid"
echo "Frontend: http://localhost:3000  |  Backend: http://localhost:8080"
echo "Administrador: veja o e-mail e a senha inicial (só na primeira vez) em logs/bootstrap.log"
