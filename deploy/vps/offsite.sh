#!/usr/bin/env bash
# Encrypted off-server backup. Configure RESTIC_REPOSITORY, RESTIC_PASSWORD and provider credentials in .backup.env.
set -euo pipefail
umask 077
cd /opt/chat-academico/deploy/vps
RESTIC_IMAGE=restic/restic:0.19.1
case "${1:-backup}" in
  init) docker run --rm --env-file .backup.env "$RESTIC_IMAGE" init ;;
  backup)
    docker run --rm --env-file .backup.env -v /opt/backups:/backups:ro -v /opt/chat-academico/deploy/vps/.env:/configuration/app.env:ro "$RESTIC_IMAGE" backup /backups /configuration --exclude /backups/restored-offsite --tag chat-academico
    docker run --rm --env-file .backup.env "$RESTIC_IMAGE" check
    ;;
  check) docker run --rm --env-file .backup.env "$RESTIC_IMAGE" check --read-data ;;
  snapshots) docker run --rm --env-file .backup.env "$RESTIC_IMAGE" snapshots ;;
  restore)
    # A separate directory only: never restore over the running application.
    mkdir -p /opt/backups/restored-offsite
    docker run --rm --env-file .backup.env -v /opt/backups/restored-offsite:/restore "$RESTIC_IMAGE" restore "${2:-latest}" --tag chat-academico --target /restore
    ;;
  *) echo "Uso: offsite.sh init|backup|check|snapshots|restore [snapshot]" >&2; exit 2 ;;
esac
