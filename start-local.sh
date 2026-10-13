#!/bin/bash
# Sobe MariaDB + backend (8080) + frontend (3000) em localhost
DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
mkdir -p "$DIR/logs"
brew services start mariadb >/dev/null 2>&1
cd "$DIR/backend" && npx sequelize db:migrate >/dev/null 2>&1
nohup node dist/server.js > "$DIR/logs/backend.log" 2>&1 & echo $! > "$DIR/logs/backend.pid"
cd "$DIR/frontend" && nohup npx vite --open false > "$DIR/logs/frontend.log" 2>&1 & echo $! > "$DIR/logs/frontend.pid"
echo "Frontend: http://localhost:3000  |  Backend: http://localhost:8080"
echo "Login inicial: admin@whaticket.com / admin (troque a senha)"
