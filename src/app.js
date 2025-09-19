import { computeSettlement } from './split.js';

const rowsContainer = document.getElementById('rows');
const addButton = document.getElementById('add');
const calculateButton = document.getElementById('calculate');
const resultsContainer = document.getElementById('results');

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

// Initialize with a couple of rows for convenience
addEmptyRow();
addEmptyRow();

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

  const wrapper = document.createElement('div');
  if (transfers.length === 0) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'Everyone is settled. No transfers needed.';
    wrapper.appendChild(d);
  } else {
    for (const t of transfers) {
      const p = document.createElement('div');
      p.className = 'transfer';
      p.textContent = `${t.from} → ${t.to}: $${t.amount.toFixed(2)}`;
      wrapper.appendChild(p);
    }
  }
  setResultsContent(wrapper);
});


