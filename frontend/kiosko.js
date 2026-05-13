'use strict';

const API = '/api/public';
const IDLE_MS = 90_000;
const IDLE_MS_CONFIRMATION = 15_000;
const ACTIVITIES_REFRESH_MS = 30_000;
const WATCHDOG_MS = 2_000;

const TYPE_ICONS = {
  exposicion: 'fa-image',
  concierto: 'fa-music',
  taller: 'fa-screwdriver-wrench',
  teatro: 'fa-masks-theater',
  conferencia: 'fa-microphone',
  otro: 'fa-calendar-day',
};
const TYPE_LABELS = {
  exposicion: 'Exposición',
  concierto: 'Concierto',
  taller: 'Taller',
  teatro: 'Teatro',
  conferencia: 'Conferencia',
  otro: 'Otro',
};

// ============ State ============
const State = {
  screen: 'welcome',
  activity: null,
  user: null,
  isNewUser: false,
  prefilledCode: null,
  activitiesRefreshTimer: null,
  countdownTimer: null,
  idleTimer: null,
};

// ============ Helpers ============
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${time}`;
}

function typeLabel(t) { return TYPE_LABELS[t] || t; }
function typeIcon(t) { return TYPE_ICONS[t] || 'fa-calendar-day'; }

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((body && body.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ============ Render orchestrator ============
function render() {
  stopRefresh();
  const root = $('#k-root');
  root.innerHTML = '';
  const screens = {
    welcome: renderWelcome,
    activities: renderActivities,
    identify: renderIdentify,
    codeInput: renderCodeInput,
    newUserForm: renderNewUserForm,
    confirmation: renderConfirmation,
  };
  (screens[State.screen] || renderWelcome)(root);
  resetIdle();
}

function go(screen, patch = {}) {
  Object.assign(State, patch, { screen });
  render();
}

function goHome() {
  State.activity = null;
  State.user = null;
  State.isNewUser = false;
  State.prefilledCode = null;
  go('welcome');
}

// ============ Idle / auto-reset ============
function resetIdle() {
  if (State.idleTimer) clearTimeout(State.idleTimer);
  if (State.screen === 'welcome') return;
  const wait = State.screen === 'confirmation' ? IDLE_MS_CONFIRMATION : IDLE_MS;
  State.idleTimer = setTimeout(goHome, wait);
}

// ============ Refresh activities ============
function startRefresh(fn) {
  stopRefresh();
  State.activitiesRefreshTimer = setInterval(fn, ACTIVITIES_REFRESH_MS);
}

function stopRefresh() {
  if (State.activitiesRefreshTimer) {
    clearInterval(State.activitiesRefreshTimer);
    State.activitiesRefreshTimer = null;
  }
}

// ============ Overlay ============
function showOverlay({ title, message, icon = 'fa-circle-info', kind = 'info', actions = [] }) {
  const el = $('#k-overlay');
  el.innerHTML = `
    <div class="k-overlay-card">
      <div class="k-overlay-icon k-overlay-icon--${kind}">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="k-overlay-title">${escapeHtml(title)}</div>
      <div class="k-overlay-msg">${escapeHtml(message)}</div>
      <div class="k-actions">
        ${actions.map((a, i) => `
          <button class="k-btn ${a.variant || 'k-btn--primary'}" data-overlay-action="${i}">
            ${a.icon ? `<i class="fa-solid ${a.icon}"></i>` : ''}
            ${escapeHtml(a.label)}
          </button>`).join('')}
      </div>
    </div>`;
  el.classList.remove('hidden');
  el.querySelectorAll('[data-overlay-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.overlayAction, 10);
      hideOverlay();
      actions[idx]?.onClick?.();
    });
  });
}

function hideOverlay() {
  $('#k-overlay').classList.add('hidden');
}

// ============ Screen: welcome ============
function renderWelcome(root) {
  root.innerHTML = `
    <div class="k-screen k-welcome">
      <img src="/assets/logo.png" alt="Centro Cultural Banreservas" class="k-welcome-logo" />
      <div>
        <h1 class="k-welcome-title">¡Bienvenido!</h1>
        <p class="k-welcome-sub">Regístrate en una actividad y disfruta de tu visita.</p>
      </div>
      <button class="k-btn k-btn--accent k-btn--xl k-btn--pulse" id="k-start">
        <i class="fa-solid fa-hand-pointer"></i> Toca para comenzar
      </button>
    </div>`;
  $('#k-start').addEventListener('click', async () => {
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    go('activities');
  });
}

// ============ Screen: activities ============
async function renderActivities(root) {
  root.innerHTML = `
    <div class="k-screen">
      <h1 class="k-h1">Elige tu actividad</h1>
      <p class="k-lead">Estas son las actividades con cupo disponible hoy</p>
      <div id="k-activities-list"><div class="k-spinner"></div></div>
      <div class="k-actions" style="margin-top:24px">
        <button class="k-btn k-btn--ghost" data-go-home>
          <i class="fa-solid fa-arrow-left"></i> Volver al inicio
        </button>
      </div>
    </div>`;
  $('[data-go-home]').addEventListener('click', goHome);
  await loadActivities();
  startRefresh(loadActivities);
}

async function loadActivities() {
  try {
    const { activities } = await api('/activities');
    paintActivities(activities);
  } catch (e) {
    $('#k-activities-list').innerHTML = `
      <div class="k-empty">
        <i class="fa-solid fa-cloud-bolt"></i>
        <h3>No pudimos cargar las actividades</h3>
        <p>Acércate al mostrador o intenta de nuevo</p>
      </div>`;
  }
}

function paintActivities(activities) {
  const list = $('#k-activities-list');
  if (!list) return;
  if (!activities.length) {
    list.innerHTML = `
      <div class="k-empty">
        <i class="fa-solid fa-calendar-xmark"></i>
        <h3>No hay actividades disponibles</h3>
        <p>Acércate al mostrador para más información</p>
      </div>`;
    return;
  }
  list.innerHTML = `
    <div class="k-card-grid">
      ${activities.map(a => {
        const remaining = a.capacity - a.enrolledCount;
        const pct = a.capacity ? (a.enrolledCount / a.capacity) : 0;
        const low = pct >= 0.8;
        return `
          <button type="button" class="k-card" data-activity-id="${escapeHtml(a.id)}" data-activity-name="${escapeHtml(a.name)}">
            ${a.imageUrl
              ? `<div class="k-card-cover" style="background-image:url('${escapeHtml(a.imageUrl)}')"></div>`
              : `<div class="k-card-band k-card-band--${escapeHtml(a.type)}"></div>`}
            <div class="k-card-body">
              ${a.imageUrl ? '' : `<div class="k-card-icon"><i class="fa-solid ${typeIcon(a.type)}"></i></div>`}
              <div class="k-card-name">${escapeHtml(a.name)}</div>
              <div class="k-card-meta">
                <div><i class="fa-solid fa-calendar"></i> ${escapeHtml(formatDate(a.date))}</div>
                <div><i class="fa-solid fa-location-dot"></i> ${escapeHtml(a.location)}</div>
              </div>
              <div class="k-card-spots ${low ? 'k-card-spots--low' : ''}">
                <span>${remaining} plaza${remaining === 1 ? '' : 's'} libres</span>
                <span>${a.enrolledCount}/${a.capacity}</span>
              </div>
              <div class="k-btn k-btn--accent k-btn--block" style="pointer-events:none">
                <i class="fa-solid fa-check"></i> Asistir
              </div>
            </div>
          </button>`;
      }).join('')}
    </div>`;
  list.querySelectorAll('[data-activity-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.activityId;
      const name = btn.dataset.activityName;
      go('identify', { activity: { id, name } });
    });
  });
}

// ============ Screen: identify ============
function renderIdentify(root) {
  root.innerHTML = `
    <div class="k-screen k-center">
      <div class="k-activity-pill">
        <i class="fa-solid fa-ticket"></i>
        ${escapeHtml(State.activity.name)}
      </div>
      <h1 class="k-h1">¿Cómo te identificas?</h1>
      <p class="k-lead">Elige una opción para continuar</p>
      <div class="k-choice-grid">
        <button class="k-choice-card" id="k-choice-code">
          <div class="k-choice-icon"><i class="fa-solid fa-id-card"></i></div>
          <div class="k-choice-title">Tengo mi código</div>
          <div class="k-choice-sub">Ya he visitado el centro antes</div>
        </button>
        <button class="k-choice-card k-choice-card--accent" id="k-choice-new">
          <div class="k-choice-icon k-choice-icon--accent"><i class="fa-solid fa-user-plus"></i></div>
          <div class="k-choice-title">Soy nuevo</div>
          <div class="k-choice-sub">Es mi primera visita</div>
        </button>
      </div>
      <div class="k-actions" style="margin-top:32px">
        <button class="k-btn k-btn--ghost" id="k-back">
          <i class="fa-solid fa-arrow-left"></i> Cambiar actividad
        </button>
      </div>
    </div>`;
  $('#k-choice-code').addEventListener('click', () => go('codeInput'));
  $('#k-choice-new').addEventListener('click', () => go('newUserForm'));
  $('#k-back').addEventListener('click', () => go('activities'));
}

// ============ Screen: codeInput ============
function renderCodeInput(root) {
  const prefilled = State.prefilledCode || '';
  State.prefilledCode = null;
  root.innerHTML = `
    <div class="k-screen k-center">
      <div class="k-activity-pill">
        <i class="fa-solid fa-ticket"></i>
        ${escapeHtml(State.activity.name)}
      </div>
      <h1 class="k-h1">Introduce tu código</h1>
      <p class="k-lead">Es el código <strong>CCB-XXXXXX</strong> que recibiste en tu primera visita</p>

      <div id="k-code-stage">
        <div class="k-form" style="max-width:520px">
          <input type="text" class="k-input k-input--code" id="k-code-input"
                 placeholder="CCB-XXXXXX" maxlength="10" autocomplete="off"
                 inputmode="text" autocapitalize="characters" value="${escapeHtml(prefilled)}" />
          <div class="k-input-error" id="k-code-err"></div>
        </div>

        <div class="k-actions">
          <button class="k-btn k-btn--ghost" id="k-back">
            <i class="fa-solid fa-arrow-left"></i> Volver
          </button>
          <button class="k-btn k-btn--primary" id="k-search" disabled>
            <i class="fa-solid fa-magnifying-glass"></i> Buscar
          </button>
        </div>
      </div>

      <div id="k-user-stage" style="display:none"></div>
    </div>`;
  const input = $('#k-code-input');
  const searchBtn = $('#k-search');
  const errEl = $('#k-code-err');

  const formatCode = v => {
    let s = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s.startsWith('CCB')) {
      s = 'CCB' + s.replace(/^CCB/, '');
    }
    if (s.length > 3) s = 'CCB-' + s.slice(3, 9);
    return s;
  };
  const validate = v => /^CCB-[A-Z0-9]{6}$/.test(v);

  input.addEventListener('input', () => {
    input.value = formatCode(input.value);
    errEl.classList.remove('visible');
    searchBtn.disabled = !validate(input.value);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && validate(input.value)) searchBtn.click();
  });
  input.focus();
  if (prefilled) {
    input.value = formatCode(prefilled);
    searchBtn.disabled = !validate(input.value);
  }

  $('#k-back').addEventListener('click', () => go('identify'));

  searchBtn.addEventListener('click', async () => {
    const code = input.value.trim().toUpperCase();
    if (!validate(code)) return;
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buscando…';
    try {
      const user = await api(`/users/${encodeURIComponent(code)}`);
      showUserBanner(user);
    } catch (e) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Buscar';
      if (e.status === 404) {
        errEl.textContent = 'No encontramos ese código. Verifica que esté bien escrito.';
        errEl.classList.add('visible');
      } else {
        showError('No pudimos validar tu código. Intenta de nuevo.');
      }
    }
  });
}

function showUserBanner(user) {
  const codeStage = $('#k-code-stage');
  const userStage = $('#k-user-stage');
  if (!codeStage || !userStage) return;
  codeStage.style.display = 'none';
  userStage.style.display = 'block';
  userStage.innerHTML = `
    <div class="k-user-banner">
      <div class="k-user-banner-avatar"><i class="fa-solid fa-user-check"></i></div>
      <div class="k-user-banner-info">
        <div class="k-user-banner-greeting">Hola,</div>
        <div class="k-user-banner-name">${escapeHtml(user.firstName + ' ' + user.lastName)}</div>
        <div class="k-user-banner-visits">Esta sería tu visita número ${user.visitCount + 1}</div>
      </div>
    </div>
    <div class="k-actions">
      <button class="k-btn k-btn--ghost" id="k-not-me">
        <i class="fa-solid fa-arrow-left"></i> No soy yo
      </button>
      <button class="k-btn k-btn--success k-btn--xl" id="k-confirm">
        <i class="fa-solid fa-check"></i> Confirmar asistencia
      </button>
    </div>`;
  $('#k-not-me').addEventListener('click', () => go('codeInput'));
  $('#k-confirm').addEventListener('click', () => doCheckin({ userCode: user.code }));
}

// ============ Screen: newUserForm ============
function renderNewUserForm(root) {
  root.innerHTML = `
    <div class="k-screen k-center">
      <div class="k-activity-pill">
        <i class="fa-solid fa-ticket"></i>
        ${escapeHtml(State.activity.name)}
      </div>
      <h1 class="k-h1">Registro rápido</h1>
      <p class="k-lead">Te entregaremos un código CCB para que lo uses en futuras visitas</p>

      <form class="k-form" id="k-new-form">
        <div class="k-field">
          <label class="k-field-label">Nombre <span class="req">*</span></label>
          <input type="text" name="firstName" class="k-input k-input--regular" required minlength="2" maxlength="50" autocomplete="given-name" />
        </div>
        <div class="k-field">
          <label class="k-field-label">Apellido <span class="req">*</span></label>
          <input type="text" name="lastName" class="k-input k-input--regular" required minlength="2" maxlength="50" autocomplete="family-name" />
        </div>
        <div class="k-field">
          <label class="k-field-label">Email <span style="font-weight:400;color:var(--k-text-muted)">(opcional)</span></label>
          <input type="email" name="email" class="k-input k-input--regular" inputmode="email" autocomplete="email" placeholder="tu@email.com" />
        </div>
        <div class="k-field">
          <label class="k-field-label">Teléfono <span style="font-weight:400;color:var(--k-text-muted)">(opcional)</span></label>
          <input type="tel" name="phone" class="k-input k-input--regular" inputmode="tel" autocomplete="tel" placeholder="809-000-0000" />
        </div>
        <div class="k-input-error" id="k-form-err"></div>
        <div class="k-actions">
          <button type="button" class="k-btn k-btn--ghost" id="k-back">
            <i class="fa-solid fa-arrow-left"></i> Volver
          </button>
          <button type="submit" class="k-btn k-btn--accent k-btn--xl" id="k-submit">
            <i class="fa-solid fa-check"></i> Registrar y asistir
          </button>
        </div>
      </form>
    </div>`;
  const form = $('#k-new-form');
  const errEl = $('#k-form-err');
  $('#k-back').addEventListener('click', () => go('identify'));
  form.querySelector('input[name="firstName"]').focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.classList.remove('visible');
    const data = Object.fromEntries(new FormData(form));
    const newUser = {
      firstName: String(data.firstName || '').trim(),
      lastName: String(data.lastName || '').trim(),
    };
    if (data.email) newUser.email = String(data.email).trim();
    if (data.phone) newUser.phone = String(data.phone).trim();

    const submitBtn = $('#k-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando…';
    try {
      const result = await api('/checkin', {
        method: 'POST',
        body: JSON.stringify({ activityId: State.activity.id, newUser }),
      });
      State.user = result.user;
      State.isNewUser = result.isNewUser;
      go('confirmation');
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Registrar y asistir';
      if (e.status === 409 && e.body?.existingCode) {
        showOverlay({
          title: 'Email ya registrado',
          message: `Este email ya tiene un código: ${e.body.existingCode}. ¿Es tuyo?`,
          icon: 'fa-circle-info',
          kind: 'info',
          actions: [
            {
              label: 'Sí, usar mi código',
              icon: 'fa-check',
              variant: 'k-btn--primary',
              onClick: () => {
                State.prefilledCode = e.body.existingCode;
                go('codeInput');
              },
            },
            { label: 'Cambiar email', variant: 'k-btn--ghost', onClick: () => {} },
          ],
        });
      } else if (e.status === 409) {
        handleCheckinConflict(e);
      } else if (e.status === 400) {
        errEl.textContent = (e.body?.details || []).map(d => d.message).join(', ') || e.message;
        errEl.classList.add('visible');
      } else {
        showError(e.message || 'Error al registrar');
      }
    }
  });
}

// ============ Screen: confirmation ============
function renderConfirmation(root) {
  const u = State.user;
  const a = State.activity;
  root.innerHTML = `
    <div class="k-screen k-confirm">
      <div class="k-check">
        <svg viewBox="0 0 100 100"><path d="M25 52 L43 70 L75 32" /></svg>
      </div>
      <div class="k-confirm-name">¡Bienvenido${u.firstName ? ', ' + escapeHtml(u.firstName) : ''}!</div>
      <div class="k-confirm-msg">
        ${State.isNewUser
          ? 'Tu registro se ha completado. <strong>Anota tu código CCB</strong> para próximas visitas.'
          : 'Tu asistencia ha sido registrada correctamente.'}
      </div>

      <div class="k-code">${escapeHtml(u.code)}</div>

      <div class="k-confirm-card">
        <div class="k-confirm-activity">${escapeHtml(a.name)}</div>
        <div class="k-confirm-meta">Asistencia registrada</div>
        <div class="k-visit-badge">
          <i class="fa-solid fa-${State.isNewUser ? 'star' : 'repeat'}"></i>
          ${State.isNewUser ? '¡Tu primera visita!' : `Visita número ${u.visitCount}`}
        </div>
      </div>

      <button class="k-btn k-btn--primary k-btn--xl" id="k-home">
        <i class="fa-solid fa-house"></i> Volver al inicio
      </button>

      <div class="k-countdown">
        Volviendo al inicio en <span id="k-countdown-num">15</span>s
        <div class="k-progress"><div class="k-progress-bar" id="k-progress"></div></div>
      </div>
    </div>`;
  $('#k-home').addEventListener('click', goHome);
  startCountdown(15);
}

function startCountdown(seconds) {
  if (State.countdownTimer) clearInterval(State.countdownTimer);
  let remaining = seconds;
  const numEl = $('#k-countdown-num');
  const barEl = $('#k-progress');
  if (barEl) barEl.style.width = '100%';
  State.countdownTimer = setInterval(() => {
    remaining -= 1;
    if (numEl) numEl.textContent = remaining;
    if (barEl) barEl.style.width = `${(remaining / seconds) * 100}%`;
    if (remaining <= 0) {
      clearInterval(State.countdownTimer);
      State.countdownTimer = null;
    }
  }, 1000);
}

// ============ Checkin actions ============
async function doCheckin(payload) {
  try {
    const result = await api('/checkin', {
      method: 'POST',
      body: JSON.stringify({ activityId: State.activity.id, ...payload }),
    });
    State.user = result.user;
    State.isNewUser = result.isNewUser;
    go('confirmation');
  } catch (e) {
    if (e.status === 409) {
      handleCheckinConflict(e);
    } else if (e.status === 404) {
      showError(e.message || 'Recurso no encontrado');
    } else {
      showError(e.message || 'No pudimos completar el registro');
    }
  }
}

function handleCheckinConflict(e) {
  const msg = e.message || '';
  if (/ya est[áa]s registrado/i.test(msg) || /ya inscrito/i.test(msg)) {
    showOverlay({
      title: 'Ya estabas registrado',
      message: 'Ya tienes una asistencia en esta actividad. ¡Disfrútala!',
      icon: 'fa-circle-check',
      kind: 'info',
      actions: [{ label: 'Entendido', icon: 'fa-house', variant: 'k-btn--primary', onClick: goHome }],
    });
  } else if (/cupo agotado/i.test(msg)) {
    showOverlay({
      title: 'Cupo agotado',
      message: 'Esta actividad llegó al máximo de plazas mientras te registrabas. Elige otra.',
      icon: 'fa-triangle-exclamation',
      kind: 'warning',
      actions: [{ label: 'Ver actividades', icon: 'fa-arrow-left', variant: 'k-btn--primary', onClick: () => go('activities') }],
    });
  } else {
    showError(msg);
  }
}

function showError(message) {
  showOverlay({
    title: 'Algo salió mal',
    message,
    icon: 'fa-triangle-exclamation',
    kind: 'error',
    actions: [{ label: 'Cerrar', variant: 'k-btn--ghost', onClick: () => {} }],
  });
}

// ============ Header clock ============
function updateClock() {
  const el = $('#k-time');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

// ============ Kiosk navigation lock ============
function setupKioskLock() {
  window.history.pushState({ k: 1 }, '', '/kiosko');
  window.addEventListener('popstate', () => {
    window.history.pushState({ k: 1 }, '', '/kiosko');
    goHome();
  });
  window.addEventListener('beforeunload', e => {
    if (State.screen !== 'welcome') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
    if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
      e.preventDefault();
    }
    if (e.key === 'Backspace' && !isInput) e.preventDefault();
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) e.preventDefault();
  });
  setInterval(() => {
    if (!location.pathname.startsWith('/kiosko')) {
      location.replace('/kiosko');
    }
  }, WATCHDOG_MS);
}

function setupIdleListeners() {
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, () => {
      if (State.screen !== 'welcome') resetIdle();
    }, { passive: true });
  });
}

// ============ Init ============
function init() {
  setupKioskLock();
  setupIdleListeners();
  updateClock();
  setInterval(updateClock, 1000);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
