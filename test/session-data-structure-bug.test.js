import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { initDatabase, createSession, updateSession } from '../database/db.js';

describe('Session Data Structure Bug - Data Wipeout', () => {
  beforeEach(() => {
    initDatabase();
  });

  it('should fail when frontend tries to access data.participants instead of data.data.participants', async () => {
    // This test simulates the ACTUAL frontend bug
    const session = createSession('admin', 'Frontend Bug Test', 24);
    const sessionId = session.id;

    // Add participant data
    const participantData = [
      { name: 'Alice', amount: 50.00 },
      { name: 'Bob', amount: 30.00 }
    ];

    updateSession(sessionId, { participants: participantData });

    // Get session data (simulating what frontend does)
    const response = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // The response body structure is what the frontend receives
    const data = response.body;

    // Frontend code at line 312 does: loadParticipantsIntoUI(data.participants || [])
    // This is WRONG because the structure is data.data.participants
    const wrongAccess = data.participants;
    const correctAccess = data.data.participants;

    // This demonstrates the bug: accessing data.participants returns undefined
    expect(wrongAccess).toBeUndefined();
    
    // The correct access path is data.data.participants
    expect(correctAccess).toBeDefined();
    expect(correctAccess).toHaveLength(2);

    // When data.participants is undefined, the || [] fallback kicks in
    // This causes an empty array to be loaded, wiping out all data!
    const frontendWillLoad = wrongAccess || [];
    expect(frontendWillLoad).toEqual([]);  // BUG: Empty array wipes data!
    
    const frontendShouldLoad = correctAccess || [];
    expect(frontendShouldLoad).toHaveLength(2);  // CORRECT: Preserves data
  });

  it('should preserve participant data after creating and retrieving a session', async () => {
    // Create a new session
    const session = createSession('admin', 'Test Session', 24);
    const sessionId = session.id;

    // Add participant data
    const participantData = [
      { name: 'Alice', amount: 50.00 },
      { name: 'Bob', amount: 30.00 }
    ];

    // Update session with participants
    const updateSuccess = updateSession(sessionId, { participants: participantData });
    expect(updateSuccess).toBe(true);

    // Get session data from API (simulating frontend load)
    const response = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // Check response structure
    expect(response.body).toHaveProperty('sessionId');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('participants');
    
    // Verify participants are not lost
    expect(response.body.data.participants).toHaveLength(2);
    expect(response.body.data.participants[0]).toEqual({ name: 'Alice', amount: 50.00 });
    expect(response.body.data.participants[1]).toEqual({ name: 'Bob', amount: 30.00 });
  });

  it('should preserve data during polling updates', async () => {
    // Create a session with initial data
    const session = createSession('admin', 'Test Session', 24);
    const sessionId = session.id;

    const initialData = [
      { name: 'Charlie', amount: 25.50 },
      { name: 'Diana', amount: 40.75 }
    ];

    updateSession(sessionId, { participants: initialData });

    // First GET request (simulating initial load)
    const firstResponse = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    expect(firstResponse.body.data.participants).toHaveLength(2);

    // Update data via PUT (simulating user input)
    const updatedData = [
      { name: 'Charlie', amount: 25.50 },
      { name: 'Diana', amount: 40.75 },
      { name: 'Eve', amount: 15.00 }
    ];

    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ participants: updatedData })
      .expect(200);

    // Second GET request (simulating polling)
    const secondResponse = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // Data should not be wiped out
    expect(secondResponse.body.data.participants).toHaveLength(3);
    expect(secondResponse.body.data.participants[2]).toEqual({ name: 'Eve', amount: 15.00 });
  });

  it('should handle empty participants array without undefined errors', async () => {
    // Create a new session (starts with empty participants)
    const session = createSession('admin', 'Empty Session', 24);
    const sessionId = session.id;

    // Get session data
    const response = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // Should have proper structure even when empty
    expect(response.body.data).toBeDefined();
    expect(response.body.data.participants).toBeDefined();
    expect(Array.isArray(response.body.data.participants)).toBe(true);
    expect(response.body.data.participants).toHaveLength(0);
  });

  it('should correctly access nested data structure in response', async () => {
    // Create session and add data
    const session = createSession('admin', 'Nested Test', 24);
    const sessionId = session.id;

    const testData = [
      { name: 'Frank', amount: 100.00 },
      { name: 'Grace', amount: 200.00 }
    ];

    updateSession(sessionId, { participants: testData });

    // Get the response
    const response = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // The correct path should be response.body.data.participants
    // NOT response.body.participants
    expect(response.body.participants).toBeUndefined();
    expect(response.body.data.participants).toBeDefined();
    expect(response.body.data.participants).toHaveLength(2);
  });

  it('should maintain data integrity across multiple save operations', async () => {
    // Create session
    const session = createSession('admin', 'Multi-Save Test', 24);
    const sessionId = session.id;

    // Save data multiple times (simulating auto-save)
    const saves = [
      [{ name: 'User1', amount: 10 }],
      [{ name: 'User1', amount: 10 }, { name: 'User2', amount: 20 }],
      [{ name: 'User1', amount: 15 }, { name: 'User2', amount: 20 }],
      [{ name: 'User1', amount: 15 }, { name: 'User2', amount: 20 }, { name: 'User3', amount: 30 }]
    ];

    for (const data of saves) {
      await request(app)
        .put(`/api/sessions/${sessionId}/data`)
        .send({ participants: data })
        .expect(200);

      // Verify data was saved correctly
      const checkResponse = await request(app)
        .get(`/api/sessions/${sessionId}/data`)
        .expect(200);

      expect(checkResponse.body.data.participants).toEqual(data);
    }

    // Final verification
    const finalResponse = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    expect(finalResponse.body.data.participants).toHaveLength(3);
    expect(finalResponse.body.data.participants[2].name).toBe('User3');
  });
});

