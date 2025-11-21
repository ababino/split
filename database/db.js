import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'split.db');

// Initialize database
let db = null;

export function initDatabase() {
  if (db) return db;
  
  db = new Database(DB_PATH);
  
  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  
  return db;
}

// Get database instance
export function getDb() {
  if (!db) {
    initDatabase();
  }
  return db;
}

// Close database (for testing)
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Create a new session
 * @param {string} ownerId - Username of the session creator
 * @param {string} name - Optional session name
 * @param {number} expirationHours - Hours until expiration (default 24)
 * @returns {Object} Session object with id, url, expiresAt
 */
export function createSession(ownerId, name = null, expirationHours = 24) {
  const database = getDb();
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
    url: `/session/${sessionId}`
  };
}

/**
 * Get a session by ID
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session object or null if not found
 */
export function getSession(sessionId) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT id, owner_id, name, created_at, expires_at, is_active, data
    FROM sessions
    WHERE id = ?
  `);
  
  const row = stmt.get(sessionId);
  if (!row) return null;
  
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isActive: Boolean(row.is_active),
    data: JSON.parse(row.data),
    url: `/session/${row.id}`
  };
}

/**
 * Check if a session is accessible (active and not expired)
 * @param {string} sessionId - Session ID
 * @returns {boolean} True if accessible
 */
export function isSessionAccessible(sessionId) {
  const session = getSession(sessionId);
  if (!session) return false;
  
  const now = Date.now();
  return session.isActive && session.expiresAt > now;
}

/**
 * Update session data
 * @param {string} sessionId - Session ID
 * @param {Object} data - New data object
 * @returns {boolean} True if updated successfully
 */
export function updateSession(sessionId, data) {
  const database = getDb();
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
 * @param {string} ownerId - Owner's username
 * @returns {Array} Array of session objects
 */
export function listSessionsByOwner(ownerId) {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT id, owner_id, name, created_at, expires_at, is_active, data
    FROM sessions
    WHERE owner_id = ?
    ORDER BY created_at DESC
  `);
  
  const rows = stmt.all(ownerId);
  const now = Date.now();
  
  return rows.map(row => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isActive: Boolean(row.is_active),
    isExpired: row.expires_at <= now,
    url: `/session/${row.id}`,
    participantCount: JSON.parse(row.data).participants?.length || 0
  }));
}

/**
 * Delete a session
 * @param {string} sessionId - Session ID
 * @param {string} ownerId - Owner's username (for authorization)
 * @returns {boolean} True if deleted successfully
 */
export function deleteSession(sessionId, ownerId) {
  const database = getDb();
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
 * @param {string} ownerId - Owner's username (for authorization)
 * @param {boolean} isActive - New active status
 * @returns {boolean} True if updated successfully
 */
export function toggleSessionStatus(sessionId, ownerId, isActive) {
  const database = getDb();
  const stmt = database.prepare(`
    UPDATE sessions
    SET is_active = ?
    WHERE id = ? AND owner_id = ?
  `);
  
  const result = stmt.run(isActive ? 1 : 0, sessionId, ownerId);
  return result.changes > 0;
}

/**
 * Extend session expiration
 * @param {string} sessionId - Session ID
 * @param {string} ownerId - Owner's username (for authorization)
 * @param {number} additionalHours - Hours to add to expiration
 * @returns {Object|null} Updated session or null if failed
 */
export function extendSessionExpiration(sessionId, ownerId, additionalHours) {
  const database = getDb();
  
  // First check if session exists and belongs to owner
  const session = getSession(sessionId);
  if (!session || session.ownerId !== ownerId) {
    return null;
  }
  
  const newExpiresAt = session.expiresAt + (additionalHours * 60 * 60 * 1000);
  
  const stmt = database.prepare(`
    UPDATE sessions
    SET expires_at = ?
    WHERE id = ? AND owner_id = ?
  `);
  
  const result = stmt.run(newExpiresAt, sessionId, ownerId);
  if (result.changes === 0) return null;
  
  return getSession(sessionId);
}

/**
 * Clean up expired sessions
 * @returns {number} Number of sessions deleted
 */
export function cleanupExpiredSessions() {
  const database = getDb();
  const now = Date.now();
  
  const stmt = database.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= ?
  `);
  
  const result = stmt.run(now);
  return result.changes;
}

