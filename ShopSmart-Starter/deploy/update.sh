#!/usr/bin/env bash
# Deploy the latest commit of the branch: install, apply committed migrations, rebuild, restart.
#   sudo bash /opt/shopsmart/app/ShopSmart-Starter/deploy/update.sh [git-branch]
set -euo pipefail
BRANCH="${1:-main}"
APP_DIR=/opt/shopsmart/app
STARTER="$APP_DIR/ShopSmart-Starter"
ENV_FILE=/etc/shopsmart/backend.env
[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo."; exit 1; }
run_as_app() { sudo -u shopsmart bash -c "set -a; . '$ENV_FILE'; set +a; cd '$STARTER' && $1"; }

/usr/local/bin/shopsmart-backup
sudo -u shopsmart git -C "$APP_DIR" fetch origin "$BRANCH"
sudo -u shopsmart git -C "$APP_DIR" checkout "$BRANCH"
sudo -u shopsmart git -C "$APP_DIR" pull --ff-only
echo "code version: $(sudo -u shopsmart git -C "$APP_DIR" log -1 --format='%h %s')"
run_as_app "npm ci --include=dev --no-audit --no-fund"
run_as_app "npm run db:generate"
run_as_app "npm run db:deploy"
run_as_app "VITE_API_URL=/api npm run build --workspace frontend"
find /var/www/shopsmart -mindepth 1 -delete
cp -r "$STARTER/frontend/dist/." /var/www/shopsmart/
systemctl restart shopsmart-api
for i in $(seq 1 15); do curl -fsS http://127.0.0.1:3000/api/health/ready && break; sleep 2; done
echo
