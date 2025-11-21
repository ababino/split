# AGENTS.md - Split Budget Application Architecture

## Overview

Split Budget is a collaborative web application for splitting shared expenses among friends. The system is built with a modular architecture where different "agents" (components/modules) work together to provide authentication, session management, and real-time collaboration features.

This document describes the system architecture, the role of each component/agent, and how they interact.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Login Agent │  Main App    │  Session     │  Sessions      │
│  (login.js)  │  (app.js)    │  Agent       │  Manager       │
│              │              │  (session.js)│  (sessions.js) │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │              │              │                 │
       └──────────────┴──────────────┴─────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       SERVER LAYER                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │         Express.js Server (server.js)              │     │
│  │  ┌──────────────────────────────────────────────┐  │     │
│  │  │    Authentication Middleware                 │  │     │
│  │  └──────────────────────────────────────────────┘  │     │
│  │  ┌──────────────┬────────────────┬──────────────┐  │     │
│  │  │ Auth API     │ Session API    │ Static Files │  │     │
│  │  │ Endpoints    │ Endpoints      │ Serving      │  │     │
│  │  └──────────────┴────────────────┴──────────────┘  │     │
│  └────────────────────┬───────────────────────────────┘     │
└───────────────────────┼─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│  ┌────────────────────────────────────────────────────┐     │
│  │      Database Agent (database/db.js)               │     │
│  │  ┌──────────────────────────────────────────────┐  │     │
│  │  │  Session Management Functions                │  │     │
│  │  │  - CRUD operations                           │  │     │
│  │  │  - Access control                            │  │     │
│  │  │  - Expiration handling                       │  │     │
│  │  └──────────────────────────────────────────────┘  │     │
│  │                      ▼                              │     │
│  │  ┌──────────────────────────────────────────────┐  │     │
│  │  │       SQLite Database (split.db)             │  │     │
│  │  │       Schema: sessions table                 │  │     │
│  │  └──────────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   UTILITY LAYER                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │      Split Algorithm (src/split.js)                │     │
│  │  - Balance calculation                             │     │
│  │  - Transfer minimization                           │     │
│  │  - Settlement computation                          │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Core Agents/Components

### 1. Server Agent (`server.js`)

**Role**: Central orchestrator for all backend operations

**Responsibilities**:
- HTTP server management (Express.js)
- Request routing and middleware
- Authentication enforcement
- Session cleanup scheduling
- Static file serving

**Key Features**:
- Cookie-based authentication with signed cookies
- Environment-based configuration
- Periodic cleanup of expired sessions (configurable interval)
- Mixed authentication model (protected and public routes)

**Configuration**:
```javascript
- PORT: 5173 (default)
- AUTH_ENABLED: true (default)
- DEFAULT_SESSION_DURATION_HOURS: 24
- MAX_SESSION_DURATION_HOURS: 168 (7 days)
- SESSION_CLEANUP_INTERVAL_HOURS: 1
```

**API Endpoints**:

*Authentication Endpoints*:
- `POST /api/login` - Authenticate user
- `POST /api/logout` - End session
- `GET /api/auth/status` - Check authentication status

*Protected Session Management*:
- `POST /api/sessions` - Create new session (auth required)
- `GET /api/sessions` - List user's sessions (auth required)
- `PATCH /api/sessions/:id` - Update session (auth required)
- `DELETE /api/sessions/:id` - Delete session (auth required)

*Public Session Access*:
- `GET /api/sessions/:id/data` - Get session data (no auth)
- `PUT /api/sessions/:id/data` - Update session data (no auth)

---

### 2. Database Agent (`database/db.js`)

**Role**: Data persistence and session lifecycle management

**Responsibilities**:
- SQLite database initialization
- CRUD operations for sessions
- Session access control validation
- Expiration logic enforcement
- Data serialization/deserialization

**Key Functions**:

```javascript
// Initialization
initDatabase()              // Setup database and schema
getDb()                     // Get database instance
closeDatabase()             // Close connection (testing)

// Session Management
createSession(ownerId, name, expirationHours)
getSession(sessionId)
updateSession(sessionId, data)
deleteSession(sessionId, ownerId)

// Access Control
isSessionAccessible(sessionId)  // Check if active & not expired
listSessionsByOwner(ownerId)

// Lifecycle Management
toggleSessionStatus(sessionId, ownerId, isActive)
extendSessionExpiration(sessionId, ownerId, additionalHours)
cleanupExpiredSessions()
```

**Database Schema**:
```sql
sessions (
  id TEXT PRIMARY KEY,           -- UUID
  owner_id TEXT NOT NULL,        -- Username
  name TEXT,                     -- Optional name
  created_at INTEGER NOT NULL,   -- Unix timestamp
  expires_at INTEGER NOT NULL,   -- Unix timestamp
  is_active INTEGER NOT NULL,    -- Boolean flag
  data TEXT NOT NULL             -- JSON: {participants: [...]}
)
```

**Indexes**:
- `idx_sessions_owner` - Optimize owner queries
- `idx_sessions_expires_at` - Optimize cleanup operations

---

### 3. Login Agent (`src/login.js`)

**Role**: User authentication interface

**Responsibilities**:
- Handle login form submission
- Communicate with authentication API
- Display error messages
- Redirect on successful login

**Interaction Flow**:
```
User Input → Form Submit → POST /api/login → Cookie Set → Redirect to /
```

**Error Handling**:
- Invalid credentials (401)
- Network errors
- Unexpected server errors

---

### 4. Main Application Agent (`src/app.js`)

**Role**: Primary split calculation interface

**Responsibilities**:
- Participant management (add/remove)
- Input validation
- Settlement calculation
- Session creation shortcuts
- Authentication-aware UI

**Key Features**:
- Dynamic row creation for participants
- Real-time validation
- Integration with split algorithm
- Session action buttons (visible when authenticated)

**UI Components**:
- Participant rows (name + amount)
- Add/Remove buttons
- Calculate button
- Results display (total, per-person, transfers)
- Session management shortcuts

**Interaction with Other Agents**:
- Calls Split Algorithm Agent for calculations
- Communicates with Server Agent for session creation
- Checks authentication status for UI adaptation

---

### 5. Session Agent (`src/session.js`)

**Role**: Collaborative session interface with real-time updates

**Responsibilities**:
- Load and display session data
- Auto-save changes with debouncing
- Poll for updates from other users
- Handle read-only mode (expired/disabled)
- Display session status and time remaining

**Key Features**:

*Auto-Save System*:
- 500ms debounce on user input
- Change detection via data hashing
- Visual save status indicators (saving/saved/error)

*Polling System*:
- 5-second interval for updates
- Detects external changes
- Auto-reloads UI when data changes
- Stops polling if session becomes unavailable

*Read-Only Mode*:
- Activated when session expires or is disabled
- Disables all input fields and buttons
- Shows appropriate error messages

**State Management**:
```javascript
{
  sessionData: null,          // Current session data
  isReadOnly: false,          // Read-only flag
  lastSaveHash: null,         // Change detection
  saveTimeout: null,          // Debounce timer
  pollInterval: null          // Polling timer
}
```

**Session Status Indicators**:
- Active (green) - Normal operation
- Warning (yellow) - Expiring soon (<5 min)
- Expired (red) - Session expired or disabled

---

### 6. Sessions Manager Agent (`src/sessions.js`)

**Role**: Session dashboard and management interface

**Responsibilities**:
- Display all user sessions
- Enable/disable sessions
- Extend session expiration
- Delete sessions
- Copy shareable URLs
- Show session status and metadata

**Key Features**:

*Session Card Display*:
- Session ID
- Status badge (active/expired/disabled)
- Creation and expiration dates
- Time remaining countdown
- Participant count

*Management Actions*:
- Toggle active/inactive status
- Extend expiration (+24 hours)
- Delete with confirmation
- Copy URL to clipboard
- Open session in new tab

*Sorting Logic*:
- Active sessions first
- Then by creation date (newest first)

**UI Feedback**:
- Toast notifications for actions
- Loading states
- Error messages
- Success confirmations

---

### 7. Split Algorithm Agent (`src/split.js`)

**Role**: Core business logic for expense splitting

**Responsibilities**:
- Calculate fair splits with cent-level precision
- Minimize number of required transfers
- Handle edge cases and rounding

**Algorithm Overview**:

1. **Normalization**:
   - Convert amounts to integer cents
   - Validate and sanitize input
   - Assign default names if missing

2. **Target Share Calculation**:
   - Compute total amount
   - Calculate base share per person
   - Distribute remainder cents fairly
   - Deterministic tie-breaking (by amount paid, then name)

3. **Transfer Minimization**:
   - Identify creditors (overpaid) and debtors (underpaid)
   - Greedy matching: largest debtor → largest creditor
   - Generate minimal transfer set

**Key Functions**:
```javascript
computeTargetShares(participants)   // Fair shares per person
computeTransfers(participants)      // Minimal transfer list
computeSettlement(participants)     // Complete settlement plan
```

**Precision Handling**:
- All calculations in integer cents
- Prevents floating-point errors
- Guarantees sum preservation
- Maximum 1-cent difference between shares

---

## Data Flow Patterns

### Pattern 1: Session Creation Flow

```
[Main App Agent]
      │
      ├─ User clicks "Create Session"
      │
      ▼
[Server Agent]
      │
      ├─ POST /api/sessions
      ├─ Verify authentication
      │
      ▼
[Database Agent]
      │
      ├─ Generate UUID
      ├─ Set expiration time
      ├─ Insert into database
      │
      ▼
[Server Agent]
      │
      ├─ Return session ID and URL
      │
      ▼
[Main App Agent]
      │
      └─ Redirect to Sessions Manager
```

### Pattern 2: Collaborative Editing Flow

```
[Session Agent A]                    [Session Agent B]
      │                                    │
      ├─ User edits participant            │
      │                                    │
      ├─ 500ms debounce                    │
      │                                    │
      ├─ PUT /api/sessions/:id/data        │
      │         │                          │
      │         ▼                          │
      │   [Server Agent]                   │
      │         │                          │
      │         ▼                          │
      │   [Database Agent]                 │
      │         │                          │
      │         └──── Update data ────┐    │
      │                               │    │
      │                               ▼    │
      │                          [Database]│
      │                               │    │
      │    ┌──────── 5s poll ─────────┘    │
      │    │                               │
      │    ▼                               ▼
      │  GET /api/sessions/:id/data  ────► Detect change
      │                                    │
      │                                    ├─ Reload UI
      │                                    │
      │                                    └─ Show updated data
```

### Pattern 3: Session Cleanup Flow

```
[Server Agent]
      │
      ├─ setInterval (every 1 hour)
      │
      ▼
[Database Agent]
      │
      ├─ cleanupExpiredSessions()
      │
      ├─ SELECT sessions WHERE expires_at <= now()
      │
      ├─ DELETE expired sessions
      │
      └─ Return count deleted
```

## Security Model

### Authentication Layers

**Layer 1: Cookie-Based Authentication**
- Signed cookies prevent tampering
- HttpOnly flag prevents XSS
- SameSite=lax prevents CSRF

**Layer 2: Route Protection**
- Protected routes require authentication
- Public routes for session collaboration
- Middleware validates cookies on each request

**Layer 3: Owner Authorization**
- Management operations verify ownership
- Database queries include owner_id checks
- Prevents unauthorized modifications

**Layer 4: Session Access Control**
```javascript
isSessionAccessible(sessionId) {
  // Must be active AND not expired
  return session.isActive && session.expiresAt > Date.now()
}
```

### Public vs Protected Routes

**Protected (Auth Required)**:
- `/` - Main application
- `/sessions` - Session management dashboard
- `POST /api/sessions` - Create session
- `GET /api/sessions` - List sessions
- `PATCH /api/sessions/:id` - Update/extend session
- `DELETE /api/sessions/:id` - Delete session

**Public (No Auth)**:
- `/login.html` - Login page
- `/session/:id` - Session view
- `GET /api/sessions/:id/data` - Read session data
- `PUT /api/sessions/:id/data` - Update session data

## Real-Time Collaboration

### Polling Strategy

The application uses **polling** for real-time updates (simpler than WebSockets):

**Interval**: 5 seconds

**Process**:
1. Fetch latest session data
2. Compare hash with local data
3. If different, update UI
4. Re-calculate results if shown
5. Update session status

**Benefits**:
- Simple implementation
- Works with any HTTP server
- No WebSocket infrastructure needed
- Reliable across firewalls

**Trade-offs**:
- 5-second latency for updates
- Constant HTTP requests
- More server load than WebSockets

### Change Detection

Uses **content hashing** to detect changes:

```javascript
getDataHash(participants) {
  return JSON.stringify(
    participants.map(p => ({ name: p.name, amount: p.amount }))
  )
}
```

This prevents:
- Redundant saves
- UI flickering
- Lost updates
- Overwriting user input

## Configuration & Environment

### Environment Variables

```bash
# Server Configuration
PORT=5173                                    # Server port
NODE_ENV=production                          # Environment

# Authentication
DISABLE_AUTH=false                           # Enable/disable auth
LOGIN_USERNAME=admin                         # Default username
LOGIN_PASSWORD=password                      # Default password
SESSION_SECRET=dev-secret-change            # Cookie signing key

# Session Management
DEFAULT_SESSION_DURATION_HOURS=24           # Default expiration
MAX_SESSION_DURATION_HOURS=168              # Max duration (7 days)
SESSION_CLEANUP_INTERVAL_HOURS=1            # Cleanup frequency

# Database
DB_PATH=database/split.db                   # Database file location
```

### Deployment Modes

**Mode 1: Development (with auth)**
```bash
npm start
```

**Mode 2: Development (without auth)**
```bash
DISABLE_AUTH=true npm start
```

**Mode 3: Production (systemd service)**
```bash
# See scripts/install-systemd.sh
sudo systemctl start split.service
```

## Testing Architecture

### Test Coverage: 106 Tests

**Test Categories**:

1. **Unit Tests**
   - `split.test.js` - Algorithm logic (3 tests)
   - `sessions.test.js` - Database operations (21 tests)
   - `overlap.test.js` - Duplicate detection (1 test)

2. **Integration Tests**
   - `sessions-api.test.js` - API endpoints (25 tests)
   - `auth.test.js` - Authentication (7 tests)
   - `sessions-interaction.test.js` - Session collaboration (23 tests)
   - `sessions-expiration.test.js` - Expiration logic (12 tests)

3. **UI Tests**
   - `sessions-ui.test.js` - UI routing (13 tests)
   - `responsive.test.js` - Responsive design (1 test)

4. **Bug Fix Tests**
   - `session-data-wipeout-integration.test.js`
   - `session-data-structure-bug.test.js`
   - `sessions-delete-bug.test.js`
   - `delete-button-event-test.js`
   - And more...

**Test Framework**: Vitest + Supertest

**Test Database**: In-memory SQLite (`:memory:`)

## Agent Communication Protocols

### HTTP/REST API

**Content-Type**: `application/json`

**Authentication**: Signed cookies (`auth=ok`)

**Error Format**:
```json
{
  "error": "error_code_snake_case"
}
```

**Success Responses**:
- 200 OK - GET requests
- 201 Created - POST requests
- 204 No Content - DELETE/logout
- 401 Unauthorized - Auth failed
- 403 Forbidden - Authorization failed
- 404 Not Found - Resource not found

### Client-Side State Management

**Local State** (per agent):
- Component-level variables
- No global state store
- Event-driven updates

**Session State** (session.js):
- Managed via polling
- Synchronized with server
- Hash-based change detection

**UI State** (sessions.js):
- List managed in memory
- Optimistic updates
- Server confirmation

## Performance Considerations

### Database Optimizations

**Indexes**:
- `idx_sessions_owner` - Fast owner lookups
- `idx_sessions_expires_at` - Fast cleanup queries

**Query Patterns**:
- Prepared statements (better-sqlite3)
- Single-row lookups by primary key
- Minimal joins (denormalized data)

### Client-Side Optimizations

**Debouncing**:
- 500ms debounce on auto-save
- Prevents excessive API calls
- Improves server performance

**Lazy Loading**:
- Static assets served on-demand
- No bundler overhead
- Native ES modules

**Change Detection**:
- Hash-based comparison
- Prevents unnecessary DOM updates
- Reduces re-renders

### Polling Optimization

**5-Second Interval**:
- Balance between responsiveness and load
- Acceptable for this use case
- Can be adjusted if needed

**Conditional Updates**:
- Only update UI if data changed
- Only re-calculate if results shown
- Stop polling when read-only

## Extension Points

### Adding New Features

**1. New API Endpoint**:
```javascript
// In server.js
app.post('/api/new-feature', requireAuth, async (req, res) => {
  // Implementation
});
```

**2. New Database Function**:
```javascript
// In database/db.js
export function newFunction(params) {
  const database = getDb();
  // Implementation
}
```

**3. New UI Agent**:
```javascript
// Create new-feature.html
// Create src/new-feature.js
// Add route in server.js
```

### Suggested Enhancements

1. **WebSocket Support** - Replace polling with real-time push
2. **Export Functionality** - PDF/CSV export of results
3. **Session Templates** - Pre-configured participant groups
4. **Email Notifications** - Expiration warnings
5. **Session History** - Audit log of changes
6. **User Accounts** - Proper user management beyond simple auth
7. **Session Passwords** - Optional password protection
8. **Currency Support** - Multiple currencies
9. **Receipt Upload** - Image attachments
10. **Mobile App** - Native mobile clients

## Development Workflow

### Bug-Fixing Process

When fixing bugs in the Split Budget application, follow this Test-Driven Development (TDD) approach:

#### Step 1: Study and Hypothesize

**Objective**: Understand the bug and form a hypothesis about its cause

**Actions**:
1. Reproduce the bug consistently
2. Identify the affected component/agent
3. Study the relevant code paths
4. Trace data flow through the system
5. Form a clear hypothesis about the root cause

**Example**:
```
Bug: Session data gets wiped when updating participants
Hypothesis: The API endpoint might be overwriting the entire data object
instead of merging with existing data
```

#### Step 2: Write a Failing Test

**Objective**: Create a test that catches the bug and validates your hypothesis

**Actions**:
1. Create a new test file or add to existing test suite
2. Write a test that reproduces the bug
3. Ensure the test fails (confirming the bug exists)
4. The test should be specific and focused on the bug

**Example**:
```javascript
// test/session-data-bug.test.js
import { describe, it, expect } from 'vitest';
import { updateSession, getSession } from '../database/db.js';

describe('Session Data Update Bug', () => {
  it('should preserve existing data when updating participants', () => {
    // Setup: Create session with initial data
    const sessionId = createSession('owner', null, 24);
    updateSession(sessionId, { 
      participants: [{ name: 'Alice', amount: 100 }],
      metadata: { created: Date.now() }
    });
    
    // Action: Update only participants
    updateSession(sessionId, { 
      participants: [{ name: 'Bob', amount: 50 }]
    });
    
    // Assert: Metadata should still exist
    const session = getSession(sessionId);
    expect(session.data.metadata).toBeDefined(); // This should pass
    expect(session.data.participants).toHaveLength(1);
  });
});
```

#### Step 3: Fix Until Test Passes

**Objective**: Implement the fix and verify it works

**Actions**:
1. Make the minimal change needed to fix the bug
2. Run the new test - it should now pass
3. Run the full test suite - all tests should pass
4. If any tests fail, refine the fix
5. Verify the fix manually in the application

**Example**:
```javascript
// Before (buggy):
export function updateSession(sessionId, data) {
  const stmt = db.prepare('UPDATE sessions SET data = ? WHERE id = ?');
  stmt.run(JSON.stringify(data), sessionId); // Overwrites everything!
}

// After (fixed):
export function updateSession(sessionId, data) {
  const session = getSession(sessionId);
  const mergedData = { ...session.data, ...data }; // Merge data
  const stmt = db.prepare('UPDATE sessions SET data = ? WHERE id = ?');
  stmt.run(JSON.stringify(mergedData), sessionId);
}
```

#### Step 4: Verify and Document

**Actions**:
1. Run complete test suite: `npm test`
2. Test manually in the browser
3. Check for any regressions
4. Document the fix (optional: create a BUG_FIX_*.md file)
5. Commit with a clear message

**Test Output Example**:
```bash
✓ test/session-data-bug.test.js (1 test)
✓ test/sessions.test.js (21 tests)
✓ test/sessions-api.test.js (25 tests)
...
All tests passed!
```

### Benefits of This Approach

1. **Confidence**: The test proves the bug is fixed
2. **Regression Prevention**: Future changes won't reintroduce the bug
3. **Documentation**: The test serves as living documentation
4. **Validation**: Confirms your hypothesis was correct

### Test File Naming Convention

For bug-specific tests, follow this pattern:
- `{feature}-{bug-description}-bug.test.js`
- Examples:
  - `session-data-wipeout-integration.test.js`
  - `sessions-delete-bug.test.js`
  - `delete-button-event-test.js`

---

## Troubleshooting Guide

### Common Issues

**Issue 1: Session Not Found**
- Check if session expired
- Verify session ID in URL
- Check database for session record

**Issue 2: Auto-Save Not Working**
- Check browser console for errors
- Verify network connectivity
- Check session is not read-only

**Issue 3: Updates Not Syncing**
- Verify polling is active
- Check server logs
- Test API endpoint manually

**Issue 4: Authentication Failures**
- Verify cookies are enabled
- Check SESSION_SECRET matches
- Ensure auth is not disabled

### Debugging Tools

**Server Logs**:
```bash
# View logs in development
npm start

# View systemd logs
journalctl -u split.service -f
```

**Database Inspection**:
```bash
sqlite3 database/split.db
.schema sessions
SELECT * FROM sessions;
```

**API Testing**:
```bash
# Test endpoints with curl
curl http://localhost:5173/api/auth/status
```

## Conclusion

The Split Budget application is built with a modular, agent-based architecture where each component has clear responsibilities and well-defined interfaces. The system balances simplicity with functionality, using proven technologies (Express, SQLite, vanilla JavaScript) to deliver a reliable collaborative experience.

Key strengths:
- ✅ Clear separation of concerns
- ✅ Stateless server design
- ✅ Comprehensive test coverage
- ✅ Simple deployment model
- ✅ No frontend framework dependency
- ✅ Real-time collaboration via polling
- ✅ Robust security model

The architecture is designed for maintainability, with each agent being independently testable and replaceable. This document serves as a guide for developers working on the codebase, providing insight into how the system works and how to extend it.

---

**Document Version**: 1.0  
**Last Updated**: November 21, 2025  
**Maintainer**: Split Budget Development Team

