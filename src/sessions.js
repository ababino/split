// Sessions management page logic

const loadingDiv = document.getElementById('loading');
const sessionsListDiv = document.getElementById('sessions-list');
const errorContainer = document.getElementById('error-container');
const homeBtn = document.getElementById('home-btn');
const createSessionBtn = document.getElementById('create-session-btn');

let sessions = [];

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

// Navigate back to home
if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    window.location.href = '/';
  });
}

// Create new session
if (createSessionBtn) {
  createSessionBtn.addEventListener('click', async () => {
    await createSession();
  });
}

// Show error message
function showError(message) {
  errorContainer.innerHTML = `
    <div class="error-message">
      ${message}
    </div>
  `;
}

// Clear error message
function clearError() {
  errorContainer.innerHTML = '';
}

// Format timestamp to readable date
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Check if session is expired
function isExpired(expiresAt) {
  return Date.now() > expiresAt;
}

// Get time remaining until expiration
function getTimeRemaining(expiresAt) {
  const now = Date.now();
  const remaining = expiresAt - now;
  
  if (remaining <= 0) return 'Expired';
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

// Get session status
function getSessionStatus(session) {
  if (isExpired(session.expiresAt)) return 'expired';
  if (!session.isActive) return 'disabled';
  return 'active';
}

// Copy URL to clipboard
async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = '✓ Copied!';
    button.disabled = true;
    showToast('Session URL copied to clipboard!', 'success');
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy:', error);
    showToast('Failed to copy URL. Please copy manually.', 'error');
  }
}

// Create session card HTML
function createSessionCard(session) {
  const status = getSessionStatus(session);
  const sessionUrl = `${window.location.origin}/session/${session.id}`;
  
  const card = document.createElement('div');
  card.className = `session-card ${status}`;
  card.dataset.sessionId = session.id;
  
  const statusLabel = status === 'active' ? 'Active' : 
                     status === 'expired' ? 'Expired' : 'Disabled';
  
  card.innerHTML = `
    <div class="session-header">
      <div class="session-info">
        <div class="session-id">${session.id}</div>
        <div class="session-meta">
          <div class="session-meta-item">
            <span>Status:</span>
            <span class="status-badge ${status}">${statusLabel}</span>
          </div>
          <div class="session-meta-item">
            <span>Created:</span>
            <span>${formatDate(session.createdAt)}</span>
          </div>
          <div class="session-meta-item">
            <span>Expires:</span>
            <span>${formatDate(session.expiresAt)}</span>
          </div>
          <div class="session-meta-item">
            <span>${getTimeRemaining(session.expiresAt)}</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="session-url">
      <input type="text" value="${sessionUrl}" readonly>
      <button class="copy-btn" data-session-id="${session.id}">Copy URL</button>
      <button class="open-btn" data-session-id="${session.id}">Open</button>
    </div>
    
    <div class="session-actions">
      ${status !== 'expired' ? `
        <button class="toggle-btn ${status === 'active' ? 'warning' : 'success'}" data-session-id="${session.id}">
          ${status === 'active' ? 'Disable' : 'Enable'}
        </button>
      ` : ''}
      ${status === 'active' ? `
        <button class="extend-btn" data-session-id="${session.id}">Extend +24h</button>
      ` : ''}
      <button class="delete-btn danger" data-session-id="${session.id}">Delete</button>
    </div>
  `;
  
  return card;
}

// Render sessions list
function renderSessions() {
  clearError();
  
  if (sessions.length === 0) {
    sessionsListDiv.innerHTML = `
      <div class="empty-state">
        <h2>No Sessions Yet</h2>
        <p>Create your first session to start collaborating with others.</p>
        <button id="empty-create-btn" class="success">+ Create New Session</button>
      </div>
    `;
    
    const emptyCreateBtn = document.getElementById('empty-create-btn');
    if (emptyCreateBtn) {
      emptyCreateBtn.addEventListener('click', createSession);
    }
  } else {
    sessionsListDiv.innerHTML = '<div class="sessions-container"></div>';
    const container = sessionsListDiv.querySelector('.sessions-container');
    
    // Sort sessions: active first, then by creation date (newest first)
    const sortedSessions = [...sessions].sort((a, b) => {
      const statusA = getSessionStatus(a);
      const statusB = getSessionStatus(b);
      
      if (statusA === 'active' && statusB !== 'active') return -1;
      if (statusA !== 'active' && statusB === 'active') return 1;
      
      return b.createdAt - a.createdAt;
    });
    
    sortedSessions.forEach(session => {
      container.appendChild(createSessionCard(session));
    });
    
    attachEventListeners();
  }
}

// Attach event listeners to session actions
function attachEventListeners() {
  // Copy URL buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sessionId = e.target.dataset.sessionId;
      const url = `${window.location.origin}/session/${sessionId}`;
      await copyToClipboard(url, e.target);
    });
  });
  
  // Open session buttons
  document.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sessionId = e.target.dataset.sessionId;
      window.open(`/session/${sessionId}`, '_blank');
    });
  });
  
  // Toggle status buttons
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sessionId = e.target.dataset.sessionId;
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        await toggleSessionStatus(sessionId, !session.isActive);
      }
    });
  });
  
  // Extend expiration buttons
  document.querySelectorAll('.extend-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sessionId = e.target.dataset.sessionId;
      await extendSession(sessionId);
    });
  });
  
  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sessionId = e.target.dataset.sessionId;
      await deleteSession(sessionId);
    });
  });
}

// Load sessions from API
async function loadSessions() {
  try {
    loadingDiv.style.display = 'block';
    sessionsListDiv.style.display = 'none';
    
    const response = await fetch('/api/sessions');
    
    if (!response.ok) {
      throw new Error('Failed to load sessions');
    }
    
    const data = await response.json();
    sessions = data.sessions || [];
    
    loadingDiv.style.display = 'none';
    sessionsListDiv.style.display = 'block';
    
    renderSessions();
  } catch (error) {
    console.error('Error loading sessions:', error);
    loadingDiv.style.display = 'none';
    sessionsListDiv.style.display = 'block';
    showError('Failed to load sessions. Please refresh the page.');
  }
}

// Create new session
async function createSession() {
  try {
    createSessionBtn.disabled = true;
    createSessionBtn.textContent = 'Creating...';
    
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error('Failed to create session');
    }
    
    const data = await response.json();
    
    // Reload sessions to show the new one
    await loadSessions();
    
    // Show success message
    showToast('Session created successfully!', 'success');
    
    // Scroll to top to show the new session
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
  } catch (error) {
    console.error('Error creating session:', error);
    showError('Failed to create session. Please try again.');
    showToast('Failed to create session', 'error');
  } finally {
    createSessionBtn.disabled = false;
    createSessionBtn.textContent = '+ Create New Session';
  }
}

// Toggle session active status
async function toggleSessionStatus(sessionId, isActive) {
  try {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive })
    });
    
    if (!response.ok) {
      throw new Error('Failed to update session');
    }
    
    // Update local data
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.isActive = isActive;
      renderSessions();
      showToast(`Session ${isActive ? 'enabled' : 'disabled'} successfully`, 'success');
    }
  } catch (error) {
    console.error('Error toggling session:', error);
    showError('Failed to update session status. Please try again.');
    showToast('Failed to update session status', 'error');
  }
}

// Extend session expiration
async function extendSession(sessionId) {
  try {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extend: 24 })
    });
    
    if (!response.ok) {
      throw new Error('Failed to extend session');
    }
    
    const data = await response.json();
    
    // Update local data
    const session = sessions.find(s => s.id === sessionId);
    if (session && data.session && data.session.expiresAt) {
      session.expiresAt = data.session.expiresAt;
      renderSessions();
      showToast('Session extended by 24 hours', 'success');
    }
  } catch (error) {
    console.error('Error extending session:', error);
    showError('Failed to extend session. Please try again.');
    showToast('Failed to extend session', 'error');
  }
}

// Delete session
async function deleteSession(sessionId) {
  const confirmed = confirm('Are you sure you want to delete this session? This action cannot be undone.');
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete session');
    }
    
    // Remove from local data
    sessions = sessions.filter(s => s.id !== sessionId);
    renderSessions();
    showToast('Session deleted successfully', 'success');
  } catch (error) {
    console.error('Error deleting session:', error);
    showError('Failed to delete session. Please try again.');
    showToast('Failed to delete session', 'error');
  }
}

// Load sessions on page load
loadSessions();

