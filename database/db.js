import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - use test DB if in test environment
const DB_PATH = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, 'split-test.db')
  : path.join(__dirname, 'split.db');

let db = null;

/**
 * Initialize the database connection and create tables
 */
export function initDatabase() {
  if (db) {
    return db;
  }

  db = new Database(DB_PATH);
  
  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  
  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

/**
 * Create a new session
 * @param {string} ownerId - Username of the session creator
 * @param {string} name - Optional session name
 * @param {number} expirationHours - Hours until expiration (default: 24)
 * @returns {object} Session object with id, url, and expiresAt
 */
export function createSession(ownerId, name = null, expirationHours = 24) {
  const database = getDatabase();
  const sessionId = uuidv4();
  const now = Date.now();
  const expiresAt = now + (expirationHours * 60 * 60 * 1000);
  
  const stmt = database.prepare(`
    INSERT INTO sessions (id, owner_id, name, created_at, expires_at, is_active, data)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  
  stmt.run(sessionId, ownerId, name, now, expiresAt, JSON.stringify({ participants: [] }));
  
  return {
    id: sessionId,
    ownerId,
    name,
    createdAt: now,
    expiresAt,
    isActive: true,
    url: `/session/${sessionId}`,
    data: { participants: [] }
  };
}

/**
 * Get a session by ID
 * @param {string} sessionId - Session ID
 * @returns {object|null} Session object or null if not found
 */
export function getSession(sessionId) {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT id, owner_id, name, created_at, expires_at, is_active, data
    FROM sessions
    WHERE id = ?
  `);
  
  const row = stmt.get(sessionId);
  
  if (!row) {
    return null;
  }
  
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isActive: Boolean(row.is_active),
    url: `/session/${row.id}`,
    data: JSON.parse(row.data)
  };
}

/**
 * Update session data (participants)
 * @param {string} sessionId - Session ID
 * @param {object} data - New data object with participants array
 * @returns {boolean} True if successful, false otherwise
 */
export function updateSession(sessionId, data) {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE sessions
    SET data = ?
    WHERE id = ?
  `);
  
  const result = stmt.run(JSON.stringify(data), sessionId);
  return result.changes > 0;
}

/**
 * List all sessions for a specific owner
 * @param {string} ownerId - Username of the session owner
 * @returns {array} Array of session objects
 */
export function listSessionsByOwner(ownerId) {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT id, owner_id, name, created_at, expires_at, is_active, data
    FROM sessions
    WHERE owner_id = ?
    ORDER BY created_at DESC
  `);
  
  const rows = stmt.all(ownerId);
  
  return rows.map(row => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isActive: Boolean(row.is_active),
    url: `/session/${row.id}`,
    data: JSON.parse(row.data)
  }));
}

/**
 * Delete a session (only if owned by the specified user)
 * @param {string} sessionId - Session ID
 * @param {string} ownerId - Username of the session owner
 * @returns {boolean} True if deleted, false otherwise
 */
export function deleteSession(sessionId, ownerId) {
  const database = getDatabase();
  const stmt = database.prepare(`
    DELETE FROM sessions
    WHERE id = ? AND owner_id = ?
  `);
  
  const result = stmt.run(sessionId, ownerId);
  return result.changes > 0;
}

/**
 * Toggle session active status
 * @param {string} sessionId - Session ID
 * @param {string} ownerId - Username of the session owner
 * @param {boolean} isActive - New active status
 * @returns {boolean} True if updated, false otherwise
 */
export function toggleSessionStatus(sessionId, ownerId, isActive) {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE sessions
    SET is_active = ?
    WHERE id = ? AND owner_id = ?
  `);
  
  const result = stmt.run(isActive ? 1 : 0, sessionId, ownerId);
  return result.changes > 0;
}

/**
 * Extend session expiration time
 * @param {string} sessionId - Session ID
 * @param {string} ownerId - Username of the session owner
 * @param {number} additionalHours - Hours to add to expiration
 * @returns {boolean} True if updated, false otherwise
 */
export function extendSessionExpiration(sessionId, ownerId, additionalHours) {
  const database = getDatabase();
  
  // Get current expiration
  const session = getSession(sessionId);
  if (!session || session.ownerId !== ownerId) {
    return false;
  }
  
  const newExpiresAt = session.expiresAt + (additionalHours * 60 * 60 * 1000);
  
  const stmt = database.prepare(`
    UPDATE sessions
    SET expires_at = ?
    WHERE id = ? AND owner_id = ?
  `);
  
  const result = stmt.run(newExpiresAt, sessionId, ownerId);
  return result.changes > 0;
}

/**
 * Clean up expired sessions
 * @returns {number} Number of sessions deleted
 */
export function cleanupExpiredSessions() {
  const database = getDatabase();
  const now = Date.now();
  
  const stmt = database.prepare(`
    DELETE FROM sessions
    WHERE expires_at < ?
  `);
  
  const result = stmt.run(now);
  return result.changes;
}

/**
 * Check if a session is valid (exists, active, and not expired)
 * @param {string} sessionId - Session ID
 * @returns {boolean} True if valid, false otherwise
 */
export function isSessionValid(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return false;
  }
  
  const now = Date.now();
  return session.isActive && session.expiresAt > now;
}

// Initialize database on module load
if (process.env.NODE_ENV !== 'test') {
  initDatabase();
}

