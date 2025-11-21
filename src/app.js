import { computeSettlement } from '/src/split.js';

const rowsContainer = document.getElementById('rows');
const addButton = document.getElementById('add');
const calculateButton = document.getElementById('calculate');
const resultsContainer = document.getElementById('results');
const sessionActionsContainer = document.getElementById('session-actions');
const mySessionsBtn = document.getElementById('my-sessions-btn');
const createSessionBtn = document.getElementById('create-session-btn');

function createRow(initialName = '', initialAmount = '') {
  const row = document.createElement('div');
  row.className = 'row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Name';
  nameInput.value = initialName;

  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.placeholder = '0.00';
  amountInput.min = '0';
  amountInput.step = '0.01';
  amountInput.inputMode = 'decimal';
  amountInput.value = initialAmount;

  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    rowsContainer.removeChild(row);
    if (rowsContainer.children.length === 0) {
      addEmptyRow();
    }
  });

  row.appendChild(nameInput);
  row.appendChild(amountInput);
  row.appendChild(removeButton);

  return row;
}

function addEmptyRow() {
  rowsContainer.appendChild(createRow());
}

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

function setResultsContent(element) {
  resultsContainer.innerHTML = '';
  resultsContainer.appendChild(element);
}

function showMessage(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  setResultsContent(div);
}

// Check authentication status and show session actions if authenticated
async function checkAuthAndShowSessionActions() {
  try {
    const response = await fetch('/api/auth/status');
    if (response.ok) {
      const data = await response.json();
      if (data.authenticated) {
        sessionActionsContainer.style.display = 'flex';
      }
    }
  } catch (error) {
    // If auth status check fails, just don't show the buttons
    console.error('Failed to check auth status:', error);
  }
}

// Session management handlers
if (mySessionsBtn) {
  mySessionsBtn.addEventListener('click', () => {
    window.location.href = '/sessions';
  });
}

if (createSessionBtn) {
  createSessionBtn.addEventListener('click', async () => {
    try {
      createSessionBtn.disabled = true;
      createSessionBtn.textContent = 'Creating...';
      
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const data = await response.json();
        // Redirect to the session management page
        window.location.href = '/sessions';
      } else {
        alert('Failed to create session. Please try again.');
        createSessionBtn.disabled = false;
        createSessionBtn.textContent = 'Create Session';
      }
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session. Please try again.');
      createSessionBtn.disabled = false;
      createSessionBtn.textContent = 'Create Session';
    }
  });
}

// Initialize with a couple of rows for convenience
addEmptyRow();
addEmptyRow();

// Check auth status on page load
checkAuthAndShowSessionActions();

addButton.addEventListener('click', () => {
  rowsContainer.appendChild(createRow());
});

calculateButton.addEventListener('click', async () => {
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
});


