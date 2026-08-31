import { getAlerts, initialState, summarizeMilk, today, expectedCalvingDate, nextHeatDate, getTodayMilkSummary, getMilkProductionForLastNDays } from './domain.js';
import { isFirebaseConfigured, loginOrCreateUser, logoutUser, onFirebaseAuthChange, pullUserState, pushUserState, syncUserState } from './firebase-service.js';

const routes = ['home', 'cows', 'milk', 'alerts'];
let showAddCowForm = false;
let showAddMilkForm = false;
let showAuthModal = false;
let isSigningIn = false;
let authError = '';
let selectedMilkDays = 10;
const openCowIds = new Set();

function getStoreKey(user) {
  if (user?.uid) return `cow-tracker-state-uid-${user.uid}`;
  if (user?.email) return `cow-tracker-state-email-${user.email.toLowerCase().trim()}`;
  return 'cow-tracker-state-anon';
}

function migrateLegacyState() {
  const legacy = localStorage.getItem('cow-tracker-state-v1');
  if (!legacy) return;
  try {
    const parsed = JSON.parse(legacy);
    if (parsed && typeof parsed === 'object') {
      const key = getStoreKey(parsed.user);
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    }
  } catch (err) {
    console.error('Failed to migrate legacy state:', err);
  }
  localStorage.removeItem('cow-tracker-state-v1');
}

function getActiveUserFromStorage() {
  try {
    const stored = localStorage.getItem('cow-tracker-active-user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function ensureMilkIds(stateToEnsure) {
  if (Array.isArray(stateToEnsure?.milk)) {
    stateToEnsure.milk.forEach((entry) => {
      if (!entry.id) {
        entry.id = uid();
      }
    });
  }
  return stateToEnsure;
}

function loadStateForUser(user) {
  migrateLegacyState();
  const storeKey = getStoreKey(user);
  const stored = localStorage.getItem(storeKey);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      parsed.user = user || null;
      return ensureMilkIds(parsed);
    } catch (err) {
      console.error('Failed to parse stored state:', err);
    }
  }
  const fresh = structuredClone(initialState);
  fresh.user = user || null;
  return ensureMilkIds(fresh);
}

function saveState(stateToSave) {
  const activeUser = stateToSave.user || null;
  const storeKey = getStoreKey(activeUser);
  stateToSave.sync.pending = true;
  stateToSave.sync.localUpdatedAt = Date.now();
  stateToSave.sync.status = activeUser?.uid && isFirebaseConfigured() ? 'Pending cloud sync' : 'Saved locally';
  localStorage.setItem(storeKey, JSON.stringify(stateToSave));
  if (activeUser) {
    localStorage.setItem('cow-tracker-active-user', JSON.stringify(activeUser));
  } else {
    localStorage.removeItem('cow-tracker-active-user');
  }
}

let activeUser = getActiveUserFromStorage();
let state = loadStateForUser(activeUser);
let route = getRoute();
const app = document.querySelector('#app');
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

function getRoute() {
  const value = location.hash.replace('#/', '') || 'home';
  if (value === 'breeding' || value === 'health') return 'cows';
  if (value === 'export') return 'home';
  return routes.includes(value) ? value : 'home';
}

function navigate(nextRoute) {
  location.hash = `#/${nextRoute}`;
}

function renderShell(content) {
  const title = route === 'home' ? 'Dairy Herd Manager' : pageTitle(route);
  const accountLabel = state.user?.email ? '👤 Account' : '👤 Login';
  app.innerHTML = `
    <header>
      <div><p class="eyebrow">Offline-first PWA</p><h1>${title}</h1></div>
      <div class="headerActions">
        <button id="exportAllBtn" class="btnSecondary" title="Export all data (CSV)">📥 Export All</button>
        <button id="accountBtn" class="btnSecondary">${accountLabel}</button>
        <button id="syncBtn">${navigator.onLine ? 'Sync now' : 'Offline'}</button>
      </div>
    </header>
    ${showAuthModal ? authModal() : ''}
    ${route === 'home' ? '' : '<button class="backBtn" id="homeBtn">← Home</button>'}
    ${content}`;
  document.querySelector('#syncBtn').onclick = syncNow;
  document.querySelector('#accountBtn').onclick = () => {
    showAuthModal = !showAuthModal;
    authError = '';
    render();
  };
  if (route !== 'home') document.querySelector('#homeBtn').onclick = () => navigate('home');
}

function render() {
  route = getRoute();
  const pages = { home: renderHome, cows: renderCows, milk: renderMilk, alerts: renderAlerts };
  pages[route]();
  bindSharedEvents();
}

function pageTitle(value) {
  return ({ cows: 'Cow Profiles', milk: 'Milk Session', alerts: 'Alerts & Reminders' })[value];
}

function authModal() {
  const btnContent = isSigningIn
    ? '<span class="spinner"></span> Signing in...'
    : 'Sign in / Create account';

  const isLoggedIn = Boolean(state.user?.email);

  if (isLoggedIn) {
    return `<div class="modalOverlay" id="authOverlay">
      <div class="authModal card">
        <div class="modalHeader">
          <h2>Account Status</h2>
          <button id="closeAuthBtn" class="btnClose">✕</button>
        </div>
        <p class="authHelperText">Signed in as <strong>${state.user.email}</strong></p>
        <p class="authStatusP">${authStatusText()}</p>
        <div class="modalActions" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button id="logoutBtn" type="button" class="btnSecondary">Sign Out</button>
        </div>
      </div>
    </div>`;
  }

  return `<div class="modalOverlay" id="authOverlay">
    <div class="authModal card">
      <div class="modalHeader">
        <h2>Cloud Backup Login</h2>
        <button id="closeAuthBtn" class="btnClose">✕</button>
      </div>
      <p class="authHelperText">Sign in to back up your data to the cloud and access it from any device.</p>
      <form id="loginForm" onsubmit="return false;">
        <label>Email Address
          <input id="email" type="email" placeholder="you@example.com" value="${state.user?.email || ''}" ${isSigningIn ? 'disabled' : ''}>
        </label>
        <label>Password
          <input id="password" type="password" placeholder="Password" ${isSigningIn ? 'disabled' : ''}>
        </label>
        <button id="loginBtn" type="button" ${isSigningIn ? 'disabled' : ''}>${btnContent}</button>
      </form>
      <p class="authNote"><small>💡 New here? Just enter an email and password to automatically create your account.</small></p>
      ${authError ? `<p class="authErrorP">⚠️ ${authError}</p>` : ''}
      <p class="authStatusP">${authStatusText()}</p>
    </div>
  </div>`;
}

function authStatusText() {
  if (!isFirebaseConfigured()) return 'Firebase config missing — saved locally until src/firebase-config.js is updated.';
  if (state.user?.email) return `Backup account: ${state.user.email} · ${state.sync?.status || 'Cloud sync ready'}`;
  return 'Login enables Firebase cloud backup and cross-device sync.';
}

function renderHome() {
  const alerts = getAlerts(state);
  const chartData = getMilkProductionForLastNDays(state.milk, selectedMilkDays);
  const maxQty = Math.max(...chartData.map((d) => d.quantity), 100);
  const todaySummary = getTodayMilkSummary(state.milk);

  const rangeButtons = [10, 20, 30].map((days) => {
    const activeClass = selectedMilkDays === days ? 'btnToggle active' : 'btnToggle';
    return `<button class="${activeClass}" data-days="${days}">${days} Days</button>`;
  }).join(' ');

  const chartHtml = renderMilkLineChart(chartData);

  renderShell(`
    <section class="homeGrid">
      ${homeCard('cows', '🐄', 'Cow Profiles', `${state.cows.length} cows / heifers`)}
      ${homeCard('milk', '🥛', 'Milk Session', `${state.milk.length} session entries`)}
      ${homeCard('alerts', '🔔', 'Alerts & Reminders', `${alerts.length} active reminders`)}
    </section>

    <section class="homeDashboard">
      <div class="card">
        <div class="dashboardChartHeader">
          <h2>📊 Milk Production — Last ${selectedMilkDays} Days</h2>
          <div class="rangeToggleGroup">
            ${rangeButtons}
          </div>
        </div>
        <div class="lineChartContainer">
          ${chartHtml}
        </div>
      </div>

      <div class="card todaySummaryCard">
        <h2>📅 Today's Summary</h2>
        <div class="summaryRow">
          <span>Morning Milk:</span>
          <strong>${todaySummary.morning} L</strong>
        </div>
        <div class="summaryRow">
          <span>Evening Milk:</span>
          <strong>${todaySummary.evening} L</strong>
        </div>
        <hr class="summaryDivider">
        <div class="summaryRow totalRow">
          <span>Total Today:</span>
          <strong>${todaySummary.total} L</strong>
        </div>
      </div>
    </section>
  `);
}

function homeCard(routeName, icon, title, summary) {
  return `<button class="featureCard" data-route="${routeName}"><span>${icon}</span><strong>${title}</strong><small>${summary}</small></button>`;
}

function renderCows() {
  const toggleBtnText = showAddCowForm ? '✕ Close' : '+ Add Cow';
  const addFormClass = showAddCowForm ? 'addCowSection open' : 'addCowSection hidden';

  renderShell(`<section class="card">
    <div class="cowsHeader">
      <h2>Cow profiles</h2>
      <div class="headerBtnGroup">
        <button id="exportCowsCsvBtn" class="btnSecondary">📥 Export CSV</button>
        <button id="printBtn" class="btnSecondary">🖨️ Print / PDF</button>
        <button id="toggleAddCowBtn" class="btnSecondary">${toggleBtnText}</button>
      </div>
    </div>
    <div id="addCowContainer" class="${addFormClass}">
      <form id="cowForm" class="cowFormCard">
        <h3>Add new cow</h3>
        <label>Tag / Name <input name="name" placeholder="Tag / name" required></label>
        <label>Photo <input name="photoFile" type="file" accept="image/*" capture="environment"></label>
        <label>Status
          <select name="status">
            <option>In milk</option>
            <option>Heifer</option>
            <option>Dry</option>
          </select>
        </label>
        <button type="submit">Save Cow</button>
      </form>
    </div>
    <div class="list">${state.cows.map(profileCard).join('') || '<p>No cows added yet.</p>'}</div>
  </section>`);
}

function renderCowBreedingList(breedingList = []) {
  if (!breedingList.length) return '<p class="emptyText">No breeding records yet.</p>';
  return `<ul class="recordList">${breedingList.map((b) => {
    const details = [];
    if (b.heatDate) details.push(`Heat: ${b.heatDate}`);
    if (b.aiDate) details.push(`AI: ${b.aiDate}`);
    if (b.pregnancyStatus) details.push(`Status: ${b.pregnancyStatus}`);
    if (b.aiDate && b.pregnancyStatus === 'Pregnant') {
      const calving = expectedCalvingDate(b.aiDate);
      if (calving) details.push(`Expected Calving: ${calving}`);
    } else if (b.heatDate) {
      const nextHeat = nextHeatDate(b.heatDate);
      if (nextHeat) details.push(`Next Heat: ${nextHeat}`);
    }
    return `<li>${details.join(' · ')}</li>`;
  }).join('')}</ul>`;
}

function renderCowHealthList(healthList = []) {
  if (!healthList.length) return '<p class="emptyText">No health records yet.</p>';
  return `<ul class="recordList">${healthList.map((h) => {
    const details = [];
    if (h.type) details.push(`<strong>${h.type}</strong>`);
    if (h.date) details.push(`Date: ${h.date}`);
    if (h.nextDue) details.push(`Next due: ${h.nextDue}`);
    if (h.notes) details.push(`Notes: ${h.notes}`);
    return `<li>${details.join(' · ')}</li>`;
  }).join('')}</ul>`;
}

function profileCard(cow) {
  const photo = cow.photo ? `<img class="cowPhoto" src="${cow.photo}" alt="${cow.name}">` : '<div class="cowPhoto placeholder">🐄</div>';
  const isOpen = openCowIds.has(cow.id);

  return `<details class="profileCard" data-cow-id="${cow.id}" ${isOpen ? 'open' : ''}>
    <summary class="profileSummary">
      ${photo}
      <div class="summaryContent">
        <h3>${cow.name}</h3>
        <span class="statusBadge">${cow.status}</span>
        <p><small>${cow.breeding?.length || 0} breeding records · ${cow.health?.length || 0} health records</small></p>
      </div>
      <span class="expandIcon">▼</span>
    </summary>
    <div class="profileDetails">
      <div class="sectionBox">
        <h4>📅 Breeding Records</h4>
        <form data-cow="${cow.id}" class="breedForm inlineForm">
          <div class="formRow">
            <label>Heat date <input name="heatDate" type="date"></label>
            <label>AI date <input name="aiDate" type="date"></label>
            <label>Pregnancy status
              <select name="pregnancyStatus">
                <option>Open</option>
                <option>Pregnant</option>
                <option>Unknown</option>
              </select>
            </label>
          </div>
          <button type="submit">Add Breeding Record</button>
        </form>
        <div class="recordsContainer">
          ${renderCowBreedingList(cow.breeding)}
        </div>
      </div>

      <div class="sectionBox">
        <h4>💉 Health Records</h4>
        <form data-cow="${cow.id}" class="healthForm inlineForm">
          <div class="formRow">
            <label>Type
              <select name="type">
                <option>Vaccination</option>
                <option>Illness</option>
                <option>Treatment</option>
              </select>
            </label>
            <label>Date <input name="date" type="date" value="${today()}"></label>
            <label>Next due <input name="nextDue" type="date"></label>
          </div>
          <label>Notes <input name="notes" placeholder="Notes / details"></label>
          <button type="submit">Add Health Record</button>
        </form>
        <div class="recordsContainer">
          ${renderCowHealthList(cow.health)}
        </div>
      </div>

      <div class="cardFooter">
        <button class="deleteCowBtn" data-cow-id="${cow.id}" data-cow-name="${cow.name}">🗑 Delete ${cow.name}</button>
      </div>
    </div>
  </details>`;
}

function renderMilk() {
  const toggleBtnText = showAddMilkForm ? '✕ Close' : '+ Add Milk Entry';
  const addFormClass = showAddMilkForm ? 'addCowSection open' : 'addCowSection hidden';
  const sortedMilk = [...state.milk].reverse();

  renderShell(`<section class="card">
    <div class="cowsHeader">
      <h2>Milk session</h2>
      <div class="headerBtnGroup">
        <button id="exportMilkCsvBtn" class="btnSecondary">📥 Export CSV</button>
        <button id="printBtn" class="btnSecondary">🖨️ Print / PDF</button>
        <button id="toggleAddMilkBtn" class="btnSecondary">${toggleBtnText}</button>
      </div>
    </div>

    <div id="addMilkContainer" class="${addFormClass}">
      <form id="milkForm" class="cowFormCard">
        <h3>Add milk entry</h3>
        <label>Date <input name="date" type="date" value="${today()}" required></label>
        <label>Session
          <select name="session">
            <option>Morning</option>
            <option>Evening</option>
          </select>
        </label>
        <label>Litres <input name="quantity" type="number" step="0.1" placeholder="Litres" required></label>
        <label>Fat % <input name="fat" type="number" step="0.1" placeholder="Fat %" required></label>
        <label>SNF % <input name="snf" type="number" step="0.1" placeholder="SNF %" required></label>
        <button type="submit">Save Milk Entry</button>
      </form>
    </div>

    <div class="thresholdRow">
      <label>Fat alert <input id="fatThreshold" type="number" step="0.1" value="${state.thresholds.fat}"></label>
      <label>SNF alert <input id="snfThreshold" type="number" step="0.1" value="${state.thresholds.snf}"></label>
    </div>

    <div class="tableContainer">
      ${renderMilkTable(sortedMilk)}
    </div>

    <div class="chart">
      <h3>Daily Totals Chart</h3>
      ${summarizeMilk(state.milk).map(bar).join('') || '<p>No milk entries yet.</p>'}
    </div>
  </section>`);
}

function renderMilkTable(entries = []) {
  if (!entries.length) return '<p class="emptyText">No milk entries recorded yet.</p>';
  return `<table class="milkTable">
    <thead>
      <tr>
        <th>Date</th>
        <th>Session</th>
        <th>Litres</th>
        <th>Fat %</th>
        <th>SNF %</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map((m) => {
        const fatLow = Number(m.fat) < Number(state.thresholds.fat);
        const snfLow = Number(m.snf) < Number(state.thresholds.snf);
        const alerts = [];
        if (fatLow) alerts.push('Low Fat');
        if (snfLow) alerts.push('Low SNF');
        const statusHtml = alerts.length
          ? `<span class="badgeWarning">⚠️ ${alerts.join(' & ')}</span>`
          : `<span class="badgeOk">✓ Normal</span>`;
        const rowClass = alerts.length ? 'rowAlert' : '';

        return `<tr class="${rowClass}">
          <td>${m.date}</td>
          <td>${m.session}</td>
          <td><strong>${m.quantity} L</strong></td>
          <td class="${fatLow ? 'valueAlert' : ''}">${m.fat}%</td>
          <td class="${snfLow ? 'valueAlert' : ''}">${m.snf}%</td>
          <td>${statusHtml}</td>
          <td><button class="deleteMilkBtn" data-milk-id="${m.id}">🗑 Delete</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

function renderAlerts() {
  const alerts = getAlerts(state);
  renderShell(`<section class="card"><h2>Alerts & reminders</h2>${alerts.map((a) => `<p class="alert">${a}</p>`).join('') || '<p>No active reminders.</p>'}</section>`);
}


function renderMilkLineChart(data = []) {
  if (!data.length) {
    return '<p class="emptyText">No milk data recorded for this period.</p>';
  }

  const svgWidth = 600;
  const svgHeight = 260;
  const padding = { top: 30, right: 30, bottom: 40, left: 55 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const quantities = data.map((d) => d.quantity);
  const minVal = Math.min(0, ...quantities);
  const rawMax = Math.max(...quantities, 10);
  const maxVal = Math.ceil(rawMax / 10) * 10 || 10;

  const stepsCount = 4;
  const stepVal = (maxVal - minVal) / stepsCount;
  const gridYValues = Array.from({ length: stepsCount + 1 }, (_, i) => Math.round(minVal + i * stepVal));

  const points = data.map((d, index) => {
    const x = data.length > 1
      ? padding.left + (index / (data.length - 1)) * graphWidth
      : padding.left + graphWidth / 2;
    const y = padding.top + graphHeight - ((d.quantity - minVal) / (maxVal - minVal)) * graphHeight;
    return { x, y, label: d.label, quantity: d.quantity };
  });

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

  const gridLinesHtml = gridYValues.map((val) => {
    const y = padding.top + graphHeight - ((val - minVal) / (maxVal - minVal)) * graphHeight;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${svgWidth - padding.right}" y2="${y}" class="gridLine" />
      <text x="${padding.left - 8}" y="${y + 4}" class="yAxisLabel">${val}L</text>
    `;
  }).join('');

  const pointsHtml = points.map((pt) => `
    <circle cx="${pt.x}" cy="${pt.y}" r="${pt.quantity > 0 ? 5 : 3}" class="${pt.quantity > 0 ? 'chartDot' : 'chartDotZero'}" />
    ${pt.quantity > 0 ? `<text x="${pt.x}" y="${pt.y - 10}" class="pointLabel">${pt.quantity}L</text>` : ''}
  `).join('');

  // Depending on number of data points (e.g., 10, 20, 30), step the X-axis tick labels so they don't crowd
  const tickStep = data.length > 20 ? 5 : data.length > 10 ? 3 : 1;
  const xAxisHtml = points.map((pt, index) => {
    const isFirst = index === 0;
    const isLast = index === points.length - 1;
    if (isFirst || isLast || index % tickStep === 0) {
      const dateFormatted = pt.label.slice(5); // e.g. "03-30"
      return `<text x="${pt.x}" y="${svgHeight - 12}" class="xAxisLabel">${dateFormatted}</text>`;
    }
    return '';
  }).join('');

  return `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="milkSvgChart" preserveAspectRatio="xMidYMid meet">
      ${gridLinesHtml}
      <path d="${pathD}" class="chartLine" />
      ${pointsHtml}
      ${xAxisHtml}
    </svg>
  `;
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
  document.querySelectorAll('.rangeToggleGroup .btnToggle').forEach((btn) => {
    btn.onclick = () => {
      const days = Number(btn.dataset.days);
      if (days && days !== selectedMilkDays) {
        selectedMilkDays = days;
        render();
      }
    };
  });
  document.querySelector('#loginBtn')?.addEventListener('click', login);
  document.querySelector('#logoutBtn')?.addEventListener('click', logout);
  document.querySelector('#closeAuthBtn')?.addEventListener('click', () => {
    showAuthModal = false;
    authError = '';
    render();
  });
  document.querySelector('#authOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'authOverlay') {
      showAuthModal = false;
      authError = '';
      render();
    }
  });
  document.querySelector('#toggleAddCowBtn')?.addEventListener('click', () => {
    showAddCowForm = !showAddCowForm;
    render();
  });
  document.querySelector('#toggleAddMilkBtn')?.addEventListener('click', () => {
    showAddMilkForm = !showAddMilkForm;
    render();
  });
  document.querySelector('#cowForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    const photo = await readCowPhoto(e.target.photoFile);
    delete data.photoFile;
    const newCowId = uid();
    state.cows.push({ id: newCowId, ...data, photo, breeding: [], health: [] });
    openCowIds.add(newCowId);
    showAddCowForm = false;
    saveState(state);
    render();
  });
  document.querySelectorAll('.deleteMilkBtn').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const milkId = btn.dataset.milkId;
      if (window.confirm('Are you sure you want to delete this milk entry?')) {
        state.milk = state.milk.filter((m) => m.id !== milkId);
        saveState(state);
        render();
      }
    };
  });
  document.querySelectorAll('.profileCard').forEach((card) => {
    card.ontoggle = () => {
      const cowId = card.dataset.cowId;
      if (card.open) {
        openCowIds.add(cowId);
      } else {
        openCowIds.delete(cowId);
      }
    };
  });
  document.querySelectorAll('.deleteCowBtn').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cowId = btn.dataset.cowId;
      const cowName = btn.dataset.cowName;
      if (window.confirm(`Are you sure you want to delete ${cowName}?`)) {
        state.cows = state.cows.filter((c) => c.id !== cowId);
        openCowIds.delete(cowId);
        saveState(state);
        render();
      }
    };
  });
  document.querySelector('#milkForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.milk.push({ id: uid(), ...formData(e.target) });
    showAddMilkForm = false;
    saveState(state);
    render();
  });
  document.querySelectorAll('.breedForm').forEach((form) => form.onsubmit = (e) => {
    e.preventDefault();
    const cow = state.cows.find((c) => c.id === form.dataset.cow);
    if (cow) {
      if (!cow.breeding) cow.breeding = [];
      cow.breeding.push(formData(form));
      openCowIds.add(cow.id);
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
      openCowIds.add(cow.id);
      saveState(state);
      render();
    }
  });
  document.querySelector('#fatThreshold')?.addEventListener('change', (e) => { state.thresholds.fat = e.target.value; saveState(state); render(); });
  document.querySelector('#snfThreshold')?.addEventListener('change', (e) => { state.thresholds.snf = e.target.value; saveState(state); render(); });
  document.querySelector('#exportAllBtn')?.addEventListener('click', () => exportCsv('all'));
  document.querySelector('#exportCowsCsvBtn')?.addEventListener('click', () => exportCsv('cows'));
  document.querySelector('#exportMilkCsvBtn')?.addEventListener('click', () => exportCsv('milk'));
  document.querySelectorAll('#printBtn').forEach((btn) => btn.onclick = () => print());
}

async function login() {
  if (isSigningIn) return;
  const email = document.querySelector('#email')?.value?.trim();
  const password = document.querySelector('#password')?.value;

  if (!email) {
    authError = 'Please enter an email address.';
    render();
    return;
  }

  isSigningIn = true;
  authError = '';
  render();

  try {
    if (!isFirebaseConfigured()) {
      const localUid = `local-${btoa(email.toLowerCase())}`;
      const user = { uid: localUid, email: email.toLowerCase() };
      state = loadStateForUser(user);
      saveState(state);
      isSigningIn = false;
      showAuthModal = false;
      render();
      return;
    }
    const credential = await loginOrCreateUser(email, password);
    const user = { uid: credential.user.uid, email: credential.user.email };
    state = loadStateForUser(user);
    await pullFromCloudForUser(user);
    isSigningIn = false;
    showAuthModal = false;
    render();
  } catch (err) {
    isSigningIn = false;
    authError = err?.message || 'Login failed. Please check your email and password.';
    render();
  }
}

async function logout() {
  try {
    await logoutUser();
  } catch (err) {
    console.error('Logout error:', err);
  }
  localStorage.removeItem('cow-tracker-active-user');
  state = loadStateForUser(null);
  openCowIds.clear();
  showAuthModal = false;
  authError = '';
  render();
}

async function syncNow() {
  if (!state.user?.uid || !isFirebaseConfigured()) {
    state.sync = { ...state.sync, pending: false, lastSyncedAt: new Date().toISOString(), status: 'Local sync only — Firebase not connected' };
    saveState(state);
    render();
    return;
  }
  state.sync.status = 'Syncing with Firebase...';
  render();
  state = await syncUserState(state.user.uid, state);
  state.sync = { ...state.sync, pending: false, lastSyncedAt: new Date().toISOString(), status: 'Synced with Firebase' };
  saveState(state);
  render();
}

async function pullFromCloudForUser(user) {
  if (!user?.uid || !isFirebaseConfigured()) return;
  state = await syncUserState(user.uid, state);
  saveState(state);
  render();
}
function exportCsv(type = 'all') {
  let rows = [['type','cow','date','session','quantity','fat','snf','notes']];
  let filename = 'dairy-herd-export.csv';

  if (type === 'milk') {
    rows.push(...state.milk.map((m) => ['milk', '', m.date, m.session, m.quantity, m.fat, m.snf, '']));
    filename = 'dairy-milk-export.csv';
  } else if (type === 'cows') {
    rows.push(...state.cows.flatMap((c) => [
      ...(c.breeding || []).map((b) => ['breeding', c.name, b.aiDate || b.heatDate, '', '', '', '', b.pregnancyStatus || '']),
      ...(c.health || []).map((h) => ['health', c.name, h.date, '', '', '', '', `${h.type} ${h.notes || ''}`])
    ]));
    filename = 'dairy-cows-export.csv';
  } else {
    rows.push(
      ...state.milk.map((m) => ['milk', '', m.date, m.session, m.quantity, m.fat, m.snf, '']),
      ...state.cows.flatMap((c) => [
        ...(c.breeding || []).map((b) => ['breeding', c.name, b.aiDate || b.heatDate, '', '', '', '', b.pregnancyStatus || '']),
        ...(c.health || []).map((h) => ['health', c.name, h.date, '', '', '', '', `${h.type} ${h.notes || ''}`])
      ])
    );
  }

  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  link.click();
}

onFirebaseAuthChange(async (firebaseUser) => {
  if (firebaseUser) {
    const user = { uid: firebaseUser.uid, email: firebaseUser.email };
    state = loadStateForUser(user);
    await pullFromCloudForUser(user);
    render();
  } else if (state.user?.uid && isFirebaseConfigured()) {
    state = loadStateForUser(null);
    render();
  }
});
window.addEventListener('hashchange', render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();
