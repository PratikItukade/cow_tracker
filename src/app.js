import { getAlerts, initialState, summarizeMilk, today } from './domain.js';
const STORE_KEY = 'cow-tracker-state-v1';
function loadState() {
  return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || initialState;
}

function saveState(state) {
  state.sync.pending = true;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = loadState();
const app = document.querySelector('#app');
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

function render() {
  const alerts = getAlerts(state);
  app.innerHTML = `
    <header><div><p class="eyebrow">Offline-first PWA</p><h1>Dairy Herd Manager</h1></div><button id="syncBtn">${navigator.onLine ? 'Sync now' : 'Offline'}</button></header>
    <section class="auth card"><h2>Single-user login</h2><input id="email" type="email" placeholder="Email" value="${state.user?.email || ''}"><input id="password" type="password" placeholder="Password"><button id="loginBtn">Save login</button><p>${state.user ? `Backup account: ${state.user.email}` : 'Login enables cloud backup when sync is connected.'}</p></section>
    <section class="grid"><article class="card"><h2>Cow profiles</h2><form id="cowForm"><input name="name" placeholder="Tag / name" required><input name="photo" placeholder="Photo URL"><select name="status"><option>In milk</option><option>Heifer</option><option>Dry</option></select><button>Add cow</button></form><div class="list">${state.cows.map(cowCard).join('') || '<p>No cows added yet.</p>'}</div></article>
    <article class="card"><h2>Milk session</h2><form id="milkForm"><input name="date" type="date" value="${today()}" required><select name="session"><option>Morning</option><option>Evening</option></select><input name="quantity" type="number" step="0.1" placeholder="Litres" required><input name="fat" type="number" step="0.1" placeholder="Fat %" required><input name="snf" type="number" step="0.1" placeholder="SNF %" required><button>Add milk</button></form><label>Fat alert <input id="fatThreshold" type="number" step="0.1" value="${state.thresholds.fat}"></label><label>SNF alert <input id="snfThreshold" type="number" step="0.1" value="${state.thresholds.snf}"></label><div class="chart">${summarizeMilk(state.milk).map(bar).join('')}</div></article></section>
    <section class="card"><h2>Alerts & reminders</h2>${alerts.map((a) => `<p class="alert">${a}</p>`).join('') || '<p>No active reminders.</p>'}</section>
    <section class="card"><h2>Export</h2><button id="csvBtn">Download Excel CSV</button><button id="pdfBtn">Print / save PDF</button></section>`;
  bindEvents();
}

function cowCard(cow) {
  return `<details><summary>${cow.name} — ${cow.status}</summary><form data-cow="${cow.id}" class="breedForm"><input name="heatDate" type="date"><input name="aiDate" type="date"><select name="pregnancyStatus"><option>Open</option><option>Pregnant</option><option>Unknown</option></select><button>Add breeding</button></form><form data-cow="${cow.id}" class="healthForm"><select name="type"><option>Vaccination</option><option>Illness</option><option>Treatment</option></select><input name="date" type="date" value="${today()}"><input name="nextDue" type="date"><input name="notes" placeholder="Notes"><button>Add health</button></form><pre>${JSON.stringify({ breeding: cow.breeding, health: cow.health }, null, 2)}</pre></details>`;
}
function bar(row) { return `<div><span>${row.label}</span><meter min="0" max="100" value="${row.quantity}"></meter><b>${row.quantity} L</b></div>`; }
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function bindEvents() {
  document.querySelector('#loginBtn').onclick = () => { state.user = { email: document.querySelector('#email').value }; saveState(state); render(); };
  document.querySelector('#cowForm').onsubmit = (e) => { e.preventDefault(); state.cows.push({ id: uid(), ...formData(e.target), breeding: [], health: [] }); saveState(state); render(); };
  document.querySelector('#milkForm').onsubmit = (e) => { e.preventDefault(); state.milk.push({ id: uid(), ...formData(e.target) }); saveState(state); render(); };
  document.querySelectorAll('.breedForm').forEach((form) => form.onsubmit = (e) => { e.preventDefault(); state.cows.find((c) => c.id === form.dataset.cow).breeding.push(formData(form)); saveState(state); render(); });
  document.querySelectorAll('.healthForm').forEach((form) => form.onsubmit = (e) => { e.preventDefault(); state.cows.find((c) => c.id === form.dataset.cow).health.push(formData(form)); saveState(state); render(); });
  document.querySelector('#fatThreshold').onchange = (e) => { state.thresholds.fat = e.target.value; saveState(state); render(); };
  document.querySelector('#snfThreshold').onchange = (e) => { state.thresholds.snf = e.target.value; saveState(state); render(); };
  document.querySelector('#csvBtn').onclick = exportCsv;
  document.querySelector('#pdfBtn').onclick = () => print();
  document.querySelector('#syncBtn').onclick = () => { state.sync = { pending: false, lastSyncedAt: new Date().toISOString() }; localStorage.setItem(STORE_KEY, JSON.stringify(state)); render(); };
}
function exportCsv() {
  const rows = [['type','cow','date','session','quantity','fat','snf','notes'], ...state.milk.map((m) => ['milk','',m.date,m.session,m.quantity,m.fat,m.snf,'']), ...state.cows.flatMap((c) => [...c.breeding.map((b) => ['breeding',c.name,b.aiDate || b.heatDate,'','','','',b.pregnancyStatus]), ...c.health.map((h) => ['health',c.name,h.date,'','','','',`${h.type} ${h.notes || ''}`])])];
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'dairy-herd-export.csv' });
  link.click();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
render();
