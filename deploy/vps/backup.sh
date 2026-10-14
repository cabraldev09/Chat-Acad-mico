#!/usr/bin/env bash
# Backup diário do volume /data (sessões do WhatsApp e arquivos). Guarda os 7 mais recentes em /opt/backups.
set -euo pipefail
mkdir -p /opt/backups
FILE="/opt/backups/dados-$(date +%F).tar.gz"
docker run --rm -v chat-academico-data:/data:ro -v /opt/backups:/backup alpine \
  tar czf "/backup/$(basename "$FILE")" -C /data .
ls -1t /opt/backups/dados-*.tar.gz | tail -n +8 | xargs -r rm -f
echo "$(date '+%F %T') backup: $FILE ($(du -h "$FILE" | cut -f1))"
