#!/usr/bin/env bash
# ShopSmart single-EC2 setup for Ubuntu Server 24.04 LTS.
# Installs PostgreSQL 16, Node.js 22 and Caddy, then builds and starts ShopSmart behind HTTPS.
#
#   sudo bash setup-ec2.sh <domain> [git-branch]
#   sudo bash setup-ec2.sh 13-212-45-67.sslip.io main
#
# Safe to run again: it keeps the existing database, password and orders.
set -euo pipefail

DOMAIN="${1:?Usage: sudo bash setup-ec2.sh <domain> [git-branch]   e.g. 13-212-45-67.sslip.io}"
BRANCH="${2:-main}"
REPO_URL="${REPO_URL:-https://github.com/000Robert000/ShopSmart.git}"
APP_DIR=/opt/shopsmart/app
STARTER="$APP_DIR/ShopSmart-Starter"
ENV_FILE=/etc/shopsmart/backend.env
WEB_ROOT=/var/www/shopsmart

[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo."; exit 1; }

echo "== 1/8 Swap file (2 GB) so npm and the Vite build fit on a small instance"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 2/8 Packages: PostgreSQL, git, Caddy, Node.js 22"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y postgresql git curl gnupg openssl debian-keyring debian-archive-keyring apt-transport-https ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
echo "node $(node -v), $(psql --version), $(caddy version | cut -d' ' -f1)"

echo "== 3/8 Service user and code ($REPO_URL, branch $BRANCH)"
id shopsmart >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/shopsmart --shell /usr/sbin/nologin shopsmart
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u shopsmart git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  sudo -u shopsmart git -C "$APP_DIR" fetch origin "$BRANCH" && sudo -u shopsmart git -C "$APP_DIR" checkout "$BRANCH" && sudo -u shopsmart git -C "$APP_DIR" pull --ff-only
fi
echo "code version: $(sudo -u shopsmart git -C "$APP_DIR" log -1 --format='%h %s')"

echo "== 4/8 PostgreSQL database on this instance (port 5432 stays private)"
install -d -m 750 -o root -g shopsmart /etc/shopsmart
if [ ! -f "$ENV_FILE" ]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'shopsmart_user') THEN CREATE ROLE shopsmart_user LOGIN; END IF; END \$\$;"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "ALTER ROLE shopsmart_user PASSWORD '$DB_PASSWORD';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'shopsmart'" | grep -q 1 || sudo -u postgres createdb -O shopsmart_user shopsmart
  cat > "$ENV_FILE" <<EOF
# ShopSmart API settings. Secrets live only here (root:shopsmart, mode 640). Never commit or screenshot this file.
DATABASE_URL=postgresql://shopsmart_user:${DB_PASSWORD}@127.0.0.1:5432/shopsmart?schema=public
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
FRONTEND_URL=https://${DOMAIN}
TRUST_PROXY=1
COOKIE_SECURE=true
# AI: mock (labelled simulated provider), mock-down (simulated outage), gemini (needs GEMINI_API_KEY) or none.
AI_PROVIDER=mock
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-lite-latest,gemini-3-flash-preview,gemini-3.1-flash-lite-preview
AI_TIMEOUT_MS=20000
EOF
  chown root:shopsmart "$ENV_FILE" && chmod 640 "$ENV_FILE"
  echo "created $ENV_FILE with a random database password (not printed)"
else
  sed -i "s#^FRONTEND_URL=.*#FRONTEND_URL=https://${DOMAIN}#" "$ENV_FILE"
  echo "kept existing $ENV_FILE"
fi

run_as_app() { sudo -u shopsmart bash -c "set -a; . '$ENV_FILE'; set +a; cd '$STARTER' && $1"; }

echo "== 5/8 Install, migrate (migrate deploy: never resets data), seed only if empty, build"
run_as_app "npm ci --include=dev --no-audit --no-fund"
run_as_app "npm run db:generate"
run_as_app "npm run db:deploy"
PRODUCTS="$(sudo -u postgres psql -d shopsmart -tAc 'SELECT count(*) FROM "Product"')"
if [ "$PRODUCTS" = "0" ]; then run_as_app "npm run db:seed"; else echo "database already has $PRODUCTS products: seed skipped"; fi
run_as_app "VITE_API_URL=/api npm run build --workspace frontend"
install -d -m 755 "$WEB_ROOT"
find "$WEB_ROOT" -mindepth 1 -delete
cp -r "$STARTER/frontend/dist/." "$WEB_ROOT/"

echo "== 6/8 API service (systemd: restarts on crash and starts after reboot)"
install -m 644 "$STARTER/deploy/shopsmart-api.service" /etc/systemd/system/shopsmart-api.service
systemctl daemon-reload
systemctl enable shopsmart-api >/dev/null
systemctl restart shopsmart-api

echo "== 7/8 Caddy: HTTPS for $DOMAIN, /api -> 127.0.0.1:3000, everything else -> built frontend"
sed "s/__DOMAIN__/${DOMAIN}/" "$STARTER/deploy/Caddyfile" > /etc/caddy/Caddyfile
install -d -o caddy -g caddy /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy >/dev/null
systemctl reload caddy || systemctl restart caddy

echo "== 8/8 Daily database backup and local checks"
install -m 755 "$STARTER/deploy/backup-db.sh" /usr/local/bin/shopsmart-backup
echo "30 2 * * * root /usr/local/bin/shopsmart-backup >> /var/log/shopsmart-backup.log 2>&1" > /etc/cron.d/shopsmart-backup
for i in $(seq 1 15); do curl -fsS http://127.0.0.1:3000/api/health/ready && break; sleep 2; done
echo
echo "Done. Open https://${DOMAIN} (the first visit can take a minute while Caddy gets the certificate)."
echo "Logs: sudo journalctl -u shopsmart-api -f    |    sudo journalctl -u caddy -f"
