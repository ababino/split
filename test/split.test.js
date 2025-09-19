import { describe, it, expect } from 'vitest';
import { computeTransfers, computeTargetShares, applyTransfers } from '../src/split.js';

function sum(array) {
  return array.reduce((a, b) => a + b, 0);
}

describe('split algorithm', () => {
  it('preserves total amount and evens out balances (simple)', () => {
    const participants = [
      { name: 'Alice', amount: 40 },
      { name: 'Bob', amount: 0 },
      { name: 'Cara', amount: 20 },
    ];

    const initialTotal = sum(participants.map((p) => Math.round(p.amount * 100)));
    const shares = computeTargetShares(participants);
    const transfers = computeTransfers(participants);
    const finalCents = applyTransfers(participants, transfers);

    // sums preserved
    expect(sum(finalCents)).toBe(initialTotal);
    // each ends at target share
    for (let i = 0; i < participants.length; i += 1) {
      expect(finalCents[i]).toBe(shares[i]);
    }
  });

  it('handles rounding fairly when total not divisible by n', () => {
    const participants = [
      { name: 'A', amount: 10 },
      { name: 'B', amount: 10 },
      { name: 'C', amount: 10 },
    ];
    // Add a cent to make 30.01
    participants[0].amount = 10.01;

    const total = sum(participants.map((p) => Math.round(p.amount * 100)));
    const shares = computeTargetShares(participants);
    expect(sum(shares)).toBe(total);
    // Shares differ by at most 1 cent
    const minShare = Math.min(...shares);
    const maxShare = Math.max(...shares);
    expect(maxShare - minShare).toBeLessThanOrEqual(1);
  });

  it('minimal transfers example reduces to two transfers', () => {
    const participants = [
      { name: 'X', amount: 100 },
      { name: 'Y', amount: 0 },
      { name: 'Z', amount: 0 },
    ];
    const transfers = computeTransfers(participants);
    // One payer, two receivers -> at most two transfers in greedy settle
    expect(transfers.length).toBeLessThanOrEqual(2);
  });
});


