import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { initDatabase, createSession } from '../database/db.js';

describe('Session Data Wipeout - User Experience Integration Test', () => {
  beforeEach(() => {
    initDatabase();
  });

  it('should preserve data when user adds participants to a new session', { timeout: 10000 }, async () => {
    // Step 1: User creates a new session (authenticated)
    const agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ username: 'admin', password: 'password' })
      .expect(204);

    const createResponse = await agent
      .post('/api/sessions')
      .send({ name: 'Dinner Split', expirationHours: 24 })
      .expect(201);

    const sessionId = createResponse.body.sessionId;

    // Step 2: User opens the session (initial load)
    const initialLoad = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // Verify initial state - should be empty but not undefined
    expect(initialLoad.body.data.participants).toEqual([]);

    // Step 3: User starts adding participants (first name and amount)
    const afterFirstInput = [
      { name: 'Alice', amount: 0 }  // User typed name but hasn't entered amount yet
    ];

    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ participants: afterFirstInput })
      .expect(200);

    // Step 4: User adds the amount
    const afterAmountInput = [
      { name: 'Alice', amount: 50.00 }
    ];

    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ participants: afterAmountInput })
      .expect(200);

    // Step 5: Simulate auto-save polling (happens every 5 seconds)
    // This is where the bug would occur - polling would wipe out the data
    const pollResponse = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // CRITICAL: Data should NOT be wiped out during polling
    expect(pollResponse.body.data.participants).toHaveLength(1);
    expect(pollResponse.body.data.participants[0].name).toBe('Alice');
    expect(pollResponse.body.data.participants[0].amount).toBe(50.00);

    // Step 6: User continues adding more participants
    const withMoreParticipants = [
      { name: 'Alice', amount: 50.00 },
      { name: 'Bob', amount: 30.00 }
    ];

    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ participants: withMoreParticipants })
      .expect(200);

    // Step 7: Another poll happens
    const secondPoll = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // Data should still be intact
    expect(secondPoll.body.data.participants).toHaveLength(2);
    expect(secondPoll.body.data.participants[1].name).toBe('Bob');
  });

  it('should handle rapid auto-saves without data loss', async () => {
    // Simulate rapid typing with auto-save debouncing
    const session = createSession('admin', 'Rapid Save Test', 24);
    const sessionId = session.id;

    // Simulate user typing "Alice" character by character with auto-saves
    const typingSequence = [
      { name: 'A', amount: 0 },
      { name: 'Al', amount: 0 },
      { name: 'Ali', amount: 0 },
      { name: 'Alic', amount: 0 },
      { name: 'Alice', amount: 0 },
      { name: 'Alice', amount: 5 },
      { name: 'Alice', amount: 50 },
      { name: 'Alice', amount: 50.0 },
      { name: 'Alice', amount: 50.00 }
    ];

    for (const state of typingSequence) {
      await request(app)
        .put(`/api/sessions/${sessionId}/data`)
        .send({ participants: [state] })
        .expect(200);

      // Verify each save preserved the data
      const checkResponse = await request(app)
        .get(`/api/sessions/${sessionId}/data`)
        .expect(200);

      expect(checkResponse.body.data.participants).toHaveLength(1);
      expect(checkResponse.body.data.participants[0].name).toBe(state.name);
      expect(checkResponse.body.data.participants[0].amount).toBe(state.amount);
    }

    // Final verification
    const finalResponse = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    expect(finalResponse.body.data.participants[0]).toEqual({
      name: 'Alice',
      amount: 50.00
    });
  });

  it('should preserve data across polling interval when user is actively editing', async () => {
    // This test simulates the exact bug scenario:
    // User is typing, auto-save triggers, then polling happens immediately after
    const session = createSession('admin', 'Polling Bug Test', 24);
    const sessionId = session.id;

    // User types and saves
    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ participants: [{ name: 'Charlie', amount: 100.00 }] })
      .expect(200);

    // Polling happens (5 second interval in real app)
    const poll1 = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    expect(poll1.body.data.participants).toHaveLength(1);
    expect(poll1.body.data.participants[0].name).toBe('Charlie');

    // User adds more data
    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ 
        participants: [
          { name: 'Charlie', amount: 100.00 },
          { name: 'Diana', amount: 75.50 }
        ] 
      })
      .expect(200);

    // Another poll happens
    const poll2 = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    // Data should NOT be wiped out
    expect(poll2.body.data.participants).toHaveLength(2);
    expect(poll2.body.data.participants[1].name).toBe('Diana');
    expect(poll2.body.data.participants[1].amount).toBe(75.50);
  });

  it('should handle concurrent updates from multiple users without data loss', async () => {
    // Simulate multiple users editing the same session
    const session = createSession('admin', 'Concurrent Test', 24);
    const sessionId = session.id;

    // User 1 adds data
    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ participants: [{ name: 'User1', amount: 10.00 }] })
      .expect(200);

    // User 2 polls and sees User1's data
    const user2Poll = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    expect(user2Poll.body.data.participants).toHaveLength(1);

    // User 2 adds their own participant
    await request(app)
      .put(`/api/sessions/${sessionId}/data`)
      .send({ 
        participants: [
          { name: 'User1', amount: 10.00 },
          { name: 'User2', amount: 20.00 }
        ] 
      })
      .expect(200);

    // User 1 polls and should see both participants
    const user1Poll = await request(app)
      .get(`/api/sessions/${sessionId}/data`)
      .expect(200);

    expect(user1Poll.body.data.participants).toHaveLength(2);
    expect(user1Poll.body.data.participants[1].name).toBe('User2');
  });
});

