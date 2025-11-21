# Sessions Feature Specification

## Overview
Enable users to create shareable split budget sessions with unique URLs that can be accessed without authentication. This allows teams to collaboratively add expenses and calculate settlements without requiring individual logins.

## Feature Description

### Core Functionality
- **Session Creation**: Authenticated users can create a new session, which generates a unique, shareable URL
- **Collaborative Splitting**: Anyone with the session URL can:
  - View all participants and amounts
  - Add/remove participants
  - Add/remove amounts
  - Run settlement calculations
  - See real-time updates from other users
- **No Authentication Required**: Session URLs are accessible without login credentials
- **Time-Limited Access**: Sessions expire after a configurable duration (default: 24 hours)
- **Session Management**: Session owners can:
  - View all their sessions
  - Enable/disable sessions manually
  - Extend or modify expiration times
  - Delete sessions

### User Flows

#### Flow 1: Creating and Sharing a Session
1. User logs into the application
2. User clicks "Create Session" button
3. System generates a unique session URL (e.g., `/session/abc123xyz`)
4. User copies and shares the URL with team members
5. Team members open the URL without logging in
6. All participants can add their expenses and see results

#### Flow 2: Managing Existing Sessions
1. User logs into the application
2. User navigates to "My Sessions" page
3. User sees a list of their active and expired sessions with:
   - Session ID/name
   - Creation date
   - Expiration date/time
   - Status (active/expired/disabled)
   - Access link
4. User can:
   - Click to open a session
   - Toggle session active/inactive status
   - Extend expiration time
   - Delete a session

#### Flow 3: Accessing a Shared Session
1. User receives a session URL from a friend
2. User opens the URL in their browser
3. If session is active and not expired:
   - User sees the split interface with existing data
   - User can interact with the session
4. If session is expired or disabled:
   - User sees an error message explaining the session is no longer available

## Technical Requirements

### Data Persistence
- Sessions must persist data on the server (currently all data is client-side)
- Each session stores:
  - Unique session ID
  - Owner user ID (the authenticated user who created it)
  - Creation timestamp
  - Expiration timestamp
  - Active/disabled status
  - Participants array (name, amount)
  - Optional: session name/description

### Real-time Collaboration (Optional Enhancement)
- Multiple users editing the same session should see updates
- Options: WebSockets, Server-Sent Events, or polling

### Security Considerations
- Session IDs must be cryptographically secure (e.g., UUIDs or random tokens)
- Rate limiting to prevent abuse
- Maximum session duration (e.g., 7 days)
- Automatic cleanup of expired sessions
- Owner authentication required for management operations

---

## Implementation Plan

### Phase 1: Data Persistence Layer

**Tasks:**
1. **Choose and set up a database**
   - Options: SQLite (simplest), PostgreSQL, or JSON file storage
   - Recommended: SQLite for simplicity and no external dependencies
   - Location: `server.js` database initialization

2. **Create database schema**
   - Sessions table with fields:
     - `id` (TEXT PRIMARY KEY) - unique session identifier
     - `owner_id` (TEXT) - username of creator
     - `name` (TEXT) - optional session name
     - `created_at` (INTEGER) - Unix timestamp
     - `expires_at` (INTEGER) - Unix timestamp
     - `is_active` (BOOLEAN) - manual enable/disable
     - `data` (TEXT) - JSON string with participants array
   
3. **Create data access functions**
   - `createSession(ownerId, name, expirationHours)`
   - `getSession(sessionId)`
   - `updateSession(sessionId, data)`
   - `listSessionsByOwner(ownerId)`
   - `deleteSession(sessionId, ownerId)`
   - `toggleSessionStatus(sessionId, ownerId, isActive)`
   - `extendSessionExpiration(sessionId, ownerId, additionalHours)`
   - `cleanupExpiredSessions()` - run periodically

### Phase 2: Backend API Endpoints

**New Routes in `server.js`:**

1. **Session Creation** (Protected - requires authentication)
   - `POST /api/sessions`
   - Request body: `{ name?: string, expirationHours?: number }`
   - Response: `{ sessionId: string, url: string, expiresAt: timestamp }`

2. **Session List** (Protected - requires authentication)
   - `GET /api/sessions`
   - Response: `{ sessions: [{ id, name, createdAt, expiresAt, isActive, url }] }`

3. **Session Management** (Protected - requires authentication)
   - `PATCH /api/sessions/:sessionId` - update status or expiration
   - `DELETE /api/sessions/:sessionId` - delete session

4. **Public Session Access** (No authentication required)
   - `GET /api/sessions/:sessionId/data` - get session data
   - Returns 404 if expired/disabled/not found
   
5. **Public Session Update** (No authentication required)
   - `PUT /api/sessions/:sessionId/data` - update participants/amounts
   - Request body: `{ participants: [{ name, amount }] }`
   - Returns 404 if expired/disabled/not found

### Phase 3: Frontend UI Updates

**Tasks:**

1. **Update main application (`index.html` / `src/app.js`)**
   - Add "Create Session" button
   - Add "My Sessions" button/link
   - Both visible when user is authenticated

2. **Create session management page**
   - New file: `sessions.html` - lists user's sessions
   - New file: `src/sessions.js` - handles session management UI
   - Features:
     - Table/list of sessions
     - Copy URL button for each session
     - Enable/disable toggle
     - Extend expiration button
     - Delete button with confirmation
     - Visual indicators for expired sessions

3. **Create session view page**
   - New file: `session.html` - displays a specific session
   - New file: `src/session.js` - handles session interaction
   - Reuses split calculation logic from `src/split.js`
   - Shows session expiration time
   - Indicates if session is read-only or editable
   - Auto-saves changes to server
   - Optional: polling for updates every 5-10 seconds

4. **Update routing in `server.js`**
   - Serve `session.html` for `/session/:sessionId` routes (no auth required)
   - Serve `sessions.html` for `/sessions` route (auth required)
   - Serve corresponding JS files without auth for session pages

### Phase 4: Session Interaction Logic

**Tasks:**

1. **Implement auto-save in session view**
   - Debounce user input (500ms delay)
   - Send `PUT /api/sessions/:sessionId/data` on changes
   - Show save status (saving/saved/error)

2. **Implement data refresh**
   - Option A: Polling every 10 seconds for updates
   - Option B: Long-polling or Server-Sent Events (more complex)
   - Option C: WebSockets (most complex, best UX)
   - Recommended: Start with polling (Option A)

3. **Handle expired/disabled sessions**
   - Show appropriate error messages
   - Disable editing when session is expired
   - Provide link to login and create new session

### Phase 5: Background Tasks

**Tasks:**

1. **Implement session cleanup**
   - Run `cleanupExpiredSessions()` periodically
   - Options:
     - Simple `setInterval` in `server.js`
     - Cron-like scheduled task
     - On-demand cleanup when accessing sessions
   - Recommended: `setInterval` running every hour

2. **Add session expiration notifications** (Optional)
   - Email/notification before session expires
   - Requires additional email infrastructure

### Phase 6: Testing

**Tasks:**

1. **Create test files**
   - `test/sessions.test.js` - test session CRUD operations
   - `test/sessions-api.test.js` - test API endpoints
   - `test/sessions-expiration.test.js` - test expiration logic

2. **Test scenarios**
   - Creating sessions as authenticated user
   - Accessing sessions without authentication
   - Updating session data
   - Expired session access (should fail)
   - Disabled session access (should fail)
   - Owner-only operations
   - Session cleanup
   - Data persistence across server restarts

### Phase 7: Polish & Documentation

**Tasks:**

1. **Add UI polish**
   - Loading states
   - Error messages
   - Success confirmations
   - Responsive design for mobile
   - Copy-to-clipboard feedback

2. **Update documentation**
   - Update `README.md` with session feature explanation
   - Add environment variables for session defaults
   - Document API endpoints
   - Add usage examples

3. **Add configuration options**
   - Environment variables:
     - `DEFAULT_SESSION_DURATION_HOURS` (default: 24)
     - `MAX_SESSION_DURATION_HOURS` (default: 168 = 7 days)
     - `SESSION_CLEANUP_INTERVAL_HOURS` (default: 1)

---

## Technical Stack Additions

**Dependencies to Add:**
- `better-sqlite3` or `sqlite3` - for SQLite database
- `uuid` - for generating secure session IDs
- Optional: `ws` - for WebSocket support if implementing real-time updates

**File Structure Changes:**
```
/Users/andres/Documents/split/
├── database/
│   ├── schema.sql          # Database schema
│   ├── db.js               # Database initialization and queries
│   └── split.db            # SQLite database file (gitignored)
├── session.html            # Session view page
├── sessions.html           # Session management page
├── src/
│   ├── session.js          # Session view logic
│   └── sessions.js         # Session management logic
└── test/
    ├── sessions.test.js
    ├── sessions-api.test.js
    └── sessions-expiration.test.js
```

---

## Success Criteria

1. ✅ Authenticated users can create shareable sessions
2. ✅ Session URLs are accessible without login
3. ✅ Multiple users can collaborate on a session
4. ✅ Sessions expire after configured duration
5. ✅ Session owners can manage (enable/disable/extend/delete) their sessions
6. ✅ Data persists across server restarts
7. ✅ Expired sessions return appropriate error messages
8. ✅ All existing functionality continues to work
9. ✅ Tests cover new functionality
10. ✅ Documentation is updated

---

## Future Enhancements (Out of Scope)

- Named sessions with descriptions
- Session history/audit log
- Export session results to PDF/CSV
- Session templates
- Email notifications before expiration
- User accounts with email verification
- Session password protection
- Real-time WebSocket updates
- Session analytics (views, edits, etc.)