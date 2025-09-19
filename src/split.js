/**
 * Splitting algorithm utilities
 * - Works in integer cents for accuracy
 * - Minimizes number of transfers by greedily settling largest debtor with largest creditor
 */

function toCents(amountNumber) {
  const n = Number(amountNumber);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

function fromCents(cents) {
  return Math.round(cents) / 100;
}

function normalizeParticipants(rawParticipants) {
  const normalized = [];
  for (let i = 0; i < rawParticipants.length; i += 1) {
    const p = rawParticipants[i] || {};
    const name = String(p.name ?? '').trim() || `Person ${i + 1}`;
    const amountCents = toCents(p.amount ?? 0);
    if (amountCents < 0) continue;
    normalized.push({ name, amountCents, index: i });
  }
  return normalized;
}

/**
 * Compute target shares (in cents) per participant such that:
 * - Sum of shares equals total
 * - Shares differ by at most 1 cent
 * - Extra cents (if any) go to participants who paid the most (stabilizes results)
 */
export function computeTargetShares(participants) {
  const ps = normalizeParticipants(participants);
  const n = ps.length;
  if (n === 0) return [];

  const total = ps.reduce((acc, p) => acc + p.amountCents, 0);
  const baseShare = Math.floor(total / n);
  let remainder = total - baseShare * n; // 0..n-1

  // Sort indices by who paid most, deterministic tie-breaker by name then index
  const byPaidDesc = [...ps]
    .map((p, i) => ({ i, paid: p.amountCents, name: p.name, idx: i }))
    .sort((a, b) => {
      if (b.paid !== a.paid) return b.paid - a.paid;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.idx - b.idx;
    })
    .map((x) => x.i);

  const shares = new Array(n).fill(baseShare);
  for (let k = 0; k < remainder; k += 1) {
    const idx = byPaidDesc[k];
    shares[idx] += 1;
  }

  return shares;
}

/**
 * Compute minimal-transfer settlement plan.
 * Returns a list of transfers: { from, to, amount }
 */
export function computeTransfers(participants) {
  const ps = normalizeParticipants(participants);
  const n = ps.length;
  if (n <= 1) return [];

  const shares = computeTargetShares(ps.map((p) => ({ name: p.name, amount: fromCents(p.amountCents) })));

  // Balances: positive => should receive; negative => should pay
  const balances = ps.map((p, i) => ({ name: p.name, balance: p.amountCents - shares[i] }));
  const creditors = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const debtors = balances.filter((b) => b.balance < 0).sort((a, b) => a.balance - b.balance); // most negative first

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(creditor.balance, -debtor.balance);

    if (amount > 0) {
      transfers.push({ from: debtor.name, to: creditor.name, amount: fromCents(amount) });
      debtor.balance += amount; // less negative
      creditor.balance -= amount; // less positive
    }

    if (debtor.balance === 0) i += 1;
    if (creditor.balance === 0) j += 1;
  }

  return transfers;
}

/**
 * Convenience: apply transfers to initial amounts, returning final amounts in cents.
 */
export function applyTransfers(participants, transfers) {
  const ps = normalizeParticipants(participants);
  const amounts = ps.map((p) => p.amountCents);
  const nameToIndex = new Map(ps.map((p, idx) => [p.name, idx]));

  for (const t of transfers) {
    const fromIdx = nameToIndex.get(t.from);
    const toIdx = nameToIndex.get(t.to);
    const cents = toCents(t.amount);
    if (fromIdx === undefined || toIdx === undefined) continue;
    // Net paid after settlement = initial paid + outgoing - incoming
    amounts[fromIdx] += cents; // sender pays more
    amounts[toIdx] -= cents;   // receiver pays less
  }
  return amounts;
}

export function computeSettlement(participants) {
  const transfers = computeTransfers(participants);
  const shares = computeTargetShares(participants);
  return { transfers, shares };
}


