import { computeSettlement } from './split.js';

// Get session ID from URL
const pathParts = window.location.pathname.split('/');
const sessionId = pathParts[pathParts.length - 1];

const loadingDiv = document.getElementById('loading');
const errorContainer = document.getElementById('error-container');
const sessionContainer = document.getElementById('session-container');
const sessionIdDisplay = document.getElementById('session-id');
const sessionStatusDisplay = document.getElementById('session-status');
const saveStatusDisplay = document.getElementById('save-status');
const rowsContainer = document.getElementById('rows');
const addButton = document.getElementById('add');
const calculateButton = document.getElementById('calculate');
const resultsContainer = document.getElementById('results');

let sessionData = null;
let isReadOnly = false;
let saveTimeout = null;
let pollInterval = null;
let lastSaveHash = null;

// Show error banner
function showError(title, message) {
  errorContainer.innerHTML = `
    <div class="error-banner">
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
  sessionContainer.style.display = 'none';
  loadingDiv.style.display = 'none';
}

// Update save status
function updateSaveStatus(status, text) {
  saveStatusDisplay.className = `save-status ${status}`;
  saveStatusDisplay.textContent = text;
}

// Check if session is expired
function isExpired(expiresAt) {
  return Date.now() > expiresAt;
}

// Get time remaining
function getTimeRemaining(expiresAt) {
  const now = Date.now();
  const remaining = expiresAt - now;
  
  if (remaining <= 0) return 'Expired';
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} left`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  if (minutes > 5) {
    return `${minutes}m left`;
  }
  return 'Expiring soon!';
}

// Update session status display
function updateSessionStatus() {
  if (!sessionData) return;
  
  const expired = isExpired(sessionData.expiresAt);
  const timeLeft = getTimeRemaining(sessionData.expiresAt);
  
  let statusClass = 'active';
  let statusText = timeLeft;
  
  if (expired) {
    statusClass = 'expired';
    statusText = 'Expired';
    isReadOnly = true;
  } else if (!sessionData.isActive) {
    statusClass = 'expired';
    statusText = 'Disabled';
    isReadOnly = true;
  } else if (timeLeft.includes('soon')) {
    statusClass = 'warning';
  }
  
  sessionStatusDisplay.innerHTML = `
    <span class="status-indicator ${statusClass}">${statusText}</span>
  `;
  
  // Disable inputs if read-only
  if (isReadOnly) {
    const inputs = rowsContainer.querySelectorAll('input');
    inputs.forEach(input => input.disabled = true);
    const buttons = rowsContainer.querySelectorAll('button');
    buttons.forEach(button => button.disabled = true);
    addButton.disabled = true;
    updateSaveStatus('', 'Session is read-only');
  }
}

// Create a row
function createRow(initialName = '', initialAmount = '') {
  const row = document.createElement('div');
  row.className = 'row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Name';
  nameInput.value = initialName;
  nameInput.disabled = isReadOnly;
  nameInput.addEventListener('input', scheduleAutoSave);

  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.placeholder = '0.00';
  amountInput.min = '0';
  amountInput.step = '0.01';
  amountInput.inputMode = 'decimal';
  amountInput.value = initialAmount;
  amountInput.disabled = isReadOnly;
  amountInput.addEventListener('input', scheduleAutoSave);

  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.disabled = isReadOnly;
  removeButton.addEventListener('click', () => {
    rowsContainer.removeChild(row);
    if (rowsContainer.children.length === 0) {
      addEmptyRow();
    }
    scheduleAutoSave();
  });

  row.appendChild(nameInput);
  row.appendChild(amountInput);
  row.appendChild(removeButton);

  return row;
}

// Add empty row
function addEmptyRow() {
  rowsContainer.appendChild(createRow());
}

// Get participants from UI
function getParticipantsFromUI() {
  const participants = [];
  for (const row of rowsContainer.children) {
    const [nameInput, amountInput] = row.querySelectorAll('input');
    const name = nameInput.value.trim();
    const amount = amountInput.value.trim();
    if (!name || amount === '') continue;
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    participants.push({ name, amount: parsed });
  }
  return participants;
}

// Load participants into UI
function loadParticipantsIntoUI(participants) {
  rowsContainer.innerHTML = '';
  
  if (!participants || participants.length === 0) {
    addEmptyRow();
    addEmptyRow();
    return;
  }
  
  participants.forEach(p => {
    rowsContainer.appendChild(createRow(p.name, p.amount));
  });
}

// Calculate hash of current data for change detection
function getDataHash(participants) {
  return JSON.stringify(participants.map(p => ({ name: p.name, amount: p.amount })));
}

// Set results content
function setResultsContent(element) {
  resultsContainer.innerHTML = '';
  resultsContainer.appendChild(element);
}

// Show message
function showMessage(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  setResultsContent(div);
}

// Schedule auto-save
function scheduleAutoSave() {
  if (isReadOnly) return;
  
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  updateSaveStatus('saving', 'Saving...');
  
  saveTimeout = setTimeout(async () => {
    await saveSession();
  }, 500);
}

// Save session data to server
async function saveSession() {
  if (isReadOnly) return;
  
  try {
    const participants = getParticipantsFromUI();
    const dataHash = getDataHash(participants);
    
    // Don't save if data hasn't changed
    if (dataHash === lastSaveHash) {
      updateSaveStatus('saved', 'Saved');
      return;
    }
    
    const response = await fetch(`/api/sessions/${sessionId}/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participants })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save');
    }
    
    lastSaveHash = dataHash;
    updateSaveStatus('saved', 'Saved');
  } catch (error) {
    console.error('Error saving session:', error);
    updateSaveStatus('error', 'Save failed');
  }
}

// Load session data from server
async function loadSession() {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/data`);
    
    if (!response.ok) {
      if (response.status === 404) {
        showError(
          'Session Not Found',
          'This session has expired, been deleted, or never existed. Please contact the session owner for a new link.'
        );
      } else {
        showError(
          'Error Loading Session',
          'Failed to load session data. Please try refreshing the page.'
        );
      }
      return false;
    }
    
    const data = await response.json();
    sessionData = data;
    
    // Check if session is expired or disabled
    if (isExpired(data.expiresAt)) {
      isReadOnly = true;
      showError(
        'Session Expired',
        'This session has expired and is now read-only. Please contact the session owner to create a new session.'
      );
      return false;
    }
    
    if (!data.isActive) {
      isReadOnly = true;
      showError(
        'Session Disabled',
        'This session has been disabled by the owner and is now read-only.'
      );
      return false;
    }
    
    // Display session info
    sessionIdDisplay.textContent = sessionId;
    updateSessionStatus();
    
    // Load participants
    loadParticipantsIntoUI(data.participants || []);
    lastSaveHash = getDataHash(data.participants || []);
    
    // Show the session container
    loadingDiv.style.display = 'none';
    sessionContainer.style.display = 'block';
    updateSaveStatus('saved', 'Saved');
    
    return true;
  } catch (error) {
    console.error('Error loading session:', error);
    showError(
      'Error Loading Session',
      'An unexpected error occurred. Please try refreshing the page.'
    );
    return false;
  }
}

// Poll for updates from other users
async function pollForUpdates() {
  if (isReadOnly) return;
  
  try {
    const response = await fetch(`/api/sessions/${sessionId}/data`);
    
    if (!response.ok) {
      // Session might have been deleted or disabled
      if (response.status === 404) {
        stopPolling();
        showError(
          'Session No Longer Available',
          'This session has been deleted or disabled by the owner.'
        );
      }
      return;
    }
    
    const data = await response.json();
    
    // Check if session status changed
    if (isExpired(data.expiresAt) || !data.isActive) {
      stopPolling();
      location.reload();
      return;
    }
    
    // Update session data
    sessionData = data;
    updateSessionStatus();
    
    // Check if data changed (from another user)
    const serverHash = getDataHash(data.participants || []);
    const currentHash = getDataHash(getParticipantsFromUI());
    
    if (serverHash !== currentHash && serverHash !== lastSaveHash) {
      // Data changed externally, reload UI
      loadParticipantsIntoUI(data.participants || []);
      lastSaveHash = serverHash;
      
      // Re-calculate if there are results showing
      if (resultsContainer.querySelector('.summary')) {
        calculateResults();
      }
    }
  } catch (error) {
    console.error('Error polling for updates:', error);
  }
}

// Start polling for updates
function startPolling() {
  // Poll every 5 seconds
  pollInterval = setInterval(pollForUpdates, 5000);
}

// Stop polling
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Calculate results
function calculateResults() {
  const participants = getParticipantsFromUI();
  if (participants.length === 0) {
    showMessage('Please add at least one participant.');
    return;
  }

  const { transfers } = computeSettlement(participants);

  // Calculate total and per-person amount
  const totalAmount = participants.reduce((sum, p) => sum + p.amount, 0);
  const perPersonAmount = totalAmount / participants.length;

  const wrapper = document.createElement('div');
  
  // Add summary section
  const summary = document.createElement('div');
  summary.className = 'summary';
  
  const totalDiv = document.createElement('div');
  totalDiv.className = 'summary-item';
  totalDiv.textContent = `Total Amount: $${totalAmount.toFixed(2)}`;
  
  const perPersonDiv = document.createElement('div');
  perPersonDiv.className = 'summary-item';
  perPersonDiv.textContent = `Amount per Person: $${perPersonAmount.toFixed(2)}`;
  
  summary.appendChild(totalDiv);
  summary.appendChild(perPersonDiv);
  wrapper.appendChild(summary);

  // Add transfers section
  const transfersDiv = document.createElement('div');
  transfersDiv.className = 'transfers-section';
  
  if (transfers.length === 0) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'Everyone is settled. No transfers needed.';
    transfersDiv.appendChild(d);
  } else {
    const transfersTitle = document.createElement('div');
    transfersTitle.className = 'transfers-title';
    transfersTitle.textContent = 'Transfers:';
    transfersDiv.appendChild(transfersTitle);
    
    for (const t of transfers) {
      const p = document.createElement('div');
      p.className = 'transfer';
      p.textContent = `${t.from} → ${t.to}: $${t.amount.toFixed(2)}`;
      transfersDiv.appendChild(p);
    }
  }
  
  wrapper.appendChild(transfersDiv);
  setResultsContent(wrapper);
}

// Event listeners
if (addButton) {
  addButton.addEventListener('click', () => {
    if (!isReadOnly) {
      addEmptyRow();
    }
  });
}

if (calculateButton) {
  calculateButton.addEventListener('click', calculateResults);
}

// Initialize
async function init() {
  const loaded = await loadSession();
  if (loaded) {
    startPolling();
  }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopPolling();
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
});

// Start the app
init();

