'use strict';

const API = '/api/public';
const IDLE_MS = 90_000;
const IDLE_MS_CONFIRMATION = 15_000;
const ACTIVITIES_REFRESH_MS = 30_000;
const WATCHDOG_MS = 2_000;

const TYPE_ICONS = {
  exposicion: 'fa-image',
  concierto: 'fa-music',
  cine: 'fa-film',
  taller: 'fa-screwdriver-wrench',
  teatro: 'fa-masks-theater',
  conferencia: 'fa-microphone',
  otro: 'fa-calendar-day',
};
const TYPE_LABELS = {
  exposicion: 'Exposición',
  concierto: 'Concierto',
  cine: 'Cine',
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

// Devuelve un descriptor de estado de cupo para la card del kiosko.
// Mostramos info contextual en vez del crudo "N/M" o "X plazas libres".
// Logica:
//   - 100%       -> cupo agotado (rojo, deshabilita el boton)
//   - >= 80%     -> ultimas N plazas (ambar, urgencia/FOMO)
//   - >= 40%     -> X personas confirmadas (azul, social proof)
//   - resto      -> cupo disponible (verde, sin numeros para evitar
//                   senal de "evento vacio" al inicio)
function capacityStatus(a) {
  const cap = Math.max(0, a.capacity || 0);
  const enrolled = Math.max(0, a.enrolledCount || 0);
  const remaining = Math.max(0, cap - enrolled);
  const pct = cap > 0 ? enrolled / cap : 0;
  if (cap > 0 && remaining === 0) {
    return { kind: 'full', icon: 'fa-ban', label: 'Cupo agotado' };
  }
  if (pct >= 0.8) {
    const label = remaining === 1
      ? 'Última plaza disponible'
      : `Últimas ${remaining} plazas`;
    return { kind: 'low', icon: 'fa-fire', label };
  }
  if (pct >= 0.4) {
    return { kind: 'busy', icon: 'fa-users', label: `${enrolled} personas confirmadas` };
  }
  return { kind: 'open', icon: 'fa-circle-check', label: 'Cupo disponible' };
}

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
        const status = capacityStatus(a);
        const isFull = status.kind === 'full';
        return `
          <button type="button" class="k-card ${isFull ? 'k-card--full' : ''}" data-activity-id="${escapeHtml(a.id)}" data-activity-name="${escapeHtml(a.name)}" data-activity-type="${escapeHtml(a.type)}" ${isFull ? 'aria-disabled="true"' : ''}>
            ${a.imageUrl
              ? `<div class="k-card-cover">
                   <img class="k-card-cover-img" src="${escapeHtml(a.imageUrl)}" alt="" loading="lazy" data-cover-img />
                 </div>`
              : `<div class="k-card-band k-card-band--${escapeHtml(a.type)}"></div>`}
            <div class="k-card-body">
              ${a.imageUrl ? '' : `<div class="k-card-icon"><i class="fa-solid ${typeIcon(a.type)}"></i></div>`}
              <div class="k-card-name">${escapeHtml(a.name)}</div>
              <div class="k-card-meta">
                <div><i class="fa-solid fa-calendar"></i> ${escapeHtml(formatDate(a.date))}</div>
                <div><i class="fa-solid fa-location-dot"></i> ${escapeHtml(a.location)}</div>
              </div>
              <div class="k-card-status k-card-status--${status.kind}">
                <i class="fa-solid ${status.icon}"></i>
                <span>${status.label}</span>
              </div>
              <div class="k-btn k-btn--accent k-btn--block ${isFull ? 'k-btn--disabled' : ''}" style="pointer-events:none">
                <i class="fa-solid ${isFull ? 'fa-ban' : 'fa-check'}"></i> ${isFull ? 'Cupo agotado' : 'Asistir'}
              </div>
            </div>
          </button>`;
      }).join('')}
    </div>`;
  list.querySelectorAll('[data-activity-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Si la card está marcada como cupo agotado, NO permitir avanzar.
      if (btn.getAttribute('aria-disabled') === 'true') return;
      const id = btn.dataset.activityId;
      const name = btn.dataset.activityName;
      go('identify', { activity: { id, name } });
    });
  });
  // Si la imagen de portada falla (archivo no existe en el servidor), caer
  // al banner de tipo + icono para no dejar un cuadro blanco vacío.
  list.querySelectorAll('[data-cover-img]').forEach(img => {
    img.addEventListener('error', () => {
      const card = img.closest('[data-activity-id]');
      if (!card) return;
      const type = card.dataset.activityType || 'otro';
      const cover = img.closest('.k-card-cover');
      const body = card.querySelector('.k-card-body');
      if (cover) {
        cover.outerHTML = `<div class="k-card-band k-card-band--${type}"></div>`;
      }
      if (body && !body.querySelector('.k-card-icon')) {
        body.insertAdjacentHTML('afterbegin',
          `<div class="k-card-icon"><i class="fa-solid ${typeIcon(type)}"></i></div>`);
      }
    }, { once: true });
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

// Dominios sugeridos en orden de probabilidad para audiencia DO
const POPULAR_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'live.com',
  'me.com',
  'protonmail.com',
  'aol.com',
  'msn.com',
  'banreservas.com.do',
  'claro.net.do',
  'hotmail.es',
];

function emailSuggestions(rawInput) {
  const at = rawInput.indexOf('@');
  if (at === -1) return [];
  const local = rawInput.slice(0, at).trim();
  if (!local || !/^[^\s@]+$/.test(local)) return [];
  const partial = rawInput.slice(at + 1).toLowerCase().trim();
  if (POPULAR_DOMAINS.includes(partial)) return []; // ya completo
  const matches = partial
    ? POPULAR_DOMAINS.filter(d => d.startsWith(partial))
    : POPULAR_DOMAINS.slice(0, 5);
  return matches.slice(0, 5).map(domain => ({
    domain,
    full: `${local}@${domain}`,
  }));
}

// ============ Screen: codeInput ============
// Acepta código <PREFIX>-XXXXXX O email. El sistema autodetecta.
function renderCodeInput(root) {
  const prefilled = State.prefilledCode || '';
  State.prefilledCode = null;
  const orgPrefix = (window.__tenant__?.codePrefix || 'CCB').toUpperCase();
  const CODE_RE = /^[A-Z]{2,6}-[A-Z0-9]{6}$/;
  root.innerHTML = `
    <div class="k-screen k-center">
      <div class="k-activity-pill">
        <i class="fa-solid fa-ticket"></i>
        ${escapeHtml(State.activity.name)}
      </div>
      <h1 class="k-h1">Identifícate</h1>
      <p class="k-lead">Escribe tu <strong>código ${escapeHtml(orgPrefix)}-XXXXXX</strong> o tu <strong>correo electrónico</strong></p>

      <div id="k-code-stage">
        <div class="k-form" style="max-width:560px">
          <div class="k-input-wrap">
            <input type="text" class="k-input k-input--identifier" id="k-code-input"
                   placeholder="${escapeHtml(orgPrefix)}-XXXXXX  o  tu@correo.com" maxlength="80" autocomplete="off"
                   inputmode="text" value="${escapeHtml(prefilled)}" />
            <div class="k-suggestions hidden" id="k-suggestions"></div>
          </div>
          <div class="k-input-hint" id="k-mode-hint">&nbsp;</div>
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
  const hintEl = $('#k-mode-hint');

  // Detecta el modo SIN modificar el input. La normalización solo
  // sucede al hacer click "Buscar" (para enviar al backend en el formato correcto).
  const detect = raw => {
    const t = (raw || '').trim();
    if (!t) return { mode: null, value: '' };
    if (t.includes('@')) return { mode: 'email', value: t.toLowerCase() };
    return { mode: 'code', value: t };
  };
  const normalizeForQuery = ({ mode, value }) => {
    if (mode === 'email') return value;
    // Code: uppercase, strip junk, prepend <PREFIX>- si falta.
    let s = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Si el usuario escribió el prefijo correcto al inicio, lo respetamos;
    // si no, asumimos el prefijo del tenant.
    const prefixMatch = s.match(/^([A-Z]{2,6})(.*)$/);
    if (prefixMatch && prefixMatch[2].length === 6 && /^[A-Z0-9]{6}$/.test(prefixMatch[2])) {
      return `${prefixMatch[1]}-${prefixMatch[2]}`;
    }
    // Default: usar el prefijo de la org y los primeros 6 chars alfanuméricos.
    if (s.length >= 6) return `${orgPrefix}-${s.slice(-6)}`;
    return `${orgPrefix}-${s}`;
  };
  const validate = det => {
    if (!det.value) return false;
    if (det.mode === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(det.value);
    const normalized = normalizeForQuery(det);
    return CODE_RE.test(normalized);
  };
  const updateHint = mode => {
    if (mode === 'email') {
      hintEl.innerHTML = '<i class="fa-solid fa-envelope"></i> Detectado correo';
      hintEl.style.color = 'var(--k-primary)';
    } else if (mode === 'code') {
      hintEl.innerHTML = '<i class="fa-solid fa-id-card"></i> Detectado código';
      hintEl.style.color = 'var(--k-primary)';
    } else {
      hintEl.innerHTML = '&nbsp;';
    }
  };

  const suggestionsEl = $('#k-suggestions');
  let activeSuggestion = -1;
  let suggestDebounce = null;
  let lastSuggestQ = '';
  let suggestController = null; // AbortController para cancelar fetches obsoletos

  // Renderiza payload del type-ahead: 0 / 1 / 2-3 matches, tooBroad, hasMore.
  const renderUserMatches = payload => {
    if (!payload) {
      suggestionsEl.classList.add('hidden');
      suggestionsEl.innerHTML = '';
      activeSuggestion = -1;
      return;
    }
    const { matches = [], total = 0, tooBroad = false, hasMore = false } = payload;

    // Demasiados resultados con prefijo corto: pedir más letras para no enumerar.
    if (tooBroad) {
      suggestionsEl.innerHTML = `
        <div class="k-suggestion-hint">
          <i class="fa-solid fa-keyboard"></i>
          Sigue escribiendo para identificarte (hay ${total} coincidencias)
        </div>`;
      suggestionsEl.classList.remove('hidden');
      activeSuggestion = -1;
      return;
    }

    if (matches.length === 0) {
      suggestionsEl.classList.add('hidden');
      suggestionsEl.innerHTML = '';
      activeSuggestion = -1;
      return;
    }

    if (matches.length === 1) {
      const m = matches[0];
      const fullName = `${m.firstName} ${m.lastName}`.trim();
      suggestionsEl.innerHTML = `
        <button type="button" class="k-suggestion-match" data-match-code="${escapeHtml(m.code)}">
          <div class="k-suggestion-match-avatar"><i class="fa-solid fa-user-check"></i></div>
          <div class="k-suggestion-match-info">
            <div class="k-suggestion-match-greeting">¿Eres tú?</div>
            <div class="k-suggestion-match-name">${escapeHtml(fullName)}</div>
            <div class="k-suggestion-match-meta">${m.visitCount} visita(s) registrada(s)</div>
          </div>
          <i class="fa-solid fa-arrow-right k-suggestion-match-arrow"></i>
        </button>`;
      suggestionsEl.classList.remove('hidden');
      activeSuggestion = -1;
      return;
    }

    // 2-3 matches: lista compacta con header "¿Cuál eres tú?"
    const items = matches.map(m => {
      const fullName = `${m.firstName} ${m.lastName}`.trim();
      return `
        <button type="button" class="k-suggestion-match-row" data-match-code="${escapeHtml(m.code)}">
          <div class="k-suggestion-match-row-avatar"><i class="fa-solid fa-user"></i></div>
          <div class="k-suggestion-match-row-info">
            <div class="k-suggestion-match-row-name">${escapeHtml(fullName)}</div>
            <div class="k-suggestion-match-row-meta">${m.visitCount} visita(s)</div>
          </div>
          <i class="fa-solid fa-arrow-right k-suggestion-match-row-arrow"></i>
        </button>`;
    }).join('');

    const footer = hasMore
      ? `<div class="k-suggestion-hint k-suggestion-hint--foot">
           <i class="fa-solid fa-circle-info"></i>
           Hay ${total - matches.length} más — sigue escribiendo para afinar
         </div>`
      : '';

    suggestionsEl.innerHTML = `
      <div class="k-suggestion-match-header">¿Cuál eres tú?</div>
      ${items}
      ${footer}`;
    suggestionsEl.classList.remove('hidden');
    activeSuggestion = -1;
  };

  // Llamada debounced al backend para buscar matches por prefix
  const triggerSuggest = q => {
    if (suggestController) suggestController.abort();
    if (!q || q.length < 3 || q === lastSuggestQ) return;
    lastSuggestQ = q;
    suggestController = new AbortController();
    api(`/users/suggest?q=${encodeURIComponent(q)}`, { signal: suggestController.signal })
      .then(payload => {
        // Solo aplicar si el input no cambió desde que se disparó la búsqueda
        if (lastSuggestQ === q && !input.value.includes('@')) {
          renderUserMatches(payload);
        }
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // Silenciosamente ignorar errores del suggest (404, 429, etc.)
      });
  };

  const renderSuggestions = () => {
    // Si el input tiene @, mostrar autocomplete de dominio (lo existente)
    const items = emailSuggestions(input.value);
    if (items.length > 0) {
      activeSuggestion = 0;
      suggestionsEl.innerHTML = items
        .map((it, i) => `
          <button type="button" class="k-suggestion ${i === 0 ? 'is-active' : ''}" data-full="${escapeHtml(it.full)}" data-index="${i}">
            <span class="k-suggestion-local">${escapeHtml(it.full.split('@')[0])}@</span><span class="k-suggestion-domain">${escapeHtml(it.domain)}</span>
          </button>`)
        .join('');
      suggestionsEl.classList.remove('hidden');
      // Cancelar suggest pendiente (porque ya escribió @)
      if (suggestController) suggestController.abort();
      return;
    }

    // Sin @: type-ahead contra DB con debounce
    const v = input.value.trim();
    clearTimeout(suggestDebounce);
    if (v.length < 3 || !/^[a-zA-Z0-9._+-]+$/.test(v)) {
      // Limpiar sugerencia anterior si lo escrito ya no califica
      suggestionsEl.classList.add('hidden');
      suggestionsEl.innerHTML = '';
      lastSuggestQ = '';
      return;
    }
    suggestDebounce = setTimeout(() => triggerSuggest(v), 350);
  };

  const applySuggestion = index => {
    const btns = suggestionsEl.querySelectorAll('[data-full]');
    if (!btns[index]) return;
    input.value = btns[index].dataset.full;
    suggestionsEl.classList.add('hidden');
    suggestionsEl.innerHTML = '';
    activeSuggestion = -1;
    // Recalcular state
    const det = detect(input.value);
    updateHint(det.mode);
    searchBtn.disabled = !validate(det);
    input.focus();
  };

  const moveActive = delta => {
    const btns = suggestionsEl.querySelectorAll('[data-full]');
    if (btns.length === 0) return;
    activeSuggestion = (activeSuggestion + delta + btns.length) % btns.length;
    btns.forEach((b, i) => b.classList.toggle('is-active', i === activeSuggestion));
  };

  suggestionsEl.addEventListener('click', e => {
    // Click en match de usuario (type-ahead): identifica directo
    const matchBtn = e.target.closest('[data-match-code]');
    if (matchBtn) {
      const code = matchBtn.dataset.matchCode;
      suggestionsEl.classList.add('hidden');
      // Fetch user completo y mostrar banner
      api(`/users/${encodeURIComponent(code)}`)
        .then(user => showUserBanner(user))
        .catch(() => showError('No pudimos obtener tus datos. Intenta de nuevo.'));
      return;
    }
    // Click en sugerencia de dominio
    const btn = e.target.closest('[data-full]');
    if (btn) applySuggestion(Number(btn.dataset.index));
  });

  input.addEventListener('input', () => {
    const det = detect(input.value);
    errEl.classList.remove('visible');
    updateHint(det.mode);
    searchBtn.disabled = !validate(det);
    renderSuggestions();
  });
  input.addEventListener('keydown', e => {
    const isOpen = !suggestionsEl.classList.contains('hidden');
    if (e.key === 'Tab' && isOpen) {
      e.preventDefault();
      applySuggestion(activeSuggestion >= 0 ? activeSuggestion : 0);
      return;
    }
    if (e.key === 'ArrowDown' && isOpen) {
      e.preventDefault();
      moveActive(1);
      return;
    }
    if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      moveActive(-1);
      return;
    }
    if (e.key === 'Escape' && isOpen) {
      suggestionsEl.classList.add('hidden');
      return;
    }
    if (e.key === 'Enter') {
      // Si hay sugerencia activa, aplicarla en vez de buscar
      if (isOpen && activeSuggestion >= 0) {
        e.preventDefault();
        applySuggestion(activeSuggestion);
        return;
      }
      const det = detect(input.value);
      if (validate(det)) searchBtn.click();
    }
  });
  input.focus();
  if (prefilled) {
    const det = detect(prefilled);
    updateHint(det.mode);
    searchBtn.disabled = !validate(det);
  }

  $('#k-back').addEventListener('click', () => go('identify'));

  searchBtn.addEventListener('click', async () => {
    const det = detect(input.value);
    if (!validate(det)) return;
    const q = normalizeForQuery(det); // solo aquí normalizamos antes de enviar
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buscando…';
    try {
      const user = await api(`/users/lookup?q=${encodeURIComponent(q)}`);
      showUserBanner(user);
    } catch (e) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Buscar';
      if (e.status === 404) {
        showNotFoundOptions(det.mode);
      } else if (e.status === 429) {
        errEl.textContent = 'Demasiadas búsquedas. Espera un minuto.';
        errEl.classList.add('visible');
      } else {
        showError('No pudimos completar la búsqueda. Intenta de nuevo.');
      }
    }
  });
}

function showNotFoundOptions(mode) {
  const codeStage = $('#k-code-stage');
  const userStage = $('#k-user-stage');
  if (!codeStage || !userStage) return;
  codeStage.style.display = 'none';
  userStage.style.display = 'block';
  const msg = mode === 'email'
    ? 'No encontramos a nadie con ese correo. ¿Es tu primera visita?'
    : 'No encontramos ese código. Verifica que esté bien escrito o regístrate como nuevo.';
  userStage.innerHTML = `
    <div class="k-not-found">
      <div class="k-not-found-icon"><i class="fa-solid fa-user-slash"></i></div>
      <div class="k-not-found-msg">${escapeHtml(msg)}</div>
    </div>
    <div class="k-actions">
      <button class="k-btn k-btn--ghost" id="k-retry">
        <i class="fa-solid fa-rotate-left"></i> Intentar de nuevo
      </button>
      <button class="k-btn k-btn--accent k-btn--xl" id="k-go-new">
        <i class="fa-solid fa-user-plus"></i> Soy nuevo, regístrame
      </button>
    </div>`;
  $('#k-retry').addEventListener('click', () => go('codeInput'));
  $('#k-go-new').addEventListener('click', () => go('newUserForm'));
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
          <label class="k-field-label">Email <span style="font-weight:600;color:var(--k-accent)">(recomendado)</span></label>
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
