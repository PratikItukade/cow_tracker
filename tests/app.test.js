import assert from 'node:assert/strict';
import { expectedCalvingDate, nextHeatDate, summarizeMilk, getAlerts, initialState, getTodayMilkSummary, getMilkProductionForLastNDays } from '../src/domain.js';
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

// Test getTodayMilkSummary
const testMilkData = [
  { id: '1', date: '2026-03-30', session: 'Morning', quantity: 15.5, fat: 3.8, snf: 8.2 },
  { id: '2', date: '2026-03-30', session: 'Evening', quantity: 12.0, fat: 4.0, snf: 8.5 },
  { id: '3', date: '2026-03-20', session: 'Morning', quantity: 14.0, fat: 3.7, snf: 8.1 },
  { id: '4', date: '2026-03-01', session: 'Morning', quantity: 10.0, fat: 3.5, snf: 8.0 }
];

const todaySummary = getTodayMilkSummary(testMilkData, '2026-03-30');
assert.equal(todaySummary.morning, 15.5);
assert.equal(todaySummary.evening, 12.0);
assert.equal(todaySummary.total, 27.5);

// Test getMilkProductionForLastNDays
const last10 = getMilkProductionForLastNDays(testMilkData, 10, '2026-03-30');
assert.equal(last10.length, 1);
assert.equal(last10[0].label, '2026-03-30');
assert.equal(last10[0].quantity, 27.5);

const last20 = getMilkProductionForLastNDays(testMilkData, 20, '2026-03-30');
assert.equal(last20.length, 2);
assert.equal(last20[0].label, '2026-03-20');
assert.equal(last20[1].label, '2026-03-30');

const last30 = getMilkProductionForLastNDays(testMilkData, 30, '2026-03-30');
assert.equal(last30.length, 3);

console.log('app logic tests passed');
