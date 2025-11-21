import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'url';
import path from 'path';
import { initDatabase, createSession, updateSession, getSession, toggleSessionStatus } from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let app;

describe('Phase 4: Session Interaction Logic', () => {
  beforeEach(async () => {
    process.env.LOGIN_USERNAME = 'testuser';
    process.env.LOGIN_PASSWORD = 'testpass';
    process.env.SESSION_SECRET = 'test-secret';
    process.env.DEFAULT_SESSION_DURATION_HOURS = '24';
    
    // Initialize database before importing server
    initDatabase();
    
    const mod = await import(path.join(__dirname, '..', 'server.js') + '?t=' + Date.now());
    app = mod.default;
  });

  describe('Auto-save functionality', () => {
    it('should save session data via PUT endpoint', async () => {
      // Create a session
      const session = createSession('testuser', 'Test Session', 24);
      
      // Update session data
      const participants = [
        { name: 'Alice', amount: 100 },
        { name: 'Bob', amount: 50 }
      ];
      
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('sessionId', session.id);
      expect(res.body.data).toHaveProperty('participants');
      expect(res.body.data.participants).toHaveLength(2);
      expect(res.body.data.participants[0].name).toBe('Alice');
    });

    it('should validate participants data format', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Send invalid data (not an array)
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: 'invalid' })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'invalid_participants_data');
    });

    it('should handle empty participants array', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: [] })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.participants).toHaveLength(0);
    });

    it('should preserve existing data structure when updating', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // First update
      const participants1 = [{ name: 'Alice', amount: 100 }];
      await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: participants1 })
        .set('Content-Type', 'application/json');
      
      // Second update
      const participants2 = [
        { name: 'Alice', amount: 150 },
        { name: 'Bob', amount: 75 }
      ];
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: participants2 })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.participants).toHaveLength(2);
      expect(res.body.data.participants[0].amount).toBe(150);
    });
  });

  describe('Polling for updates functionality', () => {
    it('should return current session data on GET', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Add some data
      const participants = [
        { name: 'Charlie', amount: 200 },
        { name: 'Diana', amount: 100 }
      ];
      updateSession(session.id, { participants });
      
      // Poll for data
      const res = await request(app)
        .get(`/api/sessions/${session.id}/data`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('sessionId', session.id);
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.data.participants).toHaveLength(2);
      expect(res.body.data.participants[0].name).toBe('Charlie');
    });

    it('should reflect concurrent updates from multiple users', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // User 1 updates
      const participants1 = [{ name: 'User1', amount: 50 }];
      await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: participants1 })
        .set('Content-Type', 'application/json');
      
      // User 2 polls and sees User 1's data
      let res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.body.data.participants).toHaveLength(1);
      expect(res.body.data.participants[0].name).toBe('User1');
      
      // User 2 updates
      const participants2 = [
        { name: 'User1', amount: 50 },
        { name: 'User2', amount: 75 }
      ];
      await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: participants2 })
        .set('Content-Type', 'application/json');
      
      // User 1 polls and sees User 2's update
      res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.body.data.participants).toHaveLength(2);
      expect(res.body.data.participants[1].name).toBe('User2');
    });

    it('should return session metadata for status updates', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      const res = await request(app).get(`/api/sessions/${session.id}/data`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('sessionId');
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('expiresAt');
      expect(typeof res.body.expiresAt).toBe('number');
      expect(res.body.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('Expired session handling', () => {
    it('should return 404 for expired session GET request', async () => {
      // Create an expired session (expiration in the past)
      const session = createSession('testuser', 'Expired Session', -1);
      
      const res = await request(app).get(`/api/sessions/${session.id}/data`);
      
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'session_not_found_or_expired');
    });

    it('should return 404 for expired session PUT request', async () => {
      const session = createSession('testuser', 'Expired Session', -1);
      
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: [{ name: 'Test', amount: 100 }] })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'session_not_found_or_expired');
    });

    it('should not allow updates to expired sessions', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Add initial data
      updateSession(session.id, { participants: [{ name: 'Alice', amount: 100 }] });
      
      // Verify data exists
      let sessionData = getSession(session.id);
      expect(sessionData.data.participants).toHaveLength(1);
      
      // Manually expire the session by setting expiresAt to past
      const db = await import('../database/db.js');
      const stmt = db.getDb().prepare('UPDATE sessions SET expires_at = ? WHERE id = ?');
      stmt.run(Date.now() - 1000, session.id);
      
      // Try to update expired session
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: [{ name: 'Bob', amount: 200 }] })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Disabled session handling', () => {
    it('should return 404 for disabled session GET request', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Disable the session
      toggleSessionStatus(session.id, 'testuser', false);
      
      const res = await request(app).get(`/api/sessions/${session.id}/data`);
      
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'session_not_found_or_expired');
    });

    it('should return 404 for disabled session PUT request', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      toggleSessionStatus(session.id, 'testuser', false);
      
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: [{ name: 'Test', amount: 100 }] })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'session_not_found_or_expired');
    });

    it('should prevent updates when session is disabled', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Add data while active
      await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: [{ name: 'Alice', amount: 100 }] })
        .set('Content-Type', 'application/json');
      
      // Disable session
      toggleSessionStatus(session.id, 'testuser', false);
      
      // Try to update
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants: [{ name: 'Bob', amount: 200 }] })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(404);
      
      // Re-enable and verify old data is preserved
      toggleSessionStatus(session.id, 'testuser', true);
      const getRes = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(getRes.body.data.participants[0].name).toBe('Alice');
    });
  });

  describe('Non-existent session handling', () => {
    it('should return 404 for non-existent session GET', async () => {
      const res = await request(app).get('/api/sessions/nonexistent123/data');
      
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'session_not_found_or_expired');
    });

    it('should return 404 for non-existent session PUT', async () => {
      const res = await request(app)
        .put('/api/sessions/nonexistent456/data')
        .send({ participants: [{ name: 'Test', amount: 100 }] })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'session_not_found_or_expired');
    });
  });

  describe('Data persistence and consistency', () => {
    it('should maintain data consistency across multiple updates', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Rapid sequential updates
      const updates = [
        [{ name: 'A', amount: 10 }],
        [{ name: 'A', amount: 10 }, { name: 'B', amount: 20 }],
        [{ name: 'A', amount: 10 }, { name: 'B', amount: 20 }, { name: 'C', amount: 30 }],
      ];
      
      for (const participants of updates) {
        const res = await request(app)
          .put(`/api/sessions/${session.id}/data`)
          .send({ participants })
          .set('Content-Type', 'application/json');
        
        expect(res.statusCode).toBe(200);
      }
      
      // Verify final state
      const res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.body.data.participants).toHaveLength(3);
      expect(res.body.data.participants[2].name).toBe('C');
    });

    it('should handle numeric precision correctly', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      const participants = [
        { name: 'Alice', amount: 10.99 },
        { name: 'Bob', amount: 15.555 },
        { name: 'Charlie', amount: 0.01 }
      ];
      
      await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants })
        .set('Content-Type', 'application/json');
      
      const res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.body.data.participants[0].amount).toBe(10.99);
      expect(res.body.data.participants[1].amount).toBe(15.555);
      expect(res.body.data.participants[2].amount).toBe(0.01);
    });

    it('should handle special characters in names', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      const participants = [
        { name: 'José García', amount: 100 },
        { name: "O'Brien", amount: 50 },
        { name: 'User (Admin)', amount: 75 }
      ];
      
      await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants })
        .set('Content-Type', 'application/json');
      
      const res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.body.data.participants[0].name).toBe('José García');
      expect(res.body.data.participants[1].name).toBe("O'Brien");
      expect(res.body.data.participants[2].name).toBe('User (Admin)');
    });
  });

  describe('Session state transitions', () => {
    it('should detect when session becomes disabled during polling', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Initially accessible
      let res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.statusCode).toBe(200);
      
      // Disable session
      toggleSessionStatus(session.id, 'testuser', false);
      
      // Should now be inaccessible
      res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.statusCode).toBe(404);
      
      // Re-enable
      toggleSessionStatus(session.id, 'testuser', true);
      
      // Should be accessible again
      res = await request(app).get(`/api/sessions/${session.id}/data`);
      expect(res.statusCode).toBe(200);
    });

    it('should maintain isActive status in response', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      const sessionData = getSession(session.id);
      expect(sessionData.isActive).toBe(true);
      
      toggleSessionStatus(session.id, 'testuser', false);
      
      const sessionData2 = getSession(session.id);
      expect(sessionData2.isActive).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send('invalid json{')
        .set('Content-Type', 'application/json');
      
      expect([400, 500]).toContain(res.statusCode);
    });

    it('should handle missing request body', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(400);
    });

    it('should handle very large participant arrays', async () => {
      const session = createSession('testuser', 'Test Session', 24);
      
      // Create 100 participants
      const participants = Array.from({ length: 100 }, (_, i) => ({
        name: `User${i}`,
        amount: Math.random() * 1000
      }));
      
      const res = await request(app)
        .put(`/api/sessions/${session.id}/data`)
        .send({ participants })
        .set('Content-Type', 'application/json');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.participants).toHaveLength(100);
    });
  });
});

