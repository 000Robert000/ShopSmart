#!/usr/bin/env bash
# Dumps the ShopSmart database to /var/backups/shopsmart and keeps the newest 7 dumps.
set -euo pipefail
DIR=/var/backups/shopsmart
install -d -m 700 -o postgres -g postgres "$DIR"
FILE="$DIR/shopsmart-$(date +%Y%m%d-%H%M%S).dump"
sudo -u postgres pg_dump -Fc -d shopsmart -f "$FILE"
ls -1t "$DIR"/shopsmart-*.dump | tail -n +8 | xargs -r rm -f
echo "$(date -Is) backup written: $FILE"
