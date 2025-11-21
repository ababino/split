import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { initDatabase, createSession } from '../database/db.js';

describe('Session Module Loading', () => {
  beforeEach(() => {
    initDatabase();
  });

  it('should serve JavaScript modules with correct MIME type from session page', async () => {
    // Create a test session
    const session = createSession('admin', 'Test Session', 24);
    const sessionId = session.id;

    // Test that session.js is served with correct MIME type
    const sessionJsResponse = await request(app)
      .get('/src/session.js')
      .expect(200);
    
    expect(sessionJsResponse.headers['content-type']).toContain('application/javascript');
    expect(sessionJsResponse.text).toContain('import');
    expect(sessionJsResponse.text).not.toContain('<!doctype html>');

    // Test that split.js is served with correct MIME type
    const splitJsResponse = await request(app)
      .get('/src/split.js')
      .expect(200);
    
    expect(splitJsResponse.headers['content-type']).toContain('application/javascript');
    expect(splitJsResponse.text).toContain('export');
    expect(splitJsResponse.text).not.toContain('<!doctype html>');
  });

  it('should not serve HTML when requesting JavaScript modules', async () => {
    // These paths should never return HTML
    const paths = ['/src/session.js', '/src/split.js'];
    
    for (const path of paths) {
      const response = await request(app).get(path);
      
      // Should not be HTML
      expect(response.text).not.toContain('<!doctype html>');
      expect(response.text).not.toContain('<html');
      
      // Should contain JavaScript (export or function declarations)
      const isJavaScript = response.text.includes('import') || 
                          response.text.includes('export') || 
                          response.text.includes('function') ||
                          response.text.includes('const') ||
                          response.text.includes('document.');
      expect(isJavaScript).toBe(true);
    }
  });

  it('session HTML should use absolute paths for module imports', async () => {
    // Create a test session to get the session HTML
    const session = createSession('admin', 'Test Session', 24);
    const sessionId = session.id;
    
    // Get the session HTML through the session route
    const response = await request(app)
      .get(`/session/${sessionId}`)
      .expect(200);
    
    // The HTML should use absolute paths for module scripts
    // Look for the script tag
    const scriptMatch = response.text.match(/<script[^>]*type="module"[^>]*src="([^"]*)"[^>]*>/);
    expect(scriptMatch).toBeTruthy();
    
    const scriptSrc = scriptMatch[1];
    
    // Should use absolute path starting with / not relative path starting with ./
    expect(scriptSrc.startsWith('/')).toBe(true);
    expect(scriptSrc.startsWith('./')).toBe(false);
  });
});

