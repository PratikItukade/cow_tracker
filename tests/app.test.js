import assert from 'node:assert/strict';
import { expectedCalvingDate, nextHeatDate, summarizeMilk, getAlerts, initialState } from '../src/domain.js';
assert.equal(expectedCalvingDate('2026-01-01'), '2026-10-08');
assert.equal(nextHeatDate('2026-01-01'), '2026-01-22');
assert.deepEqual(summarizeMilk([{ date: '2026-01-01', quantity: 10, fat: 3, snf: 8 }, { date: '2026-01-01', quantity: 12, fat: 4, snf: 8.5 }]), [{ label: '2026-01-01', quantity: 22, fat: 3.5, snf: 8.25, count: 2 }]);
const state = structuredClone(initialState);
state.milk = [
  { id: 'm1', date: '2026-01-01', session: 'Morning', quantity: 10, fat: 3.1, snf: 7.5 },
  { id: 'm2', date: '2026-01-01', session: 'Evening', quantity: 12, fat: 4.0, snf: 8.5 }
];
assert.equal(getAlerts(state).length, 2);
assert.equal(summarizeMilk(state.milk).length, 1);
assert.equal(summarizeMilk(state.milk)[0].quantity, 22);

// Simulate deleting an entry
state.milk = state.milk.filter((m) => m.id !== 'm1');
assert.equal(state.milk.length, 1);
assert.equal(getAlerts(state).length, 0);
assert.equal(summarizeMilk(state.milk)[0].quantity, 12);

console.log('app logic tests passed');
