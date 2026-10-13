#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
for f in backend frontend; do [ -f "$DIR/logs/$f.pid" ] && kill $(cat "$DIR/logs/$f.pid") 2>/dev/null; done
pkill -f "dist/server.js" 2>/dev/null; pkill -f "vite" 2>/dev/null
echo parado
