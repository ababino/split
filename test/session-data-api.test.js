import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { initDatabase, createSession } from '../database/db.js';

describe('Session Data API Response', () => {
  beforeEach(() => {
    initDatabase();
  });

  it('should include isActive field in session data response', async () => {
    // Create a test session
    const session = createSession('admin', 'Test Session', 24);
    const sessionId = session.id;

    // Get session data from the public API
    const response = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // Verify response includes all necessary fields
    expect(response.body).toHaveProperty('sessionId');
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('expiresAt');
    expect(response.body).toHaveProperty('data');
    
    // This is the critical field that's missing - it should be included
    expect(response.body).toHaveProperty('isActive');
    expect(typeof response.body.isActive).toBe('boolean');
    
    // By default, sessions should be active
    expect(response.body.isActive).toBe(true);
  });

  it('should return 404 for disabled sessions', async () => {
    // Create a test session
    const session = createSession('admin', 'Test Session', 24);
    const sessionId = session.id;

    // First, verify session is active
    const activeResponse = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);
    
    expect(activeResponse.body.isActive).toBe(true);

    // Now disable the session (requires auth)
    const agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ username: 'admin', password: 'password' })
      .expect(204);

    await agent
      .patch(`/api/sessions/${sessionId}`)
      .send({ isActive: false })
      .expect(200);

    // Disabled sessions should return 404 (not accessible)
    await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(404);
  });

  it('should not show disabled error for active sessions in the UI', async () => {
    // Create a test session
    const session = createSession('admin', 'Test Session', 24);
    const sessionId = session.id;

    // Get the session page HTML
    const htmlResponse = await request(app)
      .get(`/session/${sessionId}`)
      .expect(200);
    
    expect(htmlResponse.text).toContain('Split Budget Session');

    // Get session data API
    const dataResponse = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);
    
    // Verify the session is active
    expect(dataResponse.body.isActive).toBe(true);
    
    // This should not trigger the "Session Disabled" error because isActive is true
    // The frontend checks: if (!data.isActive) - this should be false for active sessions
    expect(dataResponse.body.isActive).not.toBe(undefined);
    expect(dataResponse.body.isActive).not.toBe(null);
  });
});

