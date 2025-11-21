import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let app;
let cookies;

describe('session UI routes', () => {
  beforeEach(async () => {
    process.env.LOGIN_USERNAME = 'testuser';
    process.env.LOGIN_PASSWORD = 'testpass';
    process.env.SESSION_SECRET = 'test-secret';
    const mod = await import(path.join(__dirname, '..', 'server.js') + '?t=' + Date.now());
    app = mod.default;
    
    // Login to get auth cookie
    const loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'testpass' })
      .set('Content-Type', 'application/json');
    cookies = loginRes.headers['set-cookie'];
  });

  describe('session view page (public access)', () => {
    it('serves session.html without auth', async () => {
      const res = await request(app).get('/session/abc123');
      expect(res.statusCode).toBe(200);
      expect(res.text).toMatch(/<title>Session - Split Budget<\/title>/);
    });

    it('serves session.js without auth', async () => {
      const res = await request(app).get('/src/session.js');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
    });

    it('serves split.js without auth', async () => {
      const res = await request(app).get('/src/split.js');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
    });

    it('session page includes session container', async () => {
      const res = await request(app).get('/session/test123');
      expect(res.statusCode).toBe(200);
      expect(res.text).toMatch(/session-container/);
      expect(res.text).toMatch(/session-id/);
    });
  });

  describe('sessions management page (protected)', () => {
    it('redirects to login without auth', async () => {
      const res = await request(app).get('/sessions');
      expect([301, 302, 303]).toContain(res.statusCode);
      expect(res.headers.location).toBe('/login.html');
    });

    it('serves sessions.html with auth', async () => {
      const res = await request(app)
        .get('/sessions')
        .set('Cookie', cookies);
      expect(res.statusCode).toBe(200);
      expect(res.text).toMatch(/<title>My Sessions - Split Budget<\/title>/);
    });

    it('serves sessions.js with auth', async () => {
      const res = await request(app)
        .get('/src/sessions.js')
        .set('Cookie', cookies);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
    });

    it('sessions page includes management UI elements', async () => {
      const res = await request(app)
        .get('/sessions')
        .set('Cookie', cookies);
      expect(res.statusCode).toBe(200);
      expect(res.text).toMatch(/My Sessions/);
      expect(res.text).toMatch(/create-session-btn/);
      expect(res.text).toMatch(/sessions-list/);
    });
  });

  describe('auth status endpoint', () => {
    it('returns authenticated: false without auth', async () => {
      const res = await request(app).get('/api/auth/status');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ authenticated: false });
    });

    it('returns authenticated: true with auth', async () => {
      const res = await request(app)
        .get('/api/auth/status')
        .set('Cookie', cookies);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ authenticated: true });
    });
  });

  describe('main app with session buttons', () => {
    it('index.html includes session action buttons', async () => {
      const res = await request(app)
        .get('/')
        .set('Cookie', cookies);
      expect(res.statusCode).toBe(200);
      expect(res.text).toMatch(/session-actions/);
      expect(res.text).toMatch(/my-sessions-btn/);
      expect(res.text).toMatch(/create-session-btn/);
    });
  });
});

describe('session UI routes with auth disabled', () => {
  beforeEach(async () => {
    process.env.DISABLE_AUTH = 'true';
    const mod = await import(path.join(__dirname, '..', 'server.js') + '?noauth=' + Date.now());
    app = mod.default;
  });

  it('serves sessions page without auth when disabled', async () => {
    const res = await request(app).get('/sessions');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/My Sessions/);
  });

  it('serves session view without auth when disabled', async () => {
    const res = await request(app).get('/session/test456');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Session - Split Budget/);
  });
});

