import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a test database
const TEST_DB_PATH = path.join(__dirname, 'test-delete-bug.db');
process.env.DB_PATH = TEST_DB_PATH;
process.env.LOGIN_USERNAME = 'testuser';
process.env.LOGIN_PASSWORD = 'testpass';
process.env.SESSION_SECRET = 'test-secret';

// Import database functions
const dbModule = await import('../database/db.js');
const { closeDatabase, initDatabase } = dbModule;

// Import app
const serverModule = await import('../server.js');
const app = serverModule.default;

describe('Sessions Delete Button Bug - Integration Test', () => {
  let authCookie;
  let sessionId;

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

    // Create a test session
    const createRes = await request(app)
      .post('/api/sessions')
      .set('Cookie', authCookie)
      .send({ name: 'Test Session For Delete' });
    sessionId = createRes.body.sessionId;
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

  it('should successfully delete a session via API', async () => {
    // Verify session exists
    const listBefore = await request(app)
      .get('/api/sessions')
      .set('Cookie', authCookie);
    expect(listBefore.body.sessions).toHaveLength(1);
    expect(listBefore.body.sessions[0].id).toBe(sessionId);

    // Delete the session
    const deleteRes = await request(app)
      .delete(`/api/sessions/${sessionId}`)
      .set('Cookie', authCookie);
    
    expect(deleteRes.statusCode).toBe(204);

    // Verify session is deleted
    const listAfter = await request(app)
      .get('/api/sessions')
      .set('Cookie', authCookie);
    expect(listAfter.body.sessions).toHaveLength(0);
  });

  it('should return proper HTML structure for sessions page', async () => {
    // Get the sessions page HTML
    const res = await request(app)
      .get('/sessions.html')
      .set('Cookie', authCookie);
    
    expect(res.statusCode).toBe(200);
    // Delete buttons are created dynamically by JavaScript
    expect(res.text).toContain('sessions-list');
    expect(res.text).toContain('My Sessions');
  });

  it('should load sessions.js correctly', async () => {
    const res = await request(app)
      .get('/src/sessions.js')
      .set('Cookie', authCookie);
    
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('deleteSession');
    expect(res.text).toContain('delete-btn');
    
    // Check for the event listener attachment
    expect(res.text).toContain('.addEventListener(\'click\'');
  });

  it('should have correct API endpoint for delete in sessions.js', async () => {
    const res = await request(app)
      .get('/src/sessions.js')
      .set('Cookie', authCookie);
    
    expect(res.statusCode).toBe(200);
    
    // Check if the delete fetch call is correct
    const jsContent = res.text;
    expect(jsContent).toContain('/api/sessions/');
    expect(jsContent).toContain('method: \'DELETE\'');
  });

  it('should check dataset.sessionId is being read correctly', async () => {
    const res = await request(app)
      .get('/src/sessions.js')
      .set('Cookie', authCookie);
    
    const jsContent = res.text;
    
    // Look for the pattern where sessionId is extracted from the event target
    expect(jsContent).toMatch(/dataset\.sessionId/);
  });

  it('should successfully delete multiple sessions sequentially', async () => {
    // Create another session
    const createRes2 = await request(app)
      .post('/api/sessions')
      .set('Cookie', authCookie)
      .send({ name: 'Second Test Session' });
    const sessionId2 = createRes2.body.sessionId;

    // Verify both exist
    const listBefore = await request(app)
      .get('/api/sessions')
      .set('Cookie', authCookie);
    expect(listBefore.body.sessions).toHaveLength(2);

    // Delete first session
    const deleteRes1 = await request(app)
      .delete(`/api/sessions/${sessionId}`)
      .set('Cookie', authCookie);
    expect(deleteRes1.statusCode).toBe(204);

    // Verify one remains
    const listMiddle = await request(app)
      .get('/api/sessions')
      .set('Cookie', authCookie);
    expect(listMiddle.body.sessions).toHaveLength(1);
    expect(listMiddle.body.sessions[0].id).toBe(sessionId2);

    // Delete second session
    const deleteRes2 = await request(app)
      .delete(`/api/sessions/${sessionId2}`)
      .set('Cookie', authCookie);
    expect(deleteRes2.statusCode).toBe(204);

    // Verify none remain
    const listAfter = await request(app)
      .get('/api/sessions')
      .set('Cookie', authCookie);
    expect(listAfter.body.sessions).toHaveLength(0);
  });
});

