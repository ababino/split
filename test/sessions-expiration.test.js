import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a test database
const TEST_DB_PATH = path.join(__dirname, 'test-expiration.db');
process.env.DB_PATH = TEST_DB_PATH;

// Import database functions after setting DB_PATH
const dbModule = await import('../database/db.js');
const {
  initDatabase,
  closeDatabase,
  createSession,
  isSessionAccessible,
  cleanupExpiredSessions,
  listSessionsByOwner
} = dbModule;

describe('Session Expiration Logic', () => {
  beforeEach(() => {
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

  describe('Session expiration timing', () => {
    it('session is accessible immediately after creation', () => {
      const session = createSession('user1', null, 24);
      expect(isSessionAccessible(session.id)).toBe(true);
    });

    it('session expires after the specified duration', () => {
      // Create session that expires in the past
      const session = createSession('user1', null, -1);
      expect(isSessionAccessible(session.id)).toBe(false);
    });

    it('session is accessible just before expiration', () => {
      // Create session with 1 second expiration
      const session = createSession('user1', null, 1/3600); // 1 second in hours
      expect(isSessionAccessible(session.id)).toBe(true);
    });

    it('multiple sessions with different expirations', () => {
      const active1 = createSession('user1', 'Active 1', 24);
      const active2 = createSession('user1', 'Active 2', 48);
      const expired = createSession('user1', 'Expired', -1);

      expect(isSessionAccessible(active1.id)).toBe(true);
      expect(isSessionAccessible(active2.id)).toBe(true);
      expect(isSessionAccessible(expired.id)).toBe(false);
    });
  });

  describe('Cleanup behavior', () => {
    it('cleanup removes only expired sessions', () => {
      createSession('user1', 'Active', 24);
      createSession('user1', 'Expired 1', -1);
      createSession('user1', 'Expired 2', -2);
      createSession('user2', 'Active 2', 48);
      createSession('user2', 'Expired 3', -1);

      const deleted = cleanupExpiredSessions();
      expect(deleted).toBe(3);

      const user1Sessions = listSessionsByOwner('user1');
      expect(user1Sessions).toHaveLength(1);
      expect(user1Sessions[0].name).toBe('Active');

      const user2Sessions = listSessionsByOwner('user2');
      expect(user2Sessions).toHaveLength(1);
      expect(user2Sessions[0].name).toBe('Active 2');
    });

    it('cleanup is idempotent', () => {
      createSession('user1', 'Expired', -1);

      const deleted1 = cleanupExpiredSessions();
      expect(deleted1).toBe(1);

      const deleted2 = cleanupExpiredSessions();
      expect(deleted2).toBe(0);
    });

    it('cleanup with no expired sessions returns 0', () => {
      createSession('user1', 'Active', 24);
      createSession('user2', 'Active 2', 48);

      const deleted = cleanupExpiredSessions();
      expect(deleted).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('handles session expiring at exact timestamp', () => {
      // Create a session
      const session = createSession('user1', null, 1);
      
      // Session should be accessible now
      expect(isSessionAccessible(session.id)).toBe(true);
      
      // Manually update expiration to current time
      const db = dbModule.getDb();
      const now = Date.now();
      db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(now, session.id);
      
      // Should not be accessible at exact expiration time
      expect(isSessionAccessible(session.id)).toBe(false);
    });

    it('lists sessions with accurate expiration status', () => {
      createSession('user1', 'Active', 24);
      createSession('user1', 'Just Expired', 0);
      createSession('user1', 'Long Expired', -24);

      const sessions = listSessionsByOwner('user1');
      expect(sessions).toHaveLength(3);
      
      const activeSession = sessions.find(s => s.name === 'Active');
      expect(activeSession.isExpired).toBe(false);
      
      const justExpiredSession = sessions.find(s => s.name === 'Just Expired');
      expect(justExpiredSession.isExpired).toBe(true);
      
      const longExpiredSession = sessions.find(s => s.name === 'Long Expired');
      expect(longExpiredSession.isExpired).toBe(true);
    });

    it('very long expiration times work correctly', () => {
      // 7 days
      const session = createSession('user1', 'Long Session', 168);
      
      expect(isSessionAccessible(session.id)).toBe(true);
      
      const expectedExpiration = Date.now() + (168 * 60 * 60 * 1000);
      expect(session.expiresAt).toBeGreaterThanOrEqual(expectedExpiration - 1000);
      expect(session.expiresAt).toBeLessThanOrEqual(expectedExpiration + 1000);
    });

    it('inactive sessions are not accessible even if not expired', () => {
      const session = createSession('user1', null, 24);
      expect(isSessionAccessible(session.id)).toBe(true);
      
      // Deactivate the session
      const db = dbModule.getDb();
      db.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').run(session.id);
      
      expect(isSessionAccessible(session.id)).toBe(false);
    });
  });

  describe('Performance with many sessions', () => {
    it('cleanup handles large number of expired sessions efficiently', () => {
      // Create many expired sessions
      for (let i = 0; i < 100; i++) {
        createSession(`user${i}`, `Expired ${i}`, -1);
      }
      
      // Create some active sessions
      for (let i = 0; i < 10; i++) {
        createSession(`user${i}`, `Active ${i}`, 24);
      }
      
      const startTime = Date.now();
      const deleted = cleanupExpiredSessions();
      const endTime = Date.now();
      
      expect(deleted).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });
});

