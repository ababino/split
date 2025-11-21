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

### Sessions Feature

Create shareable split budget sessions with unique URLs that can be accessed without authentication. This allows teams to collaboratively add expenses and calculate settlements.

**Key Features:**
- 🔗 Create shareable session URLs
- 👥 Collaborative editing without login
- ⏱️ Time-limited access (configurable expiration)
- 🔐 Session management dashboard for owners
- 💾 Data persistence with SQLite

**Configuration (Environment Variables):**
- `DEFAULT_SESSION_DURATION_HOURS` - Default session duration (default: 24 hours)
- `MAX_SESSION_DURATION_HOURS` - Maximum allowed duration (default: 168 hours / 7 days)
- `SESSION_CLEANUP_INTERVAL_HOURS` - How often to cleanup expired sessions (default: 1 hour)
- `DB_PATH` - Database file location (default: `database/split.db`)

**Usage:**
1. Log in to the application
2. Click "Create Session" to generate a shareable URL
3. Share the URL with collaborators
4. Anyone with the URL can add participants and amounts
5. Manage your sessions from the "My Sessions" page

### Testing

Comprehensive test suite with 106 tests covering all functionality.

Tests are written with Vitest and located in `test/`.

```bash
# Run tests once
npm test

# Watch mode (for development)
npm run test:watch
```

**Test Coverage:**
- ✅ Database layer (CRUD operations)
- ✅ API endpoints (REST API)
- ✅ Authentication & authorization
- ✅ Session expiration logic
- ✅ Public and protected routes
- ✅ Error handling
- ✅ Edge cases

**Test Files:**
- `sessions.test.js` - Database operations (21 tests)
- `sessions-api.test.js` - API endpoints (25 tests)
- `sessions-expiration.test.js` - Expiration logic (12 tests)
- `sessions-interaction.test.js` - Session interaction (23 tests)
- `sessions-ui.test.js` - UI routing (13 tests)
- `auth.test.js` - Authentication (7 tests)
- `split.test.js` - Split calculation (3 tests)
- `overlap.test.js` - Duplicate detection (1 test)
- `responsive.test.js` - Responsive design (1 test)

See `test/TEST_REPORT.md` for detailed test documentation.

### Project structure

```
.
├─ index.html                  # Main application page
├─ login.html                  # Login page
├─ sessions.html               # Session management dashboard
├─ session.html                # Individual session view (public)
├─ server.js                   # Express server with API endpoints
├─ package.json                # Dependencies and scripts
├─ vitest.config.js            # Test configuration
├─ src/
│  ├─ app.js                   # Main UI logic and event handlers
│  ├─ login.js                 # Login page logic
│  ├─ sessions.js              # Session management UI
│  ├─ session.js               # Session view UI
│  └─ split.js                 # Splitting + settlement algorithm
├─ database/
│  ├─ schema.sql               # SQLite database schema
│  ├─ db.js                    # Database access layer
│  └─ split.db                 # SQLite database file (created at runtime)
├─ test/
│  ├─ sessions.test.js         # Database CRUD tests
│  ├─ sessions-api.test.js     # API endpoint tests
│  ├─ sessions-expiration.test.js   # Expiration logic tests
│  ├─ sessions-interaction.test.js  # Session interaction tests
│  ├─ sessions-ui.test.js      # UI routing tests
│  ├─ auth.test.js             # Authentication tests
│  ├─ split.test.js            # Split calculation tests
│  ├─ overlap.test.js          # Overlap detection tests
│  ├─ responsive.test.js       # Responsive design tests
│  └─ TEST_REPORT.md           # Comprehensive test documentation
├─ feature_specs/
│  └─ sessions.md              # Sessions feature specification
├─ scripts/
│  └─ install-systemd.sh       # Systemd installation script
├─ PHASE2_IMPLEMENTATION.md    # Phase 1 & 2 implementation summary
├─ PHASE5_IMPLEMENTATION.md    # Phase 5 implementation summary
├─ PHASE6_IMPLEMENTATION.md    # Phase 6 testing summary
└─ README.md                   # This file
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


