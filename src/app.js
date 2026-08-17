import { expectedCalvingDate, getAlerts, initialState, nextHeatDate, summarizeMilk, today } from './domain.js';
import { isFirebaseConfigured, onFirebaseAuthChange, syncUserState } from './firebase-service.js';
const STORE_KEY = 'cow-tracker-state-v1';
const routes = ['home', 'cows', 'milk', 'alerts', 'export'];

let showCowForm = false;
const expandedCowIds = new Set();

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
  if (value === 'breeding' || value === 'health') return 'cows';
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
  const pages = { home: renderHome, cows: renderCows, milk: renderMilk, alerts: renderAlerts, export: renderExport };
  const pageRender = pages[route] || renderHome;
  pageRender();
  bindSharedEvents();
}

function pageTitle(value) {
  return ({ cows: 'Cow Profiles', milk: 'Milk Session', alerts: 'Alerts & Reminders', export: 'Export' })[value];
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
    ${homeCard('cows', '📅', 'Breeding', 'Managed in Cow Profiles')}
    ${homeCard('cows', '💉', 'Health', 'Managed in Cow Profiles')}
    ${homeCard('alerts', '🔔', 'Alerts & Reminders', `${alerts.length} active reminders`)}
    ${homeCard('export', '📤', 'Export', 'CSV and print/PDF reports')}
  </section>`);
}

function homeCard(routeName, icon, title, summary) {
  return `<button class="featureCard" data-route="${routeName}"><span>${icon}</span><strong>${title}</strong><small>${summary}</small></button>`;
}

function renderCows() {
  renderShell(`<section class="card">
    <div class="cardHeader">
      <h2>Cow profiles</h2>
      <button id="toggleCowFormBtn" class="addCowBtn">${showCowForm ? '✕ Close' : '+ Add Cow'}</button>
    </div>
    ${showCowForm ? `
      <form id="cowForm" class="cowForm">
        <input name="name" placeholder="Tag / name" required>
        <input name="photoFile" type="file" accept="image/*" capture="environment">
        <select name="status">
          <option>In milk</option>
          <option>Heifer</option>
          <option>Dry</option>
        </select>
        <button type="submit">Add cow</button>
      </form>
    ` : ''}
    <div class="list">${state.cows.map(profileCard).join('') || '<p>No cows added yet.</p>'}</div>
  </section>`);
}

function profileCard(cow) {
  const photo = cow.photo ? `<img class="cowPhoto" src="${cow.photo}" alt="${cow.name}">` : '<div class="cowPhoto placeholder">🐄</div>';
  const isOpen = expandedCowIds.has(cow.id);

  const breedingRecords = (cow.breeding || []).map((b) => {
    const details = [];
    if (b.heatDate) details.push(`Heat: ${b.heatDate}${nextHeatDate(b.heatDate) ? ` (Next: ${nextHeatDate(b.heatDate)})` : ''}`);
    if (b.aiDate) details.push(`AI: ${b.aiDate}${expectedCalvingDate(b.aiDate) ? ` (Calving: ${expectedCalvingDate(b.aiDate)})` : ''}`);
    if (b.pregnancyStatus) details.push(`Status: ${b.pregnancyStatus}`);
    return `<div class="recordItem"><strong>${b.pregnancyStatus || 'Breeding Record'}</strong><p>${details.join(' · ')}</p></div>`;
  }).join('') || '<p class="emptyText">No breeding records yet.</p>';

  const healthRecords = (cow.health || []).map((h) => {
    const details = [];
    if (h.date) details.push(`Date: ${h.date}`);
    if (h.nextDue) details.push(`Next due: ${h.nextDue}`);
    if (h.notes) details.push(`Notes: ${h.notes}`);
    return `<div class="recordItem"><strong>${h.type || 'Health Record'}</strong><p>${details.join(' · ')}</p></div>`;
  }).join('') || '<p class="emptyText">No health records yet.</p>';

  return `<details class="profileCard" data-id="${cow.id}" ${isOpen ? 'open' : ''}>
    <summary class="profileSummary">
      ${photo}
      <div class="profileInfo">
        <h3>${cow.name}</h3>
        <p class="statusBadge">${cow.status}</p>
        <p class="summaryText">${cow.breeding?.length || 0} breeding records · ${cow.health?.length || 0} health records</p>
      </div>
    </summary>
    <div class="profileDetails">
      <div class="cowSection">
        <h4>📅 Breeding</h4>
        <form data-cow="${cow.id}" class="breedForm">
          <div class="formRow">
            <label>Heat date<input name="heatDate" type="date"></label>
            <label>AI date<input name="aiDate" type="date"></label>
            <label>Pregnancy status
              <select name="pregnancyStatus">
                <option>Open</option>
                <option>Pregnant</option>
                <option>Unknown</option>
              </select>
            </label>
          </div>
          <button type="submit">Add breeding</button>
        </form>
        <div class="recordsList">${breedingRecords}</div>
      </div>

      <div class="cowSection">
        <h4>💉 Health</h4>
        <form data-cow="${cow.id}" class="healthForm">
          <div class="formRow">
            <label>Type
              <select name="type">
                <option>Vaccination</option>
                <option>Illness</option>
                <option>Treatment</option>
              </select>
            </label>
            <label>Date<input name="date" type="date" value="${today()}"></label>
            <label>Next due<input name="nextDue" type="date"></label>
            <label>Notes<input name="notes" placeholder="Notes"></label>
          </div>
          <button type="submit">Add health</button>
        </form>
        <div class="recordsList">${healthRecords}</div>
      </div>
    </div>
  </details>`;
}

function renderMilk() {
  renderShell(`<section class="card"><h2>Milk session</h2><form id="milkForm"><input name="date" type="date" value="${today()}" required><select name="session"><option>Morning</option><option>Evening</option></select><input name="quantity" type="number" step="0.1" placeholder="Litres" required><input name="fat" type="number" step="0.1" placeholder="Fat %" required><input name="snf" type="number" step="0.1" placeholder="SNF %" required><button>Add milk</button></form><label>Fat alert <input id="fatThreshold" type="number" step="0.1" value="${state.thresholds.fat}"></label><label>SNF alert <input id="snfThreshold" type="number" step="0.1" value="${state.thresholds.snf}"></label><div class="chart">${summarizeMilk(state.milk).map(bar).join('') || '<p>No milk entries yet.</p>'}</div></section>`);
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
  document.querySelector('#loginBtn')?.addEventListener('click', () => { state.user = { email: document.querySelector('#email').value }; saveState(state); render(); });

  document.querySelector('#toggleCowFormBtn')?.addEventListener('click', () => {
    showCowForm = !showCowForm;
    render();
  });

  document.querySelector('#cowForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    const photo = await readCowPhoto(e.target.photoFile);
    delete data.photoFile;
    state.cows.push({ id: uid(), ...data, photo, breeding: [], health: [] });
    showCowForm = false;
    saveState(state);
    render();
  });

  document.querySelectorAll('details.profileCard').forEach((el) => {
    el.addEventListener('toggle', () => {
      const cowId = el.dataset.id;
      if (el.open) {
        expandedCowIds.add(cowId);
      } else {
        expandedCowIds.delete(cowId);
      }
    });
  });

  document.querySelector('#milkForm')?.addEventListener('submit', (e) => { e.preventDefault(); state.milk.push({ id: uid(), ...formData(e.target) }); saveState(state); render(); });
  document.querySelectorAll('.breedForm').forEach((form) => form.onsubmit = (e) => {
    e.preventDefault();
    const cow = state.cows.find((c) => c.id === form.dataset.cow);
    if (cow) {
      if (!cow.breeding) cow.breeding = [];
      cow.breeding.push(formData(form));
      saveState(state);
      render();
    }
  });
  document.querySelectorAll('.healthForm').forEach((form) => form.onsubmit = (e) => {
    e.preventDefault();
    const cow = state.cows.find((c) => c.id === form.dataset.cow);
    if (cow) {
      if (!cow.health) cow.health = [];
      cow.health.push(formData(form));
      saveState(state);
      render();
    }
  });
  document.querySelector('#fatThreshold')?.addEventListener('change', (e) => { state.thresholds.fat = e.target.value; saveState(state); render(); });
  document.querySelector('#snfThreshold')?.addEventListener('change', (e) => { state.thresholds.snf = e.target.value; saveState(state); render(); });
  document.querySelector('#csvBtn')?.addEventListener('click', exportCsv);
  document.querySelector('#pdfBtn')?.addEventListener('click', () => print());
}

function syncNow() {
  state.sync = { pending: false, lastSyncedAt: new Date().toISOString() };
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  render();
}

function exportCsv() {
  const rows = [['type','cow','date','session','quantity','fat','snf','notes'], ...state.milk.map((m) => ['milk','',m.date,m.session,m.quantity,m.fat,m.snf,'']), ...state.cows.flatMap((c) => [...(c.breeding || []).map((b) => ['breeding',c.name,b.aiDate || b.heatDate,'','','','',b.pregnancyStatus]), ...(c.health || []).map((h) => ['health',c.name,h.date,'','','','',`${h.type} ${h.notes || ''}`])])];
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'dairy-herd-export.csv' });
  link.click();
}

onFirebaseAuthChange(async (user) => {
  if (!user) return;
  state.user = { uid: user.uid, email: user.email };
  state = await syncUserState(user.uid, state);
  render();
});
window.addEventListener('hashchange', render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();
