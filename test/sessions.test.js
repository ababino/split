import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a test database
const TEST_DB_PATH = path.join(__dirname, 'test-sessions.db');
process.env.DB_PATH = TEST_DB_PATH;

// Import database functions after setting DB_PATH
const dbModule = await import('../database/db.js');
const {
  initDatabase,
  closeDatabase,
  createSession,
  getSession,
  updateSession,
  listSessionsByOwner,
  deleteSession,
  toggleSessionStatus,
  extendSessionExpiration,
  cleanupExpiredSessions,
  isSessionAccessible
} = dbModule;

describe('Database Layer - Sessions', () => {
  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('createSession', () => {
    it('creates a session with default values', () => {
      const session = createSession('user1');
      
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.ownerId).toBe('user1');
      expect(session.name).toBeNull();
      expect(session.isActive).toBe(true);
      expect(session.url).toBe(`/session/${session.id}`);
      expect(session.expiresAt).toBeGreaterThan(Date.now());
    });

    it('creates a session with custom name and expiration', () => {
      const session = createSession('user1', 'My Session', 48);
      
      expect(session.name).toBe('My Session');
      const expectedExpiration = Date.now() + (48 * 60 * 60 * 1000);
      expect(session.expiresAt).toBeGreaterThanOrEqual(expectedExpiration - 1000);
      expect(session.expiresAt).toBeLessThanOrEqual(expectedExpiration + 1000);
    });
  });

  describe('getSession', () => {
    it('retrieves a session by ID', () => {
      const created = createSession('user1', 'Test Session');
      const retrieved = getSession(created.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.ownerId).toBe('user1');
      expect(retrieved.name).toBe('Test Session');
      expect(retrieved.data).toEqual({ participants: [] });
    });

    it('returns null for non-existent session', () => {
      const session = getSession('non-existent-id');
      expect(session).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('updates session data', () => {
      const session = createSession('user1');
      const newData = {
        participants: [
          { name: 'Alice', amount: 100 },
          { name: 'Bob', amount: 50 }
        ]
      };
      
      const success = updateSession(session.id, newData);
      expect(success).toBe(true);
      
      const updated = getSession(session.id);
      expect(updated.data).toEqual(newData);
    });

    it('returns false for non-existent session', () => {
      const success = updateSession('non-existent-id', { participants: [] });
      expect(success).toBe(false);
    });
  });

  describe('listSessionsByOwner', () => {
    it('lists all sessions for an owner', async () => {
      const session1 = createSession('user1', 'Session 1');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const session2 = createSession('user1', 'Session 2');
      createSession('user2', 'Session 3');
      
      const sessions = listSessionsByOwner('user1');
      
      expect(sessions).toHaveLength(2);
      // Most recent first, check by ID
      expect(sessions[0].id).toBe(session2.id);
      expect(sessions[1].id).toBe(session1.id);
      expect(sessions[0].ownerId).toBe('user1');
    });

    it('returns empty array for owner with no sessions', () => {
      const sessions = listSessionsByOwner('no-sessions-user');
      expect(sessions).toEqual([]);
    });

    it('includes expired status', () => {
      // Create an already expired session (negative hours)
      const session = createSession('user1', 'Expired', -1);
      
      const sessions = listSessionsByOwner('user1');
      expect(sessions[0].isExpired).toBe(true);
    });
  });

  describe('deleteSession', () => {
    it('deletes a session by owner', () => {
      const session = createSession('user1');
      
      const success = deleteSession(session.id, 'user1');
      expect(success).toBe(true);
      
      const retrieved = getSession(session.id);
      expect(retrieved).toBeNull();
    });

    it('prevents deletion by non-owner', () => {
      const session = createSession('user1');
      
      const success = deleteSession(session.id, 'user2');
      expect(success).toBe(false);
      
      const retrieved = getSession(session.id);
      expect(retrieved).toBeDefined();
    });
  });

  describe('toggleSessionStatus', () => {
    it('toggles session active status', () => {
      const session = createSession('user1');
      expect(session.isActive).toBe(true);
      
      const success = toggleSessionStatus(session.id, 'user1', false);
      expect(success).toBe(true);
      
      const updated = getSession(session.id);
      expect(updated.isActive).toBe(false);
    });

    it('prevents status change by non-owner', () => {
      const session = createSession('user1');
      
      const success = toggleSessionStatus(session.id, 'user2', false);
      expect(success).toBe(false);
      
      const retrieved = getSession(session.id);
      expect(retrieved.isActive).toBe(true);
    });
  });

  describe('extendSessionExpiration', () => {
    it('extends session expiration', () => {
      const session = createSession('user1', null, 24);
      const originalExpiration = session.expiresAt;
      
      const extended = extendSessionExpiration(session.id, 'user1', 24);
      expect(extended).toBeDefined();
      expect(extended.expiresAt).toBeGreaterThan(originalExpiration);
      
      const expectedNewExpiration = originalExpiration + (24 * 60 * 60 * 1000);
      expect(extended.expiresAt).toBeGreaterThanOrEqual(expectedNewExpiration - 1000);
      expect(extended.expiresAt).toBeLessThanOrEqual(expectedNewExpiration + 1000);
    });

    it('prevents extension by non-owner', () => {
      const session = createSession('user1');
      
      const extended = extendSessionExpiration(session.id, 'user2', 24);
      expect(extended).toBeNull();
    });
  });

  describe('isSessionAccessible', () => {
    it('returns true for active, non-expired session', () => {
      const session = createSession('user1');
      expect(isSessionAccessible(session.id)).toBe(true);
    });

    it('returns false for inactive session', () => {
      const session = createSession('user1');
      toggleSessionStatus(session.id, 'user1', false);
      
      expect(isSessionAccessible(session.id)).toBe(false);
    });

    it('returns false for expired session', () => {
      const session = createSession('user1', null, -1); // Already expired
      expect(isSessionAccessible(session.id)).toBe(false);
    });

    it('returns false for non-existent session', () => {
      expect(isSessionAccessible('non-existent')).toBe(false);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('removes expired sessions', () => {
      createSession('user1', 'Active', 24);
      createSession('user1', 'Expired', -1);
      createSession('user2', 'Also Expired', -1);
      
      const deleted = cleanupExpiredSessions();
      expect(deleted).toBe(2);
      
      const remaining = listSessionsByOwner('user1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Active');
    });

    it('returns 0 when no sessions are expired', () => {
      createSession('user1', 'Active', 24);
      
      const deleted = cleanupExpiredSessions();
      expect(deleted).toBe(0);
    });
  });
});

