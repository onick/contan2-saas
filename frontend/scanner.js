'use strict';

const State = {
  view: 'loading',
  pin: '',
  activities: [],
  activity: null,
  scanning: false,
  lastCode: null,
  cooldownUntil: 0,
  stream: null,
};

const PIN_LENGTH = 4;
const SCAN_COOLDOWN_MS = 2200;
const CODE_REGEX = /^CCB-[A-Z0-9]{6}$/;

function $(s) { return document.querySelector(s); }
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
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

function toast(msg, ms = 2400) {
  const el = $('#s-toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ============ Views ============
function renderLogin(errorMsg = '') {
  State.view = 'login';
  const dots = Array.from({ length: PIN_LENGTH }, (_, i) =>
    `<div class="s-pin-dot ${i < State.pin.length ? 'filled' : ''}"></div>`,
  ).join('');
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const keypad = keys.map(k => {
    if (k === '') return '<div></div>';
    if (k === '⌫') return `<button class="s-key s-key--ghost" data-key="back"><i class="fa-solid fa-delete-left"></i></button>`;
    return `<button class="s-key" data-key="${k}">${k}</button>`;
  }).join('');
  $('#s-root').innerHTML = `
    <div class="s-login">
      <img src="/assets/logo.png" alt="CCB" class="s-login-logo" />
      <h1>Scanner CCB</h1>
      <p>Ingresa el PIN del staff para continuar</p>
      <div class="s-pin-display">${dots}</div>
      <div class="s-login-error">${escapeHtml(errorMsg)}</div>
      <div class="s-keypad">${keypad}</div>
    </div>`;
  $('.s-keypad').addEventListener('click', e => {
    const btn = e.target.closest('[data-key]');
    if (!btn) return;
    const k = btn.dataset.key;
    if (k === 'back') {
      State.pin = State.pin.slice(0, -1);
      renderLogin();
      return;
    }
    if (State.pin.length >= PIN_LENGTH) return;
    State.pin += k;
    if (State.pin.length === PIN_LENGTH) {
      renderLogin();
      submitPin();
    } else {
      renderLogin();
    }
  });
}

async function submitPin() {
  try {
    await api('/staff/login', { method: 'POST', body: JSON.stringify({ pin: State.pin }) });
    State.pin = '';
    vibrate(50);
    await loadActivities();
  } catch (e) {
    State.pin = '';
    if (e.status === 429) renderLogin('Demasiados intentos. Espera 1 minuto.');
    else renderLogin('PIN incorrecto. Intenta de nuevo.');
    vibrate([100, 50, 100]);
  }
}

async function loadActivities() {
  State.view = 'loading';
  $('#s-root').innerHTML = '<div class="s-select"><div class="s-empty"><i class="fa-solid fa-spinner fa-spin"></i><h3>Cargando…</h3></div></div>';
  try {
    const { activities } = await api('/public/activities');
    State.activities = activities;
    renderActivitySelect();
  } catch (e) {
    toast('No se pudieron cargar las actividades');
    renderActivitySelect();
  }
}

function renderActivitySelect() {
  State.view = 'select';
  const list = State.activities.length
    ? State.activities.map(a => {
        const remaining = a.capacity - a.enrolledCount;
        const icon = ({
          exposicion: 'fa-image', concierto: 'fa-music', cine: 'fa-film', taller: 'fa-screwdriver-wrench',
          teatro: 'fa-masks-theater', conferencia: 'fa-microphone',
        })[a.type] || 'fa-calendar-day';
        const date = new Date(a.date).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
        return `
          <button class="s-activity-card" data-activity-id="${escapeHtml(a.id)}">
            <div class="s-activity-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="s-activity-info">
              <div class="s-activity-name">${escapeHtml(a.name)}</div>
              <div class="s-activity-meta">${escapeHtml(a.location)} · ${date} · ${remaining} cupos</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="opacity:0.4"></i>
          </button>`;
      }).join('')
    : `<div class="s-empty"><i class="fa-solid fa-calendar-xmark"></i><h3>Sin actividades disponibles</h3></div>`;
  $('#s-root').innerHTML = `
    <div class="s-select">
      <div>
        <h2>Selecciona actividad</h2>
        <p>Para hacer check-in de visitantes</p>
      </div>
      <div class="s-activity-list">${list}</div>
      <div class="s-logout">
        <button id="s-logout">Cerrar sesión</button>
      </div>
    </div>`;
  $('.s-activity-list')?.addEventListener('click', e => {
    const card = e.target.closest('[data-activity-id]');
    if (!card) return;
    const id = card.dataset.activityId;
    const act = State.activities.find(a => a.id === id);
    if (act) startScanner(act);
  });
  $('#s-logout').addEventListener('click', logout);
}

async function logout() {
  await api('/staff/logout', { method: 'POST' }).catch(() => {});
  State.pin = '';
  renderLogin();
}

// ============ Scanner ============
async function startScanner(activity) {
  State.activity = activity;
  State.view = 'scan';
  $('#s-root').innerHTML = `
    <div class="s-shell">
      <div class="s-header">
        <button class="s-icon-btn" id="s-back" aria-label="Volver"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="s-header-info">
          <div class="s-header-label">Check-in en</div>
          <div class="s-header-activity">${escapeHtml(activity.name)}</div>
        </div>
        <button class="s-icon-btn" id="s-info" aria-label="Info"><i class="fa-solid fa-circle-info"></i></button>
      </div>
      <div class="s-video-wrap">
        <video id="s-video" playsinline muted autoplay></video>
        <div class="s-frame">
          <div class="s-frame-box">
            <div class="s-frame-corner s-frame-corner--tl"></div>
            <div class="s-frame-corner s-frame-corner--tr"></div>
            <div class="s-frame-corner s-frame-corner--bl"></div>
            <div class="s-frame-corner s-frame-corner--br"></div>
            <div class="s-scan-line"></div>
          </div>
        </div>
      </div>
      <div class="s-status">
        <div class="s-status-label" id="s-status-label">Apunta al código del visitante</div>
        <div class="s-status-hint">El escaneo es automático</div>
      </div>
    </div>`;
  $('#s-back').addEventListener('click', stopAndBack);
  $('#s-info').addEventListener('click', () => {
    toast(`${activity.enrolledCount}/${activity.capacity} inscritos · ${activity.location}`, 3000);
  });

  const video = $('#s-video');
  try {
    State.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = State.stream;
    await video.play();
    State.scanning = true;
    requestAnimationFrame(scanLoop);
  } catch (e) {
    console.error(e);
    $('#s-status-label').textContent = 'No se pudo acceder a la cámara';
    toast('Permite acceso a la cámara para escanear', 4000);
  }
}

function stopScanner() {
  State.scanning = false;
  if (State.stream) {
    State.stream.getTracks().forEach(t => t.stop());
    State.stream = null;
  }
}

function stopAndBack() {
  stopScanner();
  renderActivitySelect();
}

const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d', { willReadFrequently: true });

function scanLoop() {
  if (!State.scanning) return;
  const video = $('#s-video');
  if (!video || video.readyState < 2) {
    requestAnimationFrame(scanLoop);
    return;
  }
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w === 0 || h === 0) {
    requestAnimationFrame(scanLoop);
    return;
  }
  _canvas.width = w;
  _canvas.height = h;
  _ctx.drawImage(video, 0, 0, w, h);
  try {
    const imageData = _ctx.getImageData(0, 0, w, h);
    const result = window.jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
    if (result && result.data) {
      handleQrDetected(result.data.trim().toUpperCase());
    }
  } catch (e) { /* ignore */ }
  requestAnimationFrame(scanLoop);
}

async function handleQrDetected(code) {
  const now = Date.now();
  if (now < State.cooldownUntil) return;
  if (!CODE_REGEX.test(code)) {
    State.cooldownUntil = now + 1500;
    $('#s-status-label').textContent = 'Código no válido';
    vibrate([50, 30, 50]);
    setTimeout(() => {
      if (State.view === 'scan') $('#s-status-label').textContent = 'Apunta al código del visitante';
    }, 1200);
    return;
  }
  if (code === State.lastCode && now < State.cooldownUntil + SCAN_COOLDOWN_MS) return;
  State.lastCode = code;
  State.cooldownUntil = now + SCAN_COOLDOWN_MS;
  await performCheckin(code);
}

async function performCheckin(code) {
  $('#s-status-label').textContent = `Procesando ${code}…`;
  try {
    const result = await api('/public/checkin', {
      method: 'POST',
      body: JSON.stringify({ activityId: State.activity.id, userCode: code }),
    });
    vibrate([80, 40, 80]);
    showResult({
      kind: 'success',
      icon: 'fa-circle-check',
      title: '¡Asistencia registrada!',
      name: `${result.user.firstName} ${result.user.lastName}`,
      code: result.user.code,
      msg: result.isNewUser ? 'Primera visita' : `Visita número ${result.user.visitCount}`,
    });
    State.activity.enrolledCount += 1;
  } catch (e) {
    vibrate([100, 50, 100, 50, 100]);
    if (e.status === 409 && /ya est[áa]s registrado/i.test(e.message || '')) {
      showResult({
        kind: 'warning',
        icon: 'fa-circle-info',
        title: 'Ya estaba registrado',
        msg: `${code} ya tiene asistencia en esta actividad.`,
        code,
      });
    } else if (e.status === 409 && /cupo agotado/i.test(e.message || '')) {
      showResult({
        kind: 'error',
        icon: 'fa-ban',
        title: 'Cupo agotado',
        msg: 'Esta actividad llegó al máximo.',
      });
    } else if (e.status === 404) {
      showResult({
        kind: 'error',
        icon: 'fa-circle-question',
        title: 'Código no encontrado',
        msg: `El código ${code} no existe en el sistema.`,
        code,
      });
    } else {
      showResult({
        kind: 'error',
        icon: 'fa-triangle-exclamation',
        title: 'Error',
        msg: e.message || 'No pudimos completar el registro',
      });
    }
  }
}

function showResult({ kind, icon, title, name, code, msg }) {
  const shell = $('.s-shell');
  if (!shell) return;
  const existing = shell.querySelector('.s-result');
  if (existing) existing.remove();
  const html = `
    <div class="s-result s-result--${kind}">
      <div class="s-result-card">
        <div class="s-result-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="s-result-title">${escapeHtml(title)}</div>
        ${name ? `<div class="s-result-name">${escapeHtml(name)}</div>` : ''}
        ${code ? `<div class="s-result-code">${escapeHtml(code)}</div>` : ''}
        ${msg ? `<div class="s-result-msg">${escapeHtml(msg)}</div>` : ''}
        <button class="s-result-btn" id="s-result-continue">Continuar escaneando</button>
      </div>
    </div>`;
  shell.insertAdjacentHTML('beforeend', html);
  const dismiss = () => {
    shell.querySelector('.s-result')?.remove();
    $('#s-status-label').textContent = 'Apunta al código del visitante';
  };
  $('#s-result-continue').addEventListener('click', dismiss);
  setTimeout(() => {
    if (shell.querySelector('.s-result')) dismiss();
  }, 3500);
}

// ============ Init ============
async function init() {
  try {
    const { authenticated } = await api('/staff/me');
    if (authenticated) {
      await loadActivities();
    } else {
      renderLogin();
    }
  } catch (e) {
    renderLogin();
  }
}

window.addEventListener('beforeunload', stopScanner);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
