# Database Module - Phase 1 Implementation

## Overview
This module implements Phase 1 of the Sessions feature: the Data Persistence Layer using SQLite.

## Files Created

### `schema.sql`
Defines the database schema for the sessions table with the following fields:
- `id` - Unique session identifier (UUID)
- `owner_id` - Username of the session creator
- `name` - Optional session name
- `created_at` - Unix timestamp of creation
- `expires_at` - Unix timestamp of expiration
- `is_active` - Manual enable/disable flag
- `data` - JSON string containing participants array

### `db.js`
Database initialization and data access functions:

#### Core Functions
- **`initDatabase()`** - Initialize database connection and create tables
- **`closeDatabase()`** - Close the database connection
- **`getDatabase()`** - Get the database instance

#### Session Management Functions
- **`createSession(ownerId, name?, expirationHours?)`** - Create a new session
- **`getSession(sessionId)`** - Retrieve a session by ID
- **`updateSession(sessionId, data)`** - Update session data (participants)
- **`listSessionsByOwner(ownerId)`** - List all sessions for an owner
- **`deleteSession(sessionId, ownerId)`** - Delete a session (owner only)
- **`toggleSessionStatus(sessionId, ownerId, isActive)`** - Enable/disable a session
- **`extendSessionExpiration(sessionId, ownerId, additionalHours)`** - Extend expiration time
- **`cleanupExpiredSessions()`** - Remove expired sessions
- **`isSessionValid(sessionId)`** - Check if session is valid (active and not expired)

## Testing

### `test/sessions.test.js`
Comprehensive test suite with 40 tests covering:

1. **Database Initialization** (2 tests)
   - Database creation
   - Table schema verification

2. **Session CRUD Operations** (26 tests)
   - Creating sessions with various parameters
   - Retrieving sessions
   - Updating session data
   - Listing sessions by owner
   - Deleting sessions with ownership verification
   - Toggling session status
   - Extending expiration times
   - Cleaning up expired sessions
   - Validating session state

3. **Complex Scenarios** (3 tests)
   - Multiple operations on same session
   - Multiple users with multiple sessions
   - Complex participant data persistence

### Test Results
```
✓ test/sessions.test.js  (40 tests) 2025ms
All tests passed successfully!
```

## Usage Example

```javascript
import {
  initDatabase,
  createSession,
  getSession,
  updateSession,
  isSessionValid
} from './database/db.js';

// Initialize database
initDatabase();

// Create a session
const session = createSession('user1', 'Team Lunch', 24);
console.log(session.id); // UUID
console.log(session.url); // /session/{uuid}

// Update session data
updateSession(session.id, {
  participants: [
    { name: 'Alice', amount: 100 },
    { name: 'Bob', amount: 50 }
  ]
});

// Check if session is valid
if (isSessionValid(session.id)) {
  const sessionData = getSession(session.id);
  console.log(sessionData.data.participants);
}
```

## Dependencies Added
- `better-sqlite3` - SQLite database driver
- `uuid` - Generate unique session IDs

## Configuration
The module uses environment variables for configuration:
- `NODE_ENV=test` - Use test database (`split-test.db` instead of `split.db`)

## Database Files
Database files are automatically gitignored:
- `database/*.db`
- `database/*.db-shm`
- `database/*.db-wal`

## Next Steps
This completes Phase 1. The next phases will include:
- Phase 2: Backend API endpoints
- Phase 3: Frontend UI updates
- Phase 4: Session interaction logic
- Phase 5: Background tasks
- Phase 6: Testing (integration tests)
- Phase 7: Polish & documentation

