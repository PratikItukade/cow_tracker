import { getAlerts, initialState, summarizeMilk, today } from './domain.js';
import { isFirebaseConfigured, loginOrCreateUser, onFirebaseAuthChange, pullUserState, pushUserState, syncUserState } from './firebase-service.js';
const STORE_KEY = 'cow-tracker-state-v1';
const routes = ['home', 'cows', 'milk', 'breeding', 'health', 'alerts', 'export'];

function loadState() {
  return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || structuredClone(initialState);
}

function saveState(state) {
  state.sync.pending = true;
  state.sync.localUpdatedAt = Date.now();
  state.sync.status = state.user?.uid && isFirebaseConfigured() ? 'Pending cloud sync' : 'Saved locally';
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = loadState();
let route = getRoute();
const app = document.querySelector('#app');
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

function getRoute() {
  const value = location.hash.replace('#/', '') || 'home';
  return routes.includes(value) ? value : 'home';
}

function navigate(nextRoute) {
  location.hash = `#/${nextRoute}`;
}

function renderShell(content) {
  const title = route === 'home' ? 'Dairy Herd Manager' : pageTitle(route);
  app.innerHTML = `
    <header><div><p class="eyebrow">Offline-first PWA</p><h1>${title}</h1></div><button id="syncBtn">${navigator.onLine ? 'Sync now' : 'Offline'}</button></header>
    ${route === 'home' ? authSection() : '<button class="backBtn" id="homeBtn">← Home</button>'}
    ${content}`;
  document.querySelector('#syncBtn').onclick = syncNow;
  if (route !== 'home') document.querySelector('#homeBtn').onclick = () => navigate('home');
}

function render() {
  route = getRoute();
  const pages = { home: renderHome, cows: renderCows, milk: renderMilk, breeding: renderBreeding, health: renderHealth, alerts: renderAlerts, export: renderExport };
  pages[route]();
  bindSharedEvents();
}

function pageTitle(value) {
  return ({ cows: 'Cow Profiles', milk: 'Milk Session', breeding: 'Breeding', health: 'Health', alerts: 'Alerts & Reminders', export: 'Export' })[value];
}

function authSection() {
  return `<section class="auth card"><h2>Single-user login</h2><input id="email" type="email" placeholder="Email" value="${state.user?.email || ''}"><input id="password" type="password" placeholder="Password"><button id="loginBtn">Save login</button><p>${authStatusText()}</p></section>`;
}

function authStatusText() {
  if (!isFirebaseConfigured()) return 'Firebase config missing — saved locally until src/firebase-config.js is updated.';
  if (state.user?.email) return `Backup account: ${state.user.email} · ${state.sync?.status || 'Cloud sync ready'}`;
  return 'Login enables Firebase cloud backup and cross-device sync.';
}

function renderHome() {
  const alerts = getAlerts(state);
  renderShell(`<section class="homeGrid">
    ${homeCard('cows', '🐄', 'Cow Profiles', `${state.cows.length} cows / heifers`)}
    ${homeCard('milk', '🥛', 'Milk Session', `${state.milk.length} session entries`)}
    ${homeCard('breeding', '📅', 'Breeding', 'Heat, AI and pregnancy records')}
    ${homeCard('health', '💉', 'Health', 'Vaccination and treatment logs')}
    ${homeCard('alerts', '🔔', 'Alerts & Reminders', `${alerts.length} active reminders`)}
    ${homeCard('export', '📤', 'Export', 'CSV and print/PDF reports')}
  </section>`);
}

function homeCard(routeName, icon, title, summary) {
  return `<button class="featureCard" data-route="${routeName}"><span>${icon}</span><strong>${title}</strong><small>${summary}</small></button>`;
}

function renderCows() {
  renderShell(`<section class="card"><h2>Cow profiles</h2><form id="cowForm"><input name="name" placeholder="Tag / name" required><input name="photoFile" type="file" accept="image/*" capture="environment"><select name="status"><option>In milk</option><option>Heifer</option><option>Dry</option></select><button>Add cow</button></form><div class="list">${state.cows.map(profileCard).join('') || '<p>No cows added yet.</p>'}</div></section>`);
}

function profileCard(cow) {
  const photo = cow.photo ? `<img class="cowPhoto" src="${cow.photo}" alt="${cow.name}">` : '<div class="cowPhoto placeholder">🐄</div>';
  return `<article class="profile">${photo}<div><h3>${cow.name}</h3><p>${cow.status}</p><p>${cow.breeding?.length || 0} breeding records · ${cow.health?.length || 0} health records</p></div></article>`;
}

function renderMilk() {
  renderShell(`<section class="card"><h2>Milk session</h2><form id="milkForm"><input name="date" type="date" value="${today()}" required><select name="session"><option>Morning</option><option>Evening</option></select><input name="quantity" type="number" step="0.1" placeholder="Litres" required><input name="fat" type="number" step="0.1" placeholder="Fat %" required><input name="snf" type="number" step="0.1" placeholder="SNF %" required><button>Add milk</button></form><label>Fat alert <input id="fatThreshold" type="number" step="0.1" value="${state.thresholds.fat}"></label><label>SNF alert <input id="snfThreshold" type="number" step="0.1" value="${state.thresholds.snf}"></label><div class="chart">${summarizeMilk(state.milk).map(bar).join('') || '<p>No milk entries yet.</p>'}</div></section>`);
}

function renderBreeding() {
  renderShell(`<section class="card"><h2>Breeding</h2><div class="list">${state.cows.map(breedingCard).join('') || '<p>Add cows first from Cow Profiles.</p>'}</div></section>`);
}

function breedingCard(cow) {
  return `<details><summary>${cow.name} — ${cow.status}</summary><form data-cow="${cow.id}" class="breedForm"><input name="heatDate" type="date"><input name="aiDate" type="date"><select name="pregnancyStatus"><option>Open</option><option>Pregnant</option><option>Unknown</option></select><button>Add breeding</button></form><pre>${JSON.stringify(cow.breeding || [], null, 2)}</pre></details>`;
}

function renderHealth() {
  renderShell(`<section class="card"><h2>Health</h2><div class="list">${state.cows.map(healthCard).join('') || '<p>Add cows first from Cow Profiles.</p>'}</div></section>`);
}

function healthCard(cow) {
  return `<details><summary>${cow.name} — ${cow.status}</summary><form data-cow="${cow.id}" class="healthForm"><select name="type"><option>Vaccination</option><option>Illness</option><option>Treatment</option></select><input name="date" type="date" value="${today()}"><input name="nextDue" type="date"><input name="notes" placeholder="Notes"><button>Add health</button></form><pre>${JSON.stringify(cow.health || [], null, 2)}</pre></details>`;
}

function renderAlerts() {
  const alerts = getAlerts(state);
  renderShell(`<section class="card"><h2>Alerts & reminders</h2>${alerts.map((a) => `<p class="alert">${a}</p>`).join('') || '<p>No active reminders.</p>'}</section>`);
}

function renderExport() {
  renderShell(`<section class="card"><h2>Export</h2><p>Export per-cow breeding/health records and herd-level milk trend data.</p><button id="csvBtn">Download Excel CSV</button><button id="pdfBtn">Print / save PDF</button></section>`);
}

function bar(row) { return `<div><span>${row.label}</span><meter min="0" max="100" value="${row.quantity}"></meter><b>${row.quantity} L</b></div>`; }
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function readCowPhoto(input) {
  const file = input?.files?.[0];
  if (!file) return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function bindSharedEvents() {
  document.querySelectorAll('.featureCard').forEach((card) => card.onclick = () => navigate(card.dataset.route));
  document.querySelector('#loginBtn')?.addEventListener('click', login); 
  document.querySelector('#cowForm')?.addEventListener('submit', async (e) => { e.preventDefault(); const data = formData(e.target); const photo = await readCowPhoto(e.target.photoFile); delete data.photoFile; state.cows.push({ id: uid(), ...data, photo, breeding: [], health: [] }); saveState(state); render(); });
  document.querySelector('#milkForm')?.addEventListener('submit', (e) => { e.preventDefault(); state.milk.push({ id: uid(), ...formData(e.target) }); saveState(state); render(); });
  document.querySelectorAll('.breedForm').forEach((form) => form.onsubmit = (e) => { e.preventDefault(); state.cows.find((c) => c.id === form.dataset.cow).breeding.push(formData(form)); saveState(state); render(); });
  document.querySelectorAll('.healthForm').forEach((form) => form.onsubmit = (e) => { e.preventDefault(); state.cows.find((c) => c.id === form.dataset.cow).health.push(formData(form)); saveState(state); render(); });
  document.querySelector('#fatThreshold')?.addEventListener('change', (e) => { state.thresholds.fat = e.target.value; saveState(state); render(); });
  document.querySelector('#snfThreshold')?.addEventListener('change', (e) => { state.thresholds.snf = e.target.value; saveState(state); render(); });
  document.querySelector('#csvBtn')?.addEventListener('click', exportCsv);
  document.querySelector('#pdfBtn')?.addEventListener('click', () => print());
}
async function login() {
  const email = document.querySelector('#email').value;
  const password = document.querySelector('#password').value;
  if (!isFirebaseConfigured()) {
    state.user = { email };
    saveState(state);
    render();
    return;
  }
  state.sync.status = 'Signing in...';
  render();
  const credential = await loginOrCreateUser(email, password);
  state.user = { uid: credential.user.uid, email: credential.user.email };
  await pullFromCloud();
}

async function syncNow() {
  if (!state.user?.uid || !isFirebaseConfigured()) {
    state.sync = { ...state.sync, pending: false, lastSyncedAt: new Date().toISOString(), status: 'Local sync only — Firebase not connected' };
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    render();
    return;
  }
  state.sync.status = 'Syncing with Firebase...';
  render();
  state = await syncUserState(state.user.uid, state);
  state.sync = { ...state.sync, pending: false, lastSyncedAt: new Date().toISOString(), status: 'Synced with Firebase' };
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  render();
}

async function pullFromCloud() {
  const remote = await pullUserState(state.user.uid);
  if (remote) {
    state = {
      ...state,
      cows: remote.cows || [],
      milk: remote.milk || [],
      thresholds: remote.thresholds || state.thresholds,
      sync: { pending: false, localUpdatedAt: remote.localUpdatedAt || Date.now(), lastSyncedAt: new Date().toISOString(), status: 'Loaded Firebase backup' },
    };
  } else {
    await pushUserState(state.user.uid, state);
    state.sync = { ...state.sync, pending: false, lastSyncedAt: new Date().toISOString(), status: 'Created Firebase backup' };
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  render();
}
function exportCsv() {
  const rows = [['type','cow','date','session','quantity','fat','snf','notes'], ...state.milk.map((m) => ['milk','',m.date,m.session,m.quantity,m.fat,m.snf,'']), ...state.cows.flatMap((c) => [...c.breeding.map((b) => ['breeding',c.name,b.aiDate || b.heatDate,'','','','',b.pregnancyStatus]), ...c.health.map((h) => ['health',c.name,h.date,'','','','',`${h.type} ${h.notes || ''}`])])];
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'dairy-herd-export.csv' });
  link.click();
}

onFirebaseAuthChange(async (user) => {
  if (!user) return;
  state.user = { uid: user.uid, email: user.email };
  await pullFromCloud();
});
window.addEventListener('hashchange', render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();
