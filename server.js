import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configuration via environment
const AUTH_ENABLED = process.env.DISABLE_AUTH !== 'true';
const USERNAME = process.env.LOGIN_USERNAME || 'admin';
const PASSWORD = process.env.LOGIN_PASSWORD || 'password';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change';
const PORT = Number(process.env.PORT || 5173);

// Middleware
app.use(cookieParser(SESSION_SECRET));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Auth helpers
function isAuthenticated(req) {
  try {
    const token = req.signedCookies && req.signedCookies.auth;
    return token === 'ok';
  } catch (_) {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  const redirectTo = '/login.html';
  if (req.accepts('html')) {
    return res.redirect(302, redirectTo);
  }
  return res.status(401).json({ error: 'unauthorized' });
}

// Login routes
app.get('/login', (req, res) => {
  res.redirect(302, '/login.html');
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (String(username) === USERNAME && String(password) === PASSWORD) {
    res.cookie('auth', 'ok', { httpOnly: true, signed: true, sameSite: 'lax' });
    return res.status(204).end();
  }
  return res.status(401).json({ error: 'invalid_credentials' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth');
  res.status(204).end();
});

// Static files
const publicDir = __dirname;

// Serve login assets publicly (explicit files to avoid 301 directory redirects)
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});
app.get('/src/login.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(publicDir, 'src', 'login.js'));
});

// Conditionally protect static assets based on AUTH_ENABLED
if (AUTH_ENABLED) {
  app.use(requireAuth, express.static(publicDir));
} else {
  app.use(express.static(publicDir));
}

// Fallback to index.html for app routes
app.get('*', AUTH_ENABLED ? requireAuth : (req, res, next) => next(), (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Authentication: ${AUTH_ENABLED ? 'enabled' : 'disabled'}`);
  });
}

export default app;


