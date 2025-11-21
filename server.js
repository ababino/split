import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import {
  initDatabase,
  createSession,
  getSession,
  updateSession,
  listSessionsByOwner,
  deleteSession,
  toggleSessionStatus,
  extendSessionExpiration,
  cleanupExpiredSessions,
  isSessionAccessible
} from './database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configuration via environment
const AUTH_ENABLED = process.env.DISABLE_AUTH !== 'true';
const USERNAME = process.env.LOGIN_USERNAME || 'admin';
const PASSWORD = process.env.LOGIN_PASSWORD || 'password';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change';
const PORT = Number(process.env.PORT || 5173);
const DEFAULT_SESSION_DURATION_HOURS = Number(process.env.DEFAULT_SESSION_DURATION_HOURS || 24);
const MAX_SESSION_DURATION_HOURS = Number(process.env.MAX_SESSION_DURATION_HOURS || 168);

// Initialize database
if (process.env.NODE_ENV !== 'test') {
  initDatabase();
  
  // Setup periodic cleanup of expired sessions (every hour)
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    const deleted = cleanupExpiredSessions();
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} expired session(s)`);
    }
  }, CLEANUP_INTERVAL);
}

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

// Helper to get username from request
function getUsername(req) {
  // In a real app, this would extract from JWT or session
  // For now, we use a simple header or default to the configured username
  return req.headers['x-username'] || USERNAME;
}

// ===== Session API Endpoints =====

// 1. Create a new session (Protected)
app.post('/api/sessions', requireAuth, (req, res) => {
  try {
    const { name, expirationHours } = req.body || {};
    const ownerId = getUsername(req);
    
    // Validate expiration hours
    let hours = expirationHours || DEFAULT_SESSION_DURATION_HOURS;
    if (hours > MAX_SESSION_DURATION_HOURS) {
      hours = MAX_SESSION_DURATION_HOURS;
    }
    
    const session = createSession(ownerId, name, hours);
    
    return res.status(201).json({
      sessionId: session.id,
      url: session.url,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error('Error creating session:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// 2. List all sessions for authenticated user (Protected)
app.get('/api/sessions', requireAuth, (req, res) => {
  try {
    const ownerId = getUsername(req);
    const sessions = listSessionsByOwner(ownerId);
    
    return res.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// 3. Update session status or expiration (Protected)
app.patch('/api/sessions/:sessionId', requireAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    const { isActive, extendHours } = req.body || {};
    const ownerId = getUsername(req);
    
    // Check if session exists and belongs to user
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }
    if (session.ownerId !== ownerId) {
      return res.status(403).json({ error: 'forbidden' });
    }
    
    // Update active status if provided
    if (typeof isActive === 'boolean') {
      const success = toggleSessionStatus(sessionId, ownerId, isActive);
      if (!success) {
        return res.status(500).json({ error: 'update_failed' });
      }
    }
    
    // Extend expiration if requested
    if (extendHours && extendHours > 0) {
      const updated = extendSessionExpiration(sessionId, ownerId, extendHours);
      if (!updated) {
        return res.status(500).json({ error: 'extension_failed' });
      }
    }
    
    // Return updated session
    const updatedSession = getSession(sessionId);
    return res.json({ session: updatedSession });
  } catch (error) {
    console.error('Error updating session:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// 4. Delete a session (Protected)
app.delete('/api/sessions/:sessionId', requireAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    const ownerId = getUsername(req);
    
    const success = deleteSession(sessionId, ownerId);
    if (!success) {
      return res.status(404).json({ error: 'session_not_found_or_forbidden' });
    }
    
    return res.status(204).end();
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// 5. Get session data (Public - no auth required)
app.get('/api/sessions/:sessionId/data', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check if session is accessible
    if (!isSessionAccessible(sessionId)) {
      return res.status(404).json({ error: 'session_not_found_or_expired' });
    }
    
    const session = getSession(sessionId);
    return res.json({
      sessionId: session.id,
      name: session.name,
      expiresAt: session.expiresAt,
      data: session.data
    });
  } catch (error) {
    console.error('Error getting session data:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// 6. Update session data (Public - no auth required)
app.put('/api/sessions/:sessionId/data', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participants } = req.body || {};
    
    // Check if session is accessible
    if (!isSessionAccessible(sessionId)) {
      return res.status(404).json({ error: 'session_not_found_or_expired' });
    }
    
    // Validate participants data
    if (!Array.isArray(participants)) {
      return res.status(400).json({ error: 'invalid_participants_data' });
    }
    
    // Update session data
    const success = updateSession(sessionId, { participants });
    if (!success) {
      return res.status(500).json({ error: 'update_failed' });
    }
    
    // Return updated session
    const session = getSession(sessionId);
    return res.json({
      sessionId: session.id,
      data: session.data
    });
  } catch (error) {
    console.error('Error updating session data:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
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


