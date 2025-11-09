#!/usr/bin/env bash

set -Eeuo pipefail

# split - systemd installer
# This script installs the project into a target directory, installs npm deps,
# writes a systemd unit, and enables/starts the service.

DEFAULT_INSTALL_DIR="/opt/split"
DEFAULT_SERVICE_NAME="split"
DEFAULT_USER="split"
DEFAULT_GROUP="split"
DEFAULT_PORT="8080"
DEFAULT_NODE_ENV="production"

INSTALL_DIR="$DEFAULT_INSTALL_DIR"
SERVICE_NAME="$DEFAULT_SERVICE_NAME"
RUN_USER="$DEFAULT_USER"
RUN_GROUP="$DEFAULT_GROUP"
PORT="$DEFAULT_PORT"
NODE_ENV_VALUE="$DEFAULT_NODE_ENV"
DISABLE_AUTH=0
LOGIN_USERNAME=""
LOGIN_PASSWORD=""
SESSION_SECRET=""
ENABLE_SERVICE=1
START_SERVICE=1

usage() {
  cat <<EOF
Usage: sudo bash scripts/install-systemd.sh [options]

Options:
  --install-dir PATH      Install directory (default: $DEFAULT_INSTALL_DIR)
  --service-name NAME     systemd service name (default: $DEFAULT_SERVICE_NAME)
  --user NAME             System user to run as (default: $DEFAULT_USER)
  --group NAME            System group to run as (default: $DEFAULT_GROUP)
  --port PORT             Port to serve on (default: $DEFAULT_PORT)
  --node-env VALUE        NODE_ENV for service (default: $DEFAULT_NODE_ENV)
  --disable-auth          Disable authentication (sets DISABLE_AUTH=true)
  --login-username USER   Username for authentication (requires auth enabled)
  --login-password PASS   Password for authentication (requires auth enabled)
  --session-secret SECRET Session secret for authentication (requires auth enabled)
  --no-enable             Do not enable service at boot
  --no-start              Do not start service after install
  -h, --help              Show this help

Example (with authentication):
  sudo bash scripts/install-systemd.sh \
    --install-dir /opt/split --service-name split --user split --group split --port 8080 \
    --login-username admin --login-password secret --session-secret change-me

Example (without authentication):
  sudo bash scripts/install-systemd.sh \
    --install-dir /opt/split --service-name split --user split --group split --port 8080 \
    --disable-auth
EOF
}

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found" >&2
    exit 1
  fi
}

copy_tree() {
  local src="$1" dst="$2"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude ".git" --exclude "node_modules" "$src/" "$dst/"
  else
    mkdir -p "$dst"
    # Remove existing except node_modules (will reinstall anyway)
    find "$dst" -mindepth 1 -maxdepth 1 ! -name "node_modules" -exec rm -rf {} +
    (cd "$src" && tar cf - --exclude .git --exclude node_modules .) | (cd "$dst" && tar xf -)
  fi
}

ensure_group() {
  local group="$1"
  if ! getent group "$group" >/dev/null 2>&1; then
    groupadd --system "$group"
  fi
}

ensure_user() {
  local user="$1" group="$2" home="$3"
  if ! id -u "$user" >/dev/null 2>&1; then
    useradd --system --home-dir "$home" --shell /usr/sbin/nologin --gid "$group" "$user"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --service-name) SERVICE_NAME="$2"; shift 2 ;;
    --user) RUN_USER="$2"; shift 2 ;;
    --group) RUN_GROUP="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --node-env) NODE_ENV_VALUE="$2"; shift 2 ;;
    --disable-auth) DISABLE_AUTH=1; shift ;;
    --login-username) LOGIN_USERNAME="$2"; shift 2 ;;
    --login-password) LOGIN_PASSWORD="$2"; shift 2 ;;
    --session-secret) SESSION_SECRET="$2"; shift 2 ;;
    --no-enable) ENABLE_SERVICE=0; shift ;;
    --no-start) START_SERVICE=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

# Validate environment
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Error: This installer targets Linux with systemd." >&2
  exit 1
fi
require systemctl
require npm

echo "==> Installing to $INSTALL_DIR as service '$SERVICE_NAME' on port $PORT"

# Create user/group
ensure_group "$RUN_GROUP"
ensure_user "$RUN_USER" "$RUN_GROUP" "$INSTALL_DIR"

# Copy files
echo "==> Copying project files to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
copy_tree "$(pwd)" "$INSTALL_DIR"

# Install dependencies (including dev to get 'serve')
echo "==> Installing npm dependencies"
( cd "$INSTALL_DIR" && npm ci )

# Set ownership
chown -R "$RUN_USER":"$RUN_GROUP" "$INSTALL_DIR"

# Write systemd unit
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
echo "==> Writing systemd unit to $UNIT_PATH"

# Build environment variables section
ENV_VARS="Environment=NODE_ENV=${NODE_ENV_VALUE}
Environment=PORT=${PORT}"

if [[ "$DISABLE_AUTH" == "1" ]]; then
  ENV_VARS="${ENV_VARS}
Environment=DISABLE_AUTH=true"
else
  # Add auth credentials if provided
  if [[ -n "$LOGIN_USERNAME" ]]; then
    ENV_VARS="${ENV_VARS}
Environment=LOGIN_USERNAME=${LOGIN_USERNAME}"
  fi
  if [[ -n "$LOGIN_PASSWORD" ]]; then
    ENV_VARS="${ENV_VARS}
Environment=LOGIN_PASSWORD=${LOGIN_PASSWORD}"
  fi
  if [[ -n "$SESSION_SECRET" ]]; then
    ENV_VARS="${ENV_VARS}
Environment=SESSION_SECRET=${SESSION_SECRET}"
  fi
fi

cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=Split Budget server
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${INSTALL_DIR}
${ENV_VARS}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

echo "==> Reloading systemd daemon"
systemctl daemon-reload

if [[ "$ENABLE_SERVICE" == "1" ]]; then
  echo "==> Enabling ${SERVICE_NAME}.service"
  systemctl enable "$SERVICE_NAME"
fi

if [[ "$START_SERVICE" == "1" ]]; then
  echo "==> Starting ${SERVICE_NAME}.service"
  systemctl restart "$SERVICE_NAME"
  systemctl status "$SERVICE_NAME" --no-pager | cat || true
fi

echo "==> Done"
echo "Service: ${SERVICE_NAME}.service"
echo "Port: ${PORT}"
echo "Directory: ${INSTALL_DIR}"
echo "Logs: journalctl -u ${SERVICE_NAME}.service -f"


