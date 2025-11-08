## Split Budget

Simple, zero-backend web app to split a shared budget among friends and compute a minimal set of transfers to settle up.

### Quick start

- **Install dependencies**:

```bash
npm install
```

- **Run locally** (serves `index.html`):

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### Authentication (Login)

This project includes an optional, minimal login screen enforced by a tiny Express server.

- **Environment variables**:
  - `DISABLE_AUTH`: Set to `true` to disable authentication entirely (default: authentication is enabled)
  - `LOGIN_USERNAME`: Username required to sign in (default: `admin`)
  - `LOGIN_PASSWORD`: Password required to sign in (default: `password`)
  - `SESSION_SECRET`: Secret used to sign the auth cookie (default: `dev-secret-change`)
  - `PORT` (optional): Server port (default `5173`)

- **Run locally WITHOUT authentication**:

```bash
DISABLE_AUTH=true npm run dev
```

- **Run locally with auth enabled**:

```bash
LOGIN_USERNAME=admin \
LOGIN_PASSWORD=secret \
SESSION_SECRET='change-me' \
npm run dev
```

Then open `http://localhost:5173` and log in. If env vars are not provided, the server defaults to `admin` / `password` (development only) and `SESSION_SECRET=dev-secret-change`.

- **Public routes**: `/login.html`, `/src/login.js`
- **Auth API**:
  - `POST /api/login` with JSON body `{ "username": "...", "password": "..." }`
    - On success: `204 No Content` + sets a signed cookie
    - On failure: `401 { error: "invalid_credentials" }`
  - `POST /api/logout` → `204 No Content` and clears cookie
- **Protected content**: All other paths (including `/`) require the auth cookie and will redirect to `/login.html` if not authenticated.

### Usage

- **Add participant**: Click the Add participant button to add a row.
- **Enter amounts**: Fill in each participant's name and the amount they paid.
- **Remove**: Click Remove to delete a row.
- **Calculate**: Click Calculate to see who should pay whom and how much.

### Development

- Source code lives in `src/`.
- UI logic is in `src/app.js` (DOM + events).
- Splitting algorithm utilities are in `src/split.js`.

Run a local server:

```bash
npm run dev
```

### Testing

Tests are written with Vitest and located in `test/`.

```bash
# Run tests once
npm test

# Watch mode
npm run test:watch
```

### Project structure

```
.
├─ index.html          # Minimal UI and styles
├─ src/
│  ├─ app.js          # UI wiring and event handlers
│  └─ split.js        # Splitting + settlement algorithm
└─ test/
   └─ split.test.js   # Unit tests
```

### How it works (algorithm)

- Operates in integer cents for accuracy.
- Computes near-equal target shares (difference ≤ 1 cent, sum preserved).
- Greedy settlement minimizes the number of transfers by matching largest debtor to largest creditor.

### Accessibility

Buttons use high-contrast colors and clear focus states. The Remove button is styled as a distinct danger action for visibility.

### Requirements

- Node.js 18+ recommended

### License

Add a license of your choice (e.g., MIT) if you plan to share this project.

### Run as a systemd service (Linux)

Below is an example for running the static site with `serve` under systemd on a Linux server. Adjust paths, user/group, and port as needed.

1) Place the app on the server and install deps:

```bash
sudo mkdir -p /opt/split
sudo rsync -a --delete ./ /opt/split/
cd /opt/split
npm ci
```

2) (Recommended) Create a dedicated user and set ownership:

```bash
sudo useradd --system --home-dir /opt/split --shell /usr/sbin/nologin split || true
sudo chown -R split:split /opt/split
```

3) Create the unit file at `/etc/systemd/system/split.service`:

For production with authentication:
```ini
[Unit]
Description=Split Budget server
After=network.target

[Service]
Type=simple
User=split
Group=split
WorkingDirectory=/opt/split
Environment=NODE_ENV=production
Environment=LOGIN_USERNAME=your_username
Environment=LOGIN_PASSWORD=your_secure_password
Environment=SESSION_SECRET=your_secure_random_secret
ExecStart=/usr/bin/node /opt/split/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Or for production without authentication:
```ini
[Unit]
Description=Split Budget server
After=network.target

[Service]
Type=simple
User=split
Group=split
WorkingDirectory=/opt/split
Environment=NODE_ENV=production
Environment=DISABLE_AUTH=true
ExecStart=/usr/bin/node /opt/split/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

4) Start and enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now split.service
sudo systemctl status split.service | cat
```

5) Verify it’s serving:

```bash
curl -f http://localhost:8080/
```

6) View logs (optional):

```bash
sudo journalctl -u split.service -f | cat
```

Notes:
- Open firewall port 8080 or change `-l 8080` to your desired port.
- Consider placing a reverse proxy (e.g., Nginx/Caddy) in front for TLS and domain routing.
- If you prefer npm scripts, add a `start` script (e.g., `serve -s -l 8080`) and set `ExecStart=/usr/bin/npm start --prefix /opt/split`.

### Automated install script (systemd)

You can automate the setup on a Linux server with systemd using the provided script:

```bash
sudo bash scripts/install-systemd.sh \
  --install-dir /opt/split \
  --service-name split \
  --user split \
  --group split \
  --port 8080
```

Flags:
- `--install-dir` target path (default `/opt/split`)
- `--service-name` systemd unit name (default `split`)
- `--user`/`--group` service account (default `split`)
- `--port` port to listen on (default `8080`)
- `--node-env` set `NODE_ENV` (default `production`)
- `--no-enable` do not enable at boot
- `--no-start` do not start after install

Outputs:
- Systemd unit at `/etc/systemd/system/<service>.service`
- App files in the chosen `--install-dir`
- Logs via `journalctl -u <service> -f`


