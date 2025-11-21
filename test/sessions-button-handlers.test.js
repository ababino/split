import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a test database
const TEST_DB_PATH = path.join(__dirname, 'test-button-handlers.db');
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

describe('Sessions Button Handlers - Bug Tests', () => {
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
      .send({ name: 'Test Session' });
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

  describe('Event handler implementation in sessions.js', () => {
    it('should verify that sessions.js uses e.currentTarget for event handlers (FIXED)', async () => {
      const res = await request(app)
        .get('/src/sessions.js')
        .set('Cookie', authCookie);
      
      const jsContent = res.text;
      
      // Check if the code now uses e.currentTarget.dataset.sessionId (fixed!)
      expect(jsContent).toContain('e.currentTarget.dataset.sessionId');
      
      // This is the correct approach - e.currentTarget always refers to
      // the element the listener is attached to, not the event target
    });

    it('should verify the extend parameter mismatch bug is FIXED', async () => {
      // The client should now send "extendHours: 24" to match what server expects
      const jsRes = await request(app)
        .get('/src/sessions.js')
        .set('Cookie', authCookie);
      
      // Check what the client sends (should be fixed now)
      expect(jsRes.text).toContain('extendHours: 24');
      
      // Verify that extending actually works now
      const beforeRes = await request(app)
        .get('/api/sessions')
        .set('Cookie', authCookie);
      const originalExpiration = beforeRes.body.sessions[0].expiresAt;
      
      // Try to extend
      const extendRes = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .send({ extendHours: 24 }); // Correct parameter name
      
      expect(extendRes.statusCode).toBe(200);
      
      // Verify the session expiration was actually extended
      const afterRes = await request(app)
        .get('/api/sessions')
        .set('Cookie', authCookie);
      const newExpiration = afterRes.body.sessions[0].expiresAt;
      
      // Should be extended by approximately 24 hours
      const expectedExtension = 24 * 60 * 60 * 1000;
      const actualExtension = newExpiration - originalExpiration;
      
      expect(actualExtension).toBeGreaterThan(expectedExtension - 10000); // Allow 10s margin
      expect(actualExtension).toBeLessThan(expectedExtension + 10000);
    });

    it('should verify that using correct parameter name works', async () => {
      // Get original expiration
      const beforeRes = await request(app)
        .get('/api/sessions')
        .set('Cookie', authCookie);
      const originalExpiration = beforeRes.body.sessions[0].expiresAt;
      
      // Extend with correct parameter name
      const extendRes = await request(app)
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', authCookie)
        .send({ extendHours: 24 }); // Correct parameter name
      
      expect(extendRes.statusCode).toBe(200);
      
      // Verify the expiration was extended
      const afterRes = await request(app)
        .get('/api/sessions')
        .set('Cookie', authCookie);
      const newExpiration = afterRes.body.sessions[0].expiresAt;
      
      // Should be extended by approximately 24 hours
      const expectedExtension = 24 * 60 * 60 * 1000;
      const actualExtension = newExpiration - originalExpiration;
      
      expect(actualExtension).toBeGreaterThan(expectedExtension - 10000); // Allow 10s margin
      expect(actualExtension).toBeLessThan(expectedExtension + 10000);
    });
  });

  describe('Best practices for event handlers', () => {
    it('should document why e.currentTarget is better than e.target', () => {
      // e.target = the element that triggered the event (could be a child)
      // e.currentTarget = the element the listener is attached to (always the button)
      //
      // Using e.target.dataset.sessionId can fail if:
      // 1. The button has nested elements (icon, span, etc.)
      // 2. Browser extensions inject elements into buttons
      // 3. The click event bubbles from a child element
      //
      // Using e.currentTarget.dataset.sessionId is safer because it always
      // refers to the element that has the data-session-id attribute
      
      expect(true).toBe(true); // Documentation test
    });
  });
});

