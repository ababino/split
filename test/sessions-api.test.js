import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a test database
const TEST_DB_PATH = path.join(__dirname, 'test-api.db');
process.env.DB_PATH = TEST_DB_PATH;
process.env.LOGIN_USERNAME = 'testuser';
process.env.LOGIN_PASSWORD = 'testpass';
process.env.SESSION_SECRET = 'test-secret';

// Import database functions to clean up
const dbModule = await import('../database/db.js');
const { closeDatabase, initDatabase } = dbModule;

// Import app
const serverModule = await import('../server.js');
const app = serverModule.default;

describe('Sessions API Endpoints', () => {
  let authCookie;

  beforeEach(async () => {
    // Clean up database
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        closeDatabase();
      } catch (e) {
        // Ignore
      }
      fs.unlinkSync(TEST_DB_PATH);
    }
    initDatabase();

    // Login to get auth cookie
    const loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'testpass' });
    authCookie = loginRes.headers['set-cookie'];
  });

  afterEach(() => {
    try {
      closeDatabase();
    } catch (e) {
      // Ignore
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('POST /api/sessions', () => {
    it('creates a session when authenticated', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'Test Session' });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('sessionId');
      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.url).toContain('/session/');
    });

    it('creates session with custom expiration', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ expirationHours: 48 });

      expect(res.statusCode).toBe(201);
      const expectedExpiration = Date.now() + (48 * 60 * 60 * 1000);
      expect(res.body.expiresAt).toBeGreaterThanOrEqual(expectedExpiration - 2000);
      expect(res.body.expiresAt).toBeLessThanOrEqual(expectedExpiration + 2000);
    });

    it('limits expiration to maximum allowed', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ expirationHours: 999 });

      expect(res.statusCode).toBe(201);
      const maxExpiration = Date.now() + (168 * 60 * 60 * 1000); // 7 days
      expect(res.body.expiresAt).toBeLessThanOrEqual(maxExpiration + 2000);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({ name: 'Test' });

      // Can be either 401 or 302 (redirect to login)
      expect([302, 401]).toContain(res.statusCode);
    });
  });

  describe('GET /api/sessions', () => {
    it('lists user sessions', async () => {
      // Create some sessions
      await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'Session 1' });

      await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'Session 2' });

      const res = await request(app)
        .get('/api/sessions')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('sessions');
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.sessions[0].name).toBe('Session 2'); // Most recent first
      expect(res.body.sessions[1].name).toBe('Session 1');
    });

    it('returns empty array when no sessions exist', async () => {
      const res = await request(app)
        .get('/api/sessions')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(200);
      expect(res.body.sessions).toEqual([]);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/sessions');
      // Can be either 401 or 302 (redirect to login)
      expect([302, 401]).toContain(res.statusCode);
    });
  });

  describe('PATCH /api/sessions/:sessionId', () => {
    let sessionId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'Test Session' });
      sessionId = createRes.body.sessionId;
    });

    it('updates session active status', async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .send({ isActive: false });

      expect(res.statusCode).toBe(200);
      expect(res.body.session.isActive).toBe(false);
    });

    it('extends session expiration', async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .send({ extendHours: 24 });

      expect(res.statusCode).toBe(200);
      expect(res.body.session.expiresAt).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000);
    });

    it('can update both status and expiration', async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .send({ isActive: false, extendHours: 12 });

      expect(res.statusCode).toBe(200);
      expect(res.body.session.isActive).toBe(false);
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .patch('/api/sessions/non-existent')
        .set('Cookie', authCookie)
        .send({ isActive: false });

      expect(res.statusCode).toBe(404);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .send({ isActive: false });

      // Can be either 401 or 302 (redirect to login)
      expect([302, 401]).toContain(res.statusCode);
    });
  });

  describe('DELETE /api/sessions/:sessionId', () => {
    let sessionId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'Test Session' });
      sessionId = createRes.body.sessionId;
    });

    it('deletes a session', async () => {
      const res = await request(app)
        .delete(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(204);

      // Verify it's deleted
      const listRes = await request(app)
        .get('/api/sessions')
        .set('Cookie', authCookie);
      expect(listRes.body.sessions).toHaveLength(0);
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .delete('/api/sessions/non-existent')
        .set('Cookie', authCookie);

      expect(res.statusCode).toBe(404);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .delete(`/api/sessions/${sessionId}`);

      // Can be either 401 or 302 (redirect to login)
      expect([302, 401]).toContain(res.statusCode);
    });
  });

  describe('GET /api/sessions/:sessionId/data (Public)', () => {
    let sessionId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'Public Session' });
      sessionId = createRes.body.sessionId;
    });

    it('returns session data without authentication', async () => {
      const res = await request(app)
        .get(`/api/sessions/${sessionId}/data`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('sessionId');
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toEqual({ participants: [] });
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/sessions/non-existent/data');

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for expired session', async () => {
      // Create an expired session
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ expirationHours: -1 });

      const res = await request(app)
        .get(`/api/sessions/${createRes.body.sessionId}/data`);

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for inactive session', async () => {
      // Deactivate the session
      await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .send({ isActive: false });

      const res = await request(app)
        .get(`/api/sessions/${sessionId}/data`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/sessions/:sessionId/data (Public)', () => {
    let sessionId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'Public Session' });
      sessionId = createRes.body.sessionId;
    });

    it('updates session data without authentication', async () => {
      const participants = [
        { name: 'Alice', amount: 100 },
        { name: 'Bob', amount: 50 }
      ];

      const res = await request(app)
        .put(`/api/sessions/${sessionId}/data`)
        .send({ participants });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.participants).toEqual(participants);
    });

    it('validates participants is an array', async () => {
      const res = await request(app)
        .put(`/api/sessions/${sessionId}/data`)
        .send({ participants: 'not-an-array' });

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .put('/api/sessions/non-existent/data')
        .send({ participants: [] });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for expired session', async () => {
      // Create an expired session
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ expirationHours: -1 });

      const res = await request(app)
        .put(`/api/sessions/${createRes.body.sessionId}/data`)
        .send({ participants: [] });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for inactive session', async () => {
      // Deactivate the session
      await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .send({ isActive: false });

      const res = await request(app)
        .put(`/api/sessions/${sessionId}/data`)
        .send({ participants: [] });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Session ownership enforcement', () => {
    it('prevents one user from modifying another user\'s session', async () => {
      // Create session as testuser
      const createRes = await request(app)
        .post('/api/sessions')
        .set('Cookie', authCookie)
        .send({ name: 'User 1 Session' });
      const sessionId = createRes.body.sessionId;

      // Try to delete the session with a different username header
      const deleteRes = await request(app)
        .delete(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .set('x-username', 'otheruser');

      expect(deleteRes.statusCode).toBe(404);
    });
  });
});

