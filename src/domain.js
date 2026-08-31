export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
export const initialState = { user: null, cows: [], milk: [], thresholds: { fat: 3.5, snf: 8.0 }, sync: { lastSyncedAt: null, pending: false, localUpdatedAt: 0, status: 'Local only' } };
export const expectedCalvingDate = (aiDate) => aiDate ? addDays(aiDate, 280) : '';
export const nextHeatDate = (heatDate) => heatDate ? addDays(heatDate, 21) : '';
export function summarizeMilk(milk, period = 'daily') { const groups = new Map(); milk.forEach((entry) => { const date = new Date(`${entry.date}T00:00:00`); let key = entry.date; if (period === 'weekly') key = `${date.getUTCFullYear()}-W${Math.ceil((((date - new Date(Date.UTC(date.getUTCFullYear(),0,1))) / 86400000) + 1) / 7)}`; if (period === 'monthly') key = entry.date.slice(0, 7); const row = groups.get(key) || { label: key, quantity: 0, fat: 0, snf: 0, count: 0 }; row.quantity += Number(entry.quantity || 0); row.fat += Number(entry.fat || 0); row.snf += Number(entry.snf || 0); row.count += 1; groups.set(key, row); }); return [...groups.values()].map((row) => ({ ...row, quantity: +row.quantity.toFixed(2), fat: +(row.fat / row.count).toFixed(2), snf: +(row.snf / row.count).toFixed(2) })); }

export function getTodayMilkSummary(milk, currentDate = today()) {
  let morning = 0;
  let evening = 0;
  (milk || []).forEach((entry) => {
    if (entry.date === currentDate) {
      const qty = Number(entry.quantity || 0);
      if (entry.session === 'Morning') morning += qty;
      else if (entry.session === 'Evening') evening += qty;
    }
  });
  return {
    morning: +morning.toFixed(2),
    evening: +evening.toFixed(2),
    total: +(morning + evening).toFixed(2)
  };
}

export function getMilkProductionForLastNDays(milk, days = 10, currentDate = today()) {
  const endDate = new Date(`${currentDate}T00:00:00`);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));

  const filtered = (milk || []).filter((entry) => {
    if (!entry.date) return false;
    const entryDate = new Date(`${entry.date}T00:00:00`);
    return entryDate >= startDate && entryDate <= endDate;
  });

  const summarized = summarizeMilk(filtered, 'daily');
  return summarized.sort((a, b) => a.label.localeCompare(b.label));
}
export function getAlerts(state) { const alerts = []; state.milk.forEach((entry) => { if (Number(entry.fat) < Number(state.thresholds.fat)) alerts.push(`Fat low on ${entry.date} ${entry.session}: ${entry.fat}%`); if (Number(entry.snf) < Number(state.thresholds.snf)) alerts.push(`SNF low on ${entry.date} ${entry.session}: ${entry.snf}%`); }); state.cows.forEach((cow) => { cow.breeding?.forEach((record) => { const heat = nextHeatDate(record.heatDate); const calving = expectedCalvingDate(record.aiDate); if (heat >= today()) alerts.push(`${cow.name}: expected heat around ${heat}`); if (record.pregnancyStatus === 'Pregnant' && calving >= today()) alerts.push(`${cow.name}: expected calving around ${calving}`); }); cow.health?.forEach((record) => { if (record.type === 'Vaccination' && record.nextDue >= today()) alerts.push(`${cow.name}: vaccination due ${record.nextDue}`); }); }); return alerts.slice(0, 8); }
