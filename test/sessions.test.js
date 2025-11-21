import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
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
  isSessionValid
} from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database path
const TEST_DB_PATH = path.join(__dirname, '..', 'database', 'split-test.db');

describe('Database Initialization', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    closeDatabase();
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    // Clean up WAL files
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
  });

  it('should initialize database successfully', () => {
    const db = initDatabase();
    expect(db).toBeTruthy();
    expect(db.open).toBe(true);
  });

  it('should create sessions table', () => {
    const db = initDatabase();
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'");
    const table = stmt.get();
    expect(table).toBeTruthy();
    expect(table.name).toBe('sessions');
  });
});

describe('Session CRUD Operations', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    initDatabase();
  });

  beforeEach(() => {
    // Clean database before each test
    const db = initDatabase();
    db.prepare('DELETE FROM sessions').run();
  });

  afterAll(() => {
    closeDatabase();
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
  });

  describe('createSession', () => {
    it('should create a session with default parameters', () => {
      const session = createSession('user1');
      
      expect(session).toBeTruthy();
      expect(session.id).toBeTruthy();
      expect(session.ownerId).toBe('user1');
      expect(session.name).toBe(null);
      expect(session.createdAt).toBeTruthy();
      expect(session.expiresAt).toBeTruthy();
      expect(session.isActive).toBe(true);
      expect(session.url).toBe(`/session/${session.id}`);
      expect(session.data).toEqual({ participants: [] });
    });

    it('should create a session with a name', () => {
      const session = createSession('user1', 'Team Lunch');
      
      expect(session.name).toBe('Team Lunch');
      expect(session.ownerId).toBe('user1');
    });

    it('should create a session with custom expiration', () => {
      const session = createSession('user1', 'Short Session', 1);
      
      const expectedExpiration = session.createdAt + (1 * 60 * 60 * 1000);
      expect(session.expiresAt).toBe(expectedExpiration);
    });

    it('should create sessions with unique IDs', () => {
      const session1 = createSession('user1');
      const session2 = createSession('user1');
      
      expect(session1.id).not.toBe(session2.id);
    });

    it('should default to 24 hours expiration', () => {
      const session = createSession('user1');
      
      const expectedExpiration = session.createdAt + (24 * 60 * 60 * 1000);
      expect(session.expiresAt).toBe(expectedExpiration);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', () => {
      const created = createSession('user1', 'Test Session');
      const retrieved = getSession(created.id);
      
      expect(retrieved).toBeTruthy();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.ownerId).toBe('user1');
      expect(retrieved.name).toBe('Test Session');
      expect(retrieved.isActive).toBe(true);
    });

    it('should return null for non-existent session', () => {
      const session = getSession('non-existent-id');
      expect(session).toBe(null);
    });

    it('should parse data JSON correctly', () => {
      const created = createSession('user1');
      const retrieved = getSession(created.id);
      
      expect(retrieved.data).toEqual({ participants: [] });
      expect(Array.isArray(retrieved.data.participants)).toBe(true);
    });
  });

  describe('updateSession', () => {
    it('should update session data', () => {
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
      expect(updated.data.participants).toHaveLength(2);
    });

    it('should return false for non-existent session', () => {
      const success = updateSession('non-existent-id', { participants: [] });
      expect(success).toBe(false);
    });

    it('should preserve other session properties when updating data', () => {
      const session = createSession('user1', 'Test');
      
      updateSession(session.id, {
        participants: [{ name: 'Alice', amount: 100 }]
      });
      
      const updated = getSession(session.id);
      expect(updated.ownerId).toBe('user1');
      expect(updated.name).toBe('Test');
      expect(updated.isActive).toBe(true);
    });
  });

  describe('listSessionsByOwner', () => {
    it('should return empty array for user with no sessions', () => {
      const sessions = listSessionsByOwner('user1');
      expect(sessions).toEqual([]);
    });

    it('should return all sessions for an owner', () => {
      createSession('user1', 'Session 1');
      createSession('user1', 'Session 2');
      createSession('user2', 'Session 3');
      
      const user1Sessions = listSessionsByOwner('user1');
      expect(user1Sessions).toHaveLength(2);
      expect(user1Sessions.every(s => s.ownerId === 'user1')).toBe(true);
    });

    it('should return sessions in descending order by creation date', () => {
      const session1 = createSession('user1', 'First');
      // Small delay to ensure different timestamps
      const session2 = createSession('user1', 'Second');
      
      const sessions = listSessionsByOwner('user1');
      expect(sessions[0].createdAt).toBeGreaterThanOrEqual(sessions[1].createdAt);
    });

    it('should not return sessions from other owners', () => {
      createSession('user1', 'User1 Session');
      createSession('user2', 'User2 Session');
      
      const user1Sessions = listSessionsByOwner('user1');
      const user2Sessions = listSessionsByOwner('user2');
      
      expect(user1Sessions).toHaveLength(1);
      expect(user2Sessions).toHaveLength(1);
      expect(user1Sessions[0].name).toBe('User1 Session');
      expect(user2Sessions[0].name).toBe('User2 Session');
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session', () => {
      const session = createSession('user1', 'To Delete');
      
      const success = deleteSession(session.id, 'user1');
      expect(success).toBe(true);
      
      const retrieved = getSession(session.id);
      expect(retrieved).toBe(null);
    });

    it('should not delete session if owner does not match', () => {
      const session = createSession('user1', 'Protected');
      
      const success = deleteSession(session.id, 'user2');
      expect(success).toBe(false);
      
      const retrieved = getSession(session.id);
      expect(retrieved).toBeTruthy();
    });

    it('should return false for non-existent session', () => {
      const success = deleteSession('non-existent-id', 'user1');
      expect(success).toBe(false);
    });
  });

  describe('toggleSessionStatus', () => {
    it('should toggle session to inactive', () => {
      const session = createSession('user1');
      
      const success = toggleSessionStatus(session.id, 'user1', false);
      expect(success).toBe(true);
      
      const updated = getSession(session.id);
      expect(updated.isActive).toBe(false);
    });

    it('should toggle session to active', () => {
      const session = createSession('user1');
      toggleSessionStatus(session.id, 'user1', false);
      
      const success = toggleSessionStatus(session.id, 'user1', true);
      expect(success).toBe(true);
      
      const updated = getSession(session.id);
      expect(updated.isActive).toBe(true);
    });

    it('should not toggle status if owner does not match', () => {
      const session = createSession('user1');
      
      const success = toggleSessionStatus(session.id, 'user2', false);
      expect(success).toBe(false);
      
      const updated = getSession(session.id);
      expect(updated.isActive).toBe(true);
    });

    it('should return false for non-existent session', () => {
      const success = toggleSessionStatus('non-existent-id', 'user1', false);
      expect(success).toBe(false);
    });
  });

  describe('extendSessionExpiration', () => {
    it('should extend session expiration', () => {
      const session = createSession('user1', 'Test', 24);
      const originalExpiration = session.expiresAt;
      
      const success = extendSessionExpiration(session.id, 'user1', 24);
      expect(success).toBe(true);
      
      const updated = getSession(session.id);
      const expectedExpiration = originalExpiration + (24 * 60 * 60 * 1000);
      expect(updated.expiresAt).toBe(expectedExpiration);
    });

    it('should not extend if owner does not match', () => {
      const session = createSession('user1');
      const originalExpiration = session.expiresAt;
      
      const success = extendSessionExpiration(session.id, 'user2', 24);
      expect(success).toBe(false);
      
      const updated = getSession(session.id);
      expect(updated.expiresAt).toBe(originalExpiration);
    });

    it('should return false for non-existent session', () => {
      const success = extendSessionExpiration('non-existent-id', 'user1', 24);
      expect(success).toBe(false);
    });

    it('should handle small extension periods', () => {
      const session = createSession('user1');
      const originalExpiration = session.expiresAt;
      
      const success = extendSessionExpiration(session.id, 'user1', 1);
      expect(success).toBe(true);
      
      const updated = getSession(session.id);
      const expectedExpiration = originalExpiration + (1 * 60 * 60 * 1000);
      expect(updated.expiresAt).toBe(expectedExpiration);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', () => {
      // Create an expired session (0.001 hours = 3.6 seconds)
      const expiredSession = createSession('user1', 'Expired', 0.0001);
      const activeSession = createSession('user1', 'Active', 24);
      
      // Wait for expiration
      return new Promise(resolve => {
        setTimeout(() => {
          const cleaned = cleanupExpiredSessions();
          expect(cleaned).toBeGreaterThanOrEqual(1);
          
          const expired = getSession(expiredSession.id);
          const active = getSession(activeSession.id);
          
          expect(expired).toBe(null);
          expect(active).toBeTruthy();
          resolve();
        }, 500);
      });
    });

    it('should return 0 when no sessions are expired', () => {
      createSession('user1', 'Active 1', 24);
      createSession('user1', 'Active 2', 24);
      
      const cleaned = cleanupExpiredSessions();
      expect(cleaned).toBe(0);
    });

    it('should clean up multiple expired sessions', () => {
      createSession('user1', 'Expired 1', 0.0001);
      createSession('user1', 'Expired 2', 0.0001);
      createSession('user1', 'Active', 24);
      
      return new Promise(resolve => {
        setTimeout(() => {
          const cleaned = cleanupExpiredSessions();
          expect(cleaned).toBe(2);
          
          const remaining = listSessionsByOwner('user1');
          expect(remaining).toHaveLength(1);
          expect(remaining[0].name).toBe('Active');
          resolve();
        }, 500);
      });
    });
  });

  describe('isSessionValid', () => {
    it('should return true for active, non-expired session', () => {
      const session = createSession('user1', 'Valid', 24);
      const isValid = isSessionValid(session.id);
      expect(isValid).toBe(true);
    });

    it('should return false for inactive session', () => {
      const session = createSession('user1', 'Inactive');
      toggleSessionStatus(session.id, 'user1', false);
      
      const isValid = isSessionValid(session.id);
      expect(isValid).toBe(false);
    });

    it('should return false for expired session', () => {
      const session = createSession('user1', 'Expired', 0.0001);
      
      return new Promise(resolve => {
        setTimeout(() => {
          const isValid = isSessionValid(session.id);
          expect(isValid).toBe(false);
          resolve();
        }, 500);
      });
    });

    it('should return false for non-existent session', () => {
      const isValid = isSessionValid('non-existent-id');
      expect(isValid).toBe(false);
    });

    it('should return false for expired but active session', () => {
      const session = createSession('user1', 'Expired Active', 0.0001);
      
      return new Promise(resolve => {
        setTimeout(() => {
          const retrieved = getSession(session.id);
          expect(retrieved.isActive).toBe(true);
          
          const isValid = isSessionValid(session.id);
          expect(isValid).toBe(false);
          resolve();
        }, 500);
      });
    });

    it('should return false for inactive but not expired session', () => {
      const session = createSession('user1', 'Inactive Valid', 24);
      toggleSessionStatus(session.id, 'user1', false);
      
      const retrieved = getSession(session.id);
      expect(retrieved.expiresAt).toBeGreaterThan(Date.now());
      
      const isValid = isSessionValid(session.id);
      expect(isValid).toBe(false);
    });
  });
});

describe('Complex Scenarios', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    initDatabase();
  });

  beforeEach(() => {
    // Clean database before each test
    const db = initDatabase();
    db.prepare('DELETE FROM sessions').run();
  });

  afterAll(() => {
    closeDatabase();
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
  });

  it('should handle multiple operations on same session', () => {
    const session = createSession('user1', 'Multi-Op', 24);
    
    // Update data
    updateSession(session.id, {
      participants: [
        { name: 'Alice', amount: 100 },
        { name: 'Bob', amount: 50 }
      ]
    });
    
    // Toggle status
    toggleSessionStatus(session.id, 'user1', false);
    
    // Extend expiration
    const originalExpiration = session.expiresAt;
    extendSessionExpiration(session.id, 'user1', 12);
    
    const final = getSession(session.id);
    expect(final.data.participants).toHaveLength(2);
    expect(final.isActive).toBe(false);
    expect(final.expiresAt).toBe(originalExpiration + (12 * 60 * 60 * 1000));
  });

  it('should handle multiple users with multiple sessions', () => {
    createSession('user1', 'U1-S1');
    createSession('user1', 'U1-S2');
    createSession('user2', 'U2-S1');
    createSession('user2', 'U2-S2');
    createSession('user2', 'U2-S3');
    
    const user1Sessions = listSessionsByOwner('user1');
    const user2Sessions = listSessionsByOwner('user2');
    
    expect(user1Sessions).toHaveLength(2);
    expect(user2Sessions).toHaveLength(3);
  });

  it('should persist data correctly with complex participant arrays', () => {
    const session = createSession('user1', 'Complex Data');
    
    const complexData = {
      participants: [
        { name: 'Alice', amount: 125.50 },
        { name: 'Bob', amount: 75.25 },
        { name: 'Charlie', amount: 200.00 },
        { name: 'David', amount: 50.75 }
      ]
    };
    
    updateSession(session.id, complexData);
    
    const retrieved = getSession(session.id);
    expect(retrieved.data).toEqual(complexData);
    expect(retrieved.data.participants[0].amount).toBe(125.50);
  });
});

