import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'url';
import path from 'path';

// Ensure env is set for tests
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy import app after setting env
let app;

describe('auth flow', () => {
  beforeEach(async () => {
    process.env.LOGIN_USERNAME = 'u1';
    process.env.LOGIN_PASSWORD = 'p1';
    process.env.SESSION_SECRET = 'test-secret';
    const mod = await import(path.join(__dirname, '..', 'server.js'));
    app = mod.default;
  });

  afterEach(() => {
    delete process.env.LOGIN_USERNAME;
    delete process.env.LOGIN_PASSWORD;
    delete process.env.SESSION_SECRET;
  });

  it('serves login page without auth', async () => {
    const res = await request(app).get('/login.html');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/<title>Login<\/title>/);
  });

  it('protects index.html without auth', async () => {
    const res = await request(app).get('/');
    expect([301, 302, 303]).toContain(res.statusCode);
    expect(res.headers.location).toBe('/login.html');
  });

  it('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'bad', password: 'creds' })
      .set('Content-Type', 'application/json');
    expect(res.statusCode).toBe(401);
  });

  it('accepts valid credentials and sets cookie, allowing access', async () => {
    const loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'u1', password: 'p1' })
      .set('Content-Type', 'application/json');
    expect(loginRes.statusCode).toBe(204);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeTruthy();

    const res2 = await request(app)
      .get('/')
      .set('Cookie', cookies);
    expect(res2.statusCode).toBe(200);
    expect(res2.text).toMatch(/Split Budget/);
  });
});

describe('auth disabled', () => {
  it('serves index without auth when DISABLE_AUTH=true', async () => {
    // Set env before importing
    const oldValue = process.env.DISABLE_AUTH;
    process.env.DISABLE_AUTH = 'true';
    
    // Import with cache-busting timestamp
    const serverPath = path.join(__dirname, '..', 'server.js');
    const mod = await import(serverPath + '?noauth=' + Date.now());
    const appNoAuth = mod.default;
    
    const res = await request(appNoAuth).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Split Budget/);
    
    // Restore env
    if (oldValue === undefined) {
      delete process.env.DISABLE_AUTH;
    } else {
      process.env.DISABLE_AUTH = oldValue;
    }
  });

  it('serves static assets without auth', async () => {
    const oldValue = process.env.DISABLE_AUTH;
    process.env.DISABLE_AUTH = 'true';
    
    const serverPath = path.join(__dirname, '..', 'server.js');
    const mod = await import(serverPath + '?noauth2=' + Date.now());
    const appNoAuth = mod.default;
    
    const res = await request(appNoAuth).get('/src/app.js');
    expect(res.statusCode).toBe(200);
    
    if (oldValue === undefined) {
      delete process.env.DISABLE_AUTH;
    } else {
      process.env.DISABLE_AUTH = oldValue;
    }
  });

  it('does not redirect to login page', async () => {
    const oldValue = process.env.DISABLE_AUTH;
    process.env.DISABLE_AUTH = 'true';
    
    const serverPath = path.join(__dirname, '..', 'server.js');
    const mod = await import(serverPath + '?noauth3=' + Date.now());
    const appNoAuth = mod.default;
    
    const res = await request(appNoAuth).get('/');
    expect(res.statusCode).not.toBe(302);
    expect(res.headers.location).toBeUndefined();
    
    if (oldValue === undefined) {
      delete process.env.DISABLE_AUTH;
    } else {
      process.env.DISABLE_AUTH = oldValue;
    }
  });
});


