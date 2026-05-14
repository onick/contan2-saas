'use strict';

const API_BASE = '/api';
const ACTIVITY_TYPES = [
  { value: 'exposicion', label: 'Exposición' },
  { value: 'concierto', label: 'Concierto' },
  { value: 'taller', label: 'Taller' },
  { value: 'teatro', label: 'Teatro' },
  { value: 'conferencia', label: 'Conferencia' },
  { value: 'otro', label: 'Otro' },
];
const ACTIVITY_STATUSES = [
  { value: 'activa', label: 'Activa' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'cancelada', label: 'Cancelada' },
];

const ROUTES = {
  dashboard: { title: 'Dashboard', subtitle: 'Resumen general del centro cultural', render: renderDashboard },
  checkin: { title: 'Check-in', subtitle: 'Registra asistencias rápidamente', render: renderCheckin },
  users: { title: 'Usuarios', subtitle: 'Visitantes registrados con código CCB', render: renderUsers },
  activities: { title: 'Actividades', subtitle: 'Eventos culturales del centro', render: renderActivities },
  attendance: { title: 'Registros', subtitle: 'Asistencias de usuarios a actividades', render: renderAttendance },
  segments: { title: 'Segmentos', subtitle: 'Audiencias para campañas e invitaciones', render: renderSegments },
};

const State = {
  currentRoute: 'dashboard',
  users: [],
  activities: [],
  attendance: [],
  stats: null,
  filters: {
    users: '',
    activities: { search: '', status: '', type: '' },
    attendance: { userCode: '', activityId: '' },
  },
  pagination: {
    users: { page: 1, pageSize: 25, sortBy: 'createdAt', sortDir: 'desc' },
    activities: { page: 1, pageSize: 25, sortBy: 'date', sortDir: 'asc' },
    attendance: { page: 1, pageSize: 25, sortBy: 'registeredAt', sortDir: 'desc' },
  },
};

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  if (/^\d{4}-\d{2}-\d{2}T/.test(as) && /^\d{4}-\d{2}-\d{2}T/.test(bs)) {
    return new Date(as) - new Date(bs);
  }
  return as.localeCompare(bs, 'es', { sensitivity: 'base', numeric: true });
}

function applyTablePipeline(arr, key) {
  const p = State.pagination[key];
  let sorted = arr;
  if (p.sortBy) {
    const dir = p.sortDir === 'desc' ? -1 : 1;
    sorted = [...arr].sort((a, b) => compareValues(a[p.sortBy], b[p.sortBy]) * dir);
  }
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  if (p.page > totalPages) p.page = totalPages;
  if (p.page < 1) p.page = 1;
  const start = (p.page - 1) * p.pageSize;
  const end = Math.min(start + p.pageSize, total);
  return {
    items: sorted.slice(start, end),
    total,
    page: p.page,
    totalPages,
    pageSize: p.pageSize,
    startIdx: start,
    endIdx: end,
  };
}

function sortIcon(key, field) {
  const p = State.pagination[key];
  if (p.sortBy !== field) return '<i class="fa-solid fa-sort sort-icon"></i>';
  return p.sortDir === 'asc'
    ? '<i class="fa-solid fa-sort-up sort-icon active"></i>'
    : '<i class="fa-solid fa-sort-down sort-icon active"></i>';
}

function th(key, field, label, extraAttrs = '') {
  return `<th class="sortable" data-sort-key="${key}" data-sort-field="${field}" ${extraAttrs}>
    <span>${label}</span> ${sortIcon(key, field)}
  </th>`;
}

function paginationHtml(key, result) {
  const { total, page, totalPages, pageSize, startIdx, endIdx } = result;
  if (total === 0) return '';
  return `
    <div class="pagination">
      <div class="pagination-info">
        Mostrando <strong>${startIdx + 1}–${endIdx}</strong> de <strong>${total}</strong>
      </div>
      <div class="pagination-controls">
        <select class="select-input pagination-size" data-paginate-key="${key}" data-action="page-size">
          ${[10, 25, 50, 100].map(n => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n} / página</option>`).join('')}
        </select>
        <button class="icon-btn" data-paginate-key="${key}" data-action="page-first" ${page <= 1 ? 'disabled' : ''} title="Primera">
          <i class="fa-solid fa-angles-left"></i>
        </button>
        <button class="icon-btn" data-paginate-key="${key}" data-action="page-prev" ${page <= 1 ? 'disabled' : ''} title="Anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="pagination-page">${page} / ${totalPages}</span>
        <button class="icon-btn" data-paginate-key="${key}" data-action="page-next" ${page >= totalPages ? 'disabled' : ''} title="Siguiente">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
        <button class="icon-btn" data-paginate-key="${key}" data-action="page-last" ${page >= totalPages ? 'disabled' : ''} title="Última">
          <i class="fa-solid fa-angles-right"></i>
        </button>
      </div>
    </div>`;
}

function repaintTable(key) {
  if (key === 'users') paintUsersTable();
  else if (key === 'activities') paintActivitiesTable();
  else if (key === 'attendance') paintAttendanceTable();
}

// ============================================================
// Utils
// ============================================================
const Utils = {
  escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  formatDate(iso, withTime = true) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const date = d.toLocaleDateString('es-DO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    if (!withTime) return date;
    const time = d.toLocaleTimeString('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} · ${time}`;
  },
  todayInput() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  },
  toIsoFromInput(value) {
    if (!value) return null;
    return new Date(value).toISOString();
  },
  toInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  },
  activityTypeLabel(type) {
    const t = ACTIVITY_TYPES.find(x => x.value === type);
    return t ? t.label : type;
  },
  dateRelativeBadge(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today) / 86400000);
    if (diff === 0) return '<span class="badge badge--accent badge--xs">Hoy</span>';
    if (diff === 1) return '<span class="badge badge--info badge--xs">Mañana</span>';
    if (diff > 1 && diff <= 7) return `<span class="badge badge--neutral badge--xs">En ${diff} días</span>`;
    if (diff === -1) return '<span class="badge badge--neutral badge--xs">Ayer</span>';
    return '';
  },
};

// ============================================================
// API
// ============================================================
const API = {
  async request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 204) return null;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message = (body && body.error) || `Error HTTP ${res.status}`;
      const details = body && body.details;
      const err = new Error(message);
      err.status = res.status;
      err.details = details;
      throw err;
    }
    return body;
  },
  users: {
    list: () => API.request('/users'),
    get: code => API.request(`/users/${encodeURIComponent(code)}`),
    create: data => API.request('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (code, data) =>
      API.request(`/users/${encodeURIComponent(code)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: code =>
      API.request(`/users/${encodeURIComponent(code)}`, { method: 'DELETE' }),
    bulkCreate: users =>
      API.request('/users/bulk', {
        method: 'POST',
        body: JSON.stringify({ users }),
      }),
  },
  activities: {
    list: () => API.request('/activities'),
    get: id => API.request(`/activities/${encodeURIComponent(id)}`),
    create: data => API.request('/activities', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      API.request(`/activities/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: id => API.request(`/activities/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  attendance: {
    list: () => API.request('/attendance'),
    create: data => API.request('/attendance', { method: 'POST', body: JSON.stringify(data) }),
    remove: id => API.request(`/attendance/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  dashboard: {
    stats: () => API.request('/dashboard/stats'),
  },
  insights: {
    userAffinity: code => API.request(`/insights/user-affinity/${encodeURIComponent(code)}`),
    suggestions: ({ type, location, limit = 50, excludeActivityId } = {}) => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (location) params.set('location', location);
      if (limit) params.set('limit', String(limit));
      if (excludeActivityId) params.set('excludeActivityId', excludeActivityId);
      return API.request(`/insights/suggestions?${params.toString()}`);
    },
    segments: () => API.request('/insights/segments'),
    segment: id => API.request(`/insights/segments/${encodeURIComponent(id)}`),
    activitySummary: id => API.request(`/insights/activity-summary/${encodeURIComponent(id)}`),
  },
  uploads: {
    async image(file) {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API_BASE}/uploads/image`, { method: 'POST', body: fd });
      let body = null;
      try { body = await res.json(); } catch {}
      if (!res.ok) {
        const err = new Error((body && body.error) || `Error HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return body;
    },
  },
};

// ============================================================
// Toast
// ============================================================
const Toast = {
  show(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    const icon = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info',
    }[type];
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${Utils.escapeHtml(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  },
  success(m) { this.show(m, 'success'); },
  error(m) { this.show(m, 'error'); },
  warning(m) { this.show(m, 'warning'); },
  info(m) { this.show(m, 'info'); },
};

function explainError(err) {
  let msg = err.message || 'Error desconocido';
  if (err.details && Array.isArray(err.details) && err.details.length) {
    msg += ': ' + err.details.map(d => d.message).join(', ');
  }
  return msg;
}

// ============================================================
// Modal
// ============================================================
const Modal = {
  el: null,
  init() {
    this.el = document.getElementById('modal-root');
    this.el.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) this.close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this.close();
    });
  },
  open(title, bodyHtml, onSubmit) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    this.el.classList.remove('hidden');
    const form = this.el.querySelector('form');
    if (form && onSubmit) {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
          await onSubmit(form);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
      const firstInput = form.querySelector('input, select, textarea');
      if (firstInput) firstInput.focus();
    }
  },
  close() {
    this.el.classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    if (this._closeResolver) {
      const r = this._closeResolver;
      this._closeResolver = null;
      r(false);
    }
  },
  confirm(opts) {
    const {
      title = 'Confirmar',
      message,
      confirmLabel = 'Confirmar',
      cancelLabel = 'Cancelar',
      danger = false,
      icon = danger ? 'fa-triangle-exclamation' : 'fa-circle-question',
    } = opts;
    return new Promise(resolve => {
      const bodyHtml = `
        <div class="confirm-body">
          <div class="confirm-icon ${danger ? 'confirm-icon--danger' : ''}">
            <i class="fa-solid ${icon}"></i>
          </div>
          <p class="confirm-message">${Utils.escapeHtml(message)}</p>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" data-confirm="cancel">${Utils.escapeHtml(cancelLabel)}</button>
            <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm="ok">
              ${Utils.escapeHtml(confirmLabel)}
            </button>
          </div>
        </div>`;
      this.open(title, bodyHtml, null);
      this._closeResolver = resolve;
      const onClick = e => {
        const t = e.target.closest('[data-confirm]');
        if (!t) return;
        const decision = t.dataset.confirm === 'ok';
        this._closeResolver = null;
        this.close();
        resolve(decision);
      };
      document.getElementById('modal-body').addEventListener('click', onClick);
    });
  },
};

// ============================================================
// Router
// ============================================================
function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const route = hash.split('/')[0];
  return ROUTES[route] ? route : 'dashboard';
}

async function navigate() {
  const route = parseRoute();
  State.currentRoute = route;
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });
  const def = ROUTES[route];
  document.getElementById('page-title').textContent = def.title;
  document.getElementById('page-subtitle').textContent = def.subtitle;
  document.getElementById('topbar-actions').innerHTML = '';
  document.getElementById('content').innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    await def.render();
  } catch (e) {
    console.error(e);
    Toast.error(explainError(e));
    document.getElementById('content').innerHTML = `
      <div class="empty">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>No se pudo cargar la vista</h3>
        <p>${Utils.escapeHtml(explainError(e))}</p>
      </div>`;
  }
  // close sidebar on mobile after nav
  document.querySelector('.sidebar')?.classList.remove('open');
}

// ============================================================
// View: Dashboard
// ============================================================
async function renderDashboard() {
  const stats = await API.dashboard.stats();
  State.stats = stats;

  const cards = [
    { label: 'Total usuarios', value: stats.totalUsers, icon: 'fa-users', color: 'blue' },
    { label: 'Actividades hoy', value: stats.activitiesToday, icon: 'fa-calendar-day', color: 'orange' },
    { label: 'Actividades activas', value: stats.activeActivities, icon: 'fa-bolt', color: 'green' },
    { label: 'Asistencias', value: stats.totalAttendances, icon: 'fa-clipboard-check', color: 'purple' },
  ];

  const cardsHtml = cards
    .map(
      c => `
    <div class="stat-card">
      <div class="stat-icon stat-icon--${c.color}"><i class="fa-solid ${c.icon}"></i></div>
      <div class="stat-info">
        <span class="stat-label">${c.label}</span>
        <span class="stat-value">${c.value}</span>
      </div>
    </div>`,
    )
    .join('');

  const topHtml = stats.topActivities.length
    ? stats.topActivities
        .map(
          (a, i) => `
      <div class="top-item">
        <div class="rank">${i + 1}</div>
        <div class="top-info">
          <div class="top-name">${Utils.escapeHtml(a.name)}</div>
          <div class="top-meta">${Utils.escapeHtml(Utils.activityTypeLabel(a.type))} · ${Utils.escapeHtml(a.location)}</div>
        </div>
        <div class="progress" style="max-width:140px">
          <div class="progress-track">
            <div class="progress-bar" style="width:${a.capacity ? Math.round((a.enrolledCount / a.capacity) * 100) : 0}%"></div>
          </div>
          <div class="progress-meta"><span>${a.enrolledCount}/${a.capacity}</span><span>${a.capacity ? Math.round((a.enrolledCount / a.capacity) * 100) : 0}%</span></div>
        </div>
      </div>`,
        )
        .join('')
    : `<div class="empty"><i class="fa-solid fa-calendar-xmark"></i><h3>Sin actividades</h3><p>Crea una actividad para empezar.</p></div>`;

  const recentHtml = stats.recentUsers.length
    ? `
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr><th>Código</th><th>Nombre</th><th>Email</th><th>Visitas</th><th>Registro</th></tr>
        </thead>
        <tbody>
          ${stats.recentUsers
            .map(
              u => `
            <tr>
              <td><span class="user-code">${Utils.escapeHtml(u.code)}</span></td>
              <td class="cell-strong">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</td>
              <td class="cell-muted">${Utils.escapeHtml(u.email)}</td>
              <td><span class="badge badge--info">${u.visitCount}</span></td>
              <td class="cell-muted">${Utils.formatDate(u.createdAt, false)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    : `<div class="empty"><i class="fa-solid fa-user-slash"></i><h3>Sin usuarios</h3><p>Registra el primer visitante.</p></div>`;

  document.getElementById('content').innerHTML = `
    <div class="stats-grid">${cardsHtml}</div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Top actividades por inscripciones</h2>
            <p>Las 5 actividades con más asistencias</p>
          </div>
        </div>
        <div class="panel-body panel-body--flush">
          <div class="top-list">${topHtml}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Últimos usuarios</h2>
            <p>Visitantes registrados recientemente</p>
          </div>
        </div>
        <div class="panel-body panel-body--flush">${recentHtml}</div>
      </div>
    </div>`;
}

// ============================================================
// View: Users
// ============================================================
async function renderUsers() {
  const { users } = await API.users.list();
  State.users = users;

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn--ghost" data-action="user-template" title="Descargar plantilla Excel">
      <i class="fa-solid fa-file-arrow-down"></i> Plantilla
    </button>
    <button class="btn btn--ghost" data-action="user-import" title="Importar usuarios desde Excel">
      <i class="fa-solid fa-file-import"></i> Importar
    </button>
    <button class="btn btn--ghost" data-action="users-export" title="Exportar a Excel">
      <i class="fa-solid fa-file-export"></i> Exportar
    </button>
    <button class="btn btn--accent" data-action="user-new">
      <i class="fa-solid fa-plus"></i> Nuevo usuario
    </button>`;

  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Usuarios registrados</h2>
          <p>${users.length} usuario(s) con código CCB</p>
        </div>
        <div class="toolbar">
          <div class="search-input">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="users-search" placeholder="Buscar por nombre, email o código…" value="${Utils.escapeHtml(State.filters.users)}" />
          </div>
        </div>
      </div>
      <div class="panel-body panel-body--flush">
        <div id="users-table"></div>
      </div>
    </div>`;

  const search = document.getElementById('users-search');
  search.addEventListener('input', e => {
    State.filters.users = e.target.value;
    paintUsersTable();
  });
  paintUsersTable();
}

function paintUsersTable() {
  const q = State.filters.users.trim().toLowerCase();
  const filtered = State.users.filter(u => {
    if (!q) return true;
    return (
      u.code.toLowerCase().includes(q) ||
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const result = applyTablePipeline(filtered, 'users');

  const html = !result.total
    ? `<div class="empty"><i class="fa-solid fa-user-slash"></i><h3>Sin resultados</h3><p>No hay usuarios que coincidan.</p></div>`
    : `
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            ${th('users', 'code', 'Código')}
            ${th('users', 'firstName', 'Nombre')}
            ${th('users', 'email', 'Email')}
            ${th('users', 'phone', 'Teléfono')}
            ${th('users', 'visitCount', 'Visitas')}
            ${th('users', 'createdAt', 'Registro')}
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${result.items
            .map(
              u => `
            <tr data-code="${Utils.escapeHtml(u.code)}" class="row-clickable" data-action="user-detail">
              <td><span class="user-code">${Utils.escapeHtml(u.code)}</span></td>
              <td class="cell-strong">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</td>
              <td class="cell-muted">${Utils.escapeHtml(u.email || '—')}</td>
              <td class="cell-muted">${Utils.escapeHtml(u.phone || '—')}</td>
              <td><span class="badge badge--info">${u.visitCount}</span></td>
              <td class="cell-muted">${Utils.formatDate(u.createdAt, false)}</td>
              <td>
                <div class="table-actions" data-stop-row>
                  <button class="icon-btn" data-action="user-edit" data-code="${Utils.escapeHtml(u.code)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                  <button class="icon-btn icon-btn--danger" data-action="user-delete" data-code="${Utils.escapeHtml(u.code)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    ${paginationHtml('users', result)}`;
  document.getElementById('users-table').innerHTML = html;
}

function userFormHtml(user = null) {
  return `
    <form class="form">
      <div class="form-row">
        <div class="form-group">
          <label>Nombre <span class="required">*</span></label>
          <input type="text" name="firstName" required minlength="2" maxlength="50" value="${Utils.escapeHtml(user?.firstName || '')}" />
        </div>
        <div class="form-group">
          <label>Apellido <span class="required">*</span></label>
          <input type="text" name="lastName" required minlength="2" maxlength="50" value="${Utils.escapeHtml(user?.lastName || '')}" />
        </div>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" placeholder="Opcional" value="${Utils.escapeHtml(user?.email || '')}" />
      </div>
      <div class="form-group">
        <label>Teléfono</label>
        <input type="text" name="phone" placeholder="Opcional" value="${Utils.escapeHtml(user?.phone || '')}" />
      </div>
      ${user ? `<div class="form-hint">Código: <strong>${Utils.escapeHtml(user.code)}</strong> · ${user.visitCount} visita(s)</div>` : '<div class="form-hint">Se generará un código único CCB-XXXXXX al guardar.</div>'}
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> ${user ? 'Guardar cambios' : 'Crear usuario'}</button>
      </div>
    </form>`;
}

async function handleUserNew() {
  Modal.open('Nuevo usuario', userFormHtml(), async form => {
    const data = Object.fromEntries(new FormData(form));
    try {
      const user = await API.users.create(data);
      Toast.success(`Usuario creado: ${user.code}`);
      Modal.close();
      renderUsers();
    } catch (e) {
      Toast.error(explainError(e));
    }
  });
}

async function handleUserEdit(code) {
  const user = State.users.find(u => u.code === code);
  if (!user) return;
  Modal.open('Editar usuario', userFormHtml(user), async form => {
    const data = Object.fromEntries(new FormData(form));
    try {
      await API.users.update(code, data);
      Toast.success('Usuario actualizado');
      Modal.close();
      renderUsers();
    } catch (e) {
      Toast.error(explainError(e));
    }
  });
}

async function handleUserDelete(code) {
  const ok = await Modal.confirm({
    title: 'Eliminar usuario',
    message: `¿Eliminar el usuario ${code}? Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  try {
    await API.users.remove(code);
    Toast.success('Usuario eliminado');
    renderUsers();
  } catch (e) {
    Toast.error(explainError(e));
  }
}

// ============================================================
// User detail (QR + attendance history)
// ============================================================
function qrUrl(code, size = 160) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(code)}`;
}

async function handleUserDetail(code) {
  let user, attResp, affinity;
  try {
    [user, attResp, affinity] = await Promise.all([
      API.users.get(code),
      API.request(`/attendance/by-user/${encodeURIComponent(code)}`),
      API.insights.userAffinity(code).catch(() => null),
    ]);
  } catch (e) {
    Toast.error(explainError(e));
    return;
  }

  const url = qrUrl(user.code);
  const histHtml = attResp.attendances.length
    ? `
    <div class="table-wrapper" style="max-height:240px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md)">
      <table class="table">
        <thead><tr><th>Actividad</th><th>Fecha</th></tr></thead>
        <tbody>
          ${attResp.attendances
            .map(
              a => `
            <tr>
              <td class="cell-strong">${Utils.escapeHtml(a.activityName)}</td>
              <td class="cell-muted">${Utils.formatDate(a.registeredAt)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    : '<div class="form-hint">Este usuario aún no tiene asistencias registradas.</div>';

  const body = `
    <div class="user-detail">
      <div class="user-detail-header">
        <div class="user-qr-wrap">
          <img src="${url}" alt="QR ${Utils.escapeHtml(user.code)}" class="user-qr" />
        </div>
        <div class="user-detail-info">
          <div class="user-code">${Utils.escapeHtml(user.code)}</div>
          <h3>${Utils.escapeHtml(user.firstName + ' ' + user.lastName)}</h3>
          <div class="user-detail-meta">
            <div><i class="fa-solid fa-envelope"></i> ${Utils.escapeHtml(user.email || 'Sin email')}</div>
            <div><i class="fa-solid fa-phone"></i> ${Utils.escapeHtml(user.phone || 'Sin teléfono')}</div>
          </div>
          <div class="user-detail-stats">
            <span class="badge badge--info"><i class="fa-solid fa-repeat"></i> ${user.visitCount} visita(s)</span>
            <span class="badge badge--neutral">Registrado ${Utils.formatDate(user.createdAt, false)}</span>
          </div>
        </div>
      </div>
      ${affinity ? renderAffinitySection(affinity) : ''}
      <div class="user-detail-section">
        <h4>Historial de asistencias <span class="muted-count">(${attResp.total})</span></h4>
        ${histHtml}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cerrar</button>
        <button type="button" class="btn btn--accent" id="user-detail-print">
          <i class="fa-solid fa-print"></i> Imprimir
        </button>
        ${user.email
          ? `<button type="button" class="btn btn--accent" id="user-detail-send">
              <i class="fa-solid fa-envelope"></i> Enviar credencial
            </button>`
          : ''}
        <button type="button" class="btn btn--primary" id="user-detail-edit">
          <i class="fa-solid fa-pen"></i> Editar
        </button>
      </div>
    </div>`;

  Modal.open('Detalle de usuario', body, null);
  document.getElementById('user-detail-edit').onclick = () => {
    Modal.close();
    handleUserEdit(code);
  };
  document.getElementById('user-detail-print').onclick = () => printCredential(user, url);
  document.getElementById('user-detail-send')?.addEventListener('click', () => sendCredentialEmail(user));
}

async function sendCredentialEmail(user) {
  const btn = document.getElementById('user-detail-send');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';
  }
  try {
    const result = await API.request(`/credentials/${encodeURIComponent(user.code)}/send`, {
      method: 'POST',
    });
    if (result.ok) {
      Toast.success(`Credencial enviada a ${user.email}`);
    } else {
      Toast.warning(result.message || 'Credencial generada pero no enviada');
    }
  } catch (e) {
    Toast.error(explainError(e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-envelope"></i> Enviar credencial';
    }
  }
}

function renderAffinitySection(aff) {
  const STATUS_BADGE = {
    activo: '<span class="badge badge--success">Activo</span>',
    regular: '<span class="badge badge--info">Regular</span>',
    dormido: '<span class="badge badge--warning">Dormido</span>',
    nuevo: '<span class="badge badge--neutral">Nuevo</span>',
  };
  const TYPE_ICONS = {
    exposicion: 'fa-image',
    concierto: 'fa-music',
    taller: 'fa-screwdriver-wrench',
    teatro: 'fa-masks-theater',
    conferencia: 'fa-microphone',
    otro: 'fa-calendar-day',
  };

  const types = Object.entries(aff.byType).sort((a, b) => b[1] - a[1]);
  const totalByType = types.reduce((s, [, n]) => s + n, 0);
  const topLocations = Object.entries(aff.byLocation)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const typeBars = types.length
    ? types
        .map(([type, n]) => {
          const pct = totalByType ? Math.round((n / totalByType) * 100) : 0;
          return `
        <div class="affinity-row">
          <div class="affinity-row-label">
            <i class="fa-solid ${TYPE_ICONS[type] || 'fa-calendar'}"></i>
            <span>${Utils.escapeHtml(Utils.activityTypeLabel(type))}</span>
          </div>
          <div class="affinity-row-bar">
            <div class="affinity-bar-track"><div class="affinity-bar-fill" style="width:${pct}%"></div></div>
            <span class="affinity-row-count">${n}</span>
          </div>
        </div>`;
        })
        .join('')
    : '<div class="form-hint">Aún no hay datos de afinidad.</div>';

  const locationsHtml = topLocations.length
    ? topLocations
        .map(
          ([loc, n]) => `<span class="badge badge--neutral"><i class="fa-solid fa-location-dot"></i> ${Utils.escapeHtml(loc)} · ${n}</span>`,
        )
        .join(' ')
    : '<span class="form-hint">—</span>';

  return `
    <div class="user-detail-section">
      <h4>
        Intereses
        <span class="muted-count">·</span>
        ${STATUS_BADGE[aff.status] || ''}
        ${aff.daysSinceLastVisit != null
          ? `<span class="form-hint" style="font-weight:400;margin-left:8px">Última visita hace ${aff.daysSinceLastVisit} día(s)</span>`
          : ''}
      </h4>
      <div class="affinity-grid">
        ${typeBars}
      </div>
      <div class="affinity-locations">
        <span class="form-hint">Ubicaciones frecuentes:</span> ${locationsHtml}
      </div>
    </div>`;
}

function printCredential(user, url) {
  const w = window.open('', '_blank', 'width=520,height=720');
  if (!w) {
    Toast.error('El navegador bloqueó la ventana de impresión');
    return;
  }
  const esc = s =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  w.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Credencial ${esc(user.code)}</title>
<style>
  body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; margin: 0; background: #f4f6fa; }
  .card {
    border-radius: 20px; padding: 28px; max-width: 380px; margin: 0 auto;
    background: linear-gradient(135deg, #1a237e 0%, #534bae 100%); color: white;
    box-shadow: 0 16px 32px -8px rgba(0,0,0,0.2);
  }
  .logo { font-weight: 700; letter-spacing: 1.5px; font-size: 11px; opacity: 0.85; margin-bottom: 8px; }
  .title { font-size: 14px; font-weight: 600; margin-bottom: 24px; }
  .code {
    font-family: 'Menlo', monospace; background: #ff6f00; color: white;
    padding: 8px 14px; border-radius: 8px; display: inline-block;
    font-weight: 700; font-size: 16px; letter-spacing: 1px;
  }
  .name { font-size: 22px; font-weight: 700; margin: 16px 0 6px; }
  .email { font-size: 13px; opacity: 0.85; margin-bottom: 20px; }
  .qr { background: white; padding: 12px; border-radius: 12px; display: inline-block; }
  .qr img { display: block; }
  .footer { font-size: 10px; opacity: 0.6; margin-top: 20px; letter-spacing: 1px; }
  @media print { body { padding: 0; background: white; } .card { box-shadow: none; } }
</style></head>
<body>
  <div class="card">
    <img src="${location.origin}/assets/logo.png" alt="CCB" class="brand-logo" />
    <div class="title">Credencial de Miembro</div>
    <div class="code">${esc(user.code)}</div>
    <div class="name">${esc(user.firstName)} ${esc(user.lastName)}</div>
    <div class="email">${esc(user.email || '')}</div>
    <div class="qr"><img src="${esc(url)}" alt="QR" width="180" height="180" /></div>
    <div class="footer">PRESENTAR ESTA CREDENCIAL AL INGRESO</div>
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
</body></html>`);
  w.document.close();
}

// ============================================================
// Import users from Excel
// ============================================================
function normalizeHeader(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-.]/g, '');
}

const IMPORT_HEADER_MAP = {
  firstName: ['nombre', 'firstname', 'first', 'nombres'],
  lastName: ['apellido', 'lastname', 'last', 'surname', 'apellidos'],
  fullName: ['nombrecompleto', 'nombrecompletos', 'fullname', 'name', 'nombreyapellido', 'nombresyapellidos'],
  email: ['email', 'correo', 'correoelectronico', 'mail', 'emailaddress'],
  phone: ['telefono', 'tel', 'phone', 'movil', 'celular', 'cel', 'phonenumber', 'contacto', 'contactos'],
};

const HEADER_KEYWORDS = new Set([
  ...IMPORT_HEADER_MAP.firstName,
  ...IMPORT_HEADER_MAP.lastName,
  ...IMPORT_HEADER_MAP.fullName,
  ...IMPORT_HEADER_MAP.email,
  ...IMPORT_HEADER_MAP.phone,
]);

function findHeaderRow(aoa) {
  const limit = Math.min(aoa.length, 15);
  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const row = aoa[i] || [];
    let score = 0;
    for (const cell of row) {
      if (cell == null || cell === '') continue;
      if (HEADER_KEYWORDS.has(normalizeHeader(cell))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return { index: bestIdx, score: bestScore };
}

function aoaToObjects(aoa, headerIdx) {
  const headers = (aoa[headerIdx] || []).map(h => String(h ?? '').trim());
  const result = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const arr = aoa[i] || [];
    const obj = {};
    let hasValue = false;
    headers.forEach((h, j) => {
      if (!h) return;
      const v = arr[j];
      obj[h] = v;
      if (v != null && String(v).trim() !== '') hasValue = true;
    });
    if (hasValue) result.push(obj);
  }
  return result;
}

function cleanImportEmail(s) {
  if (!s) return '';
  const first = String(s).split(/[/,;]/)[0].trim();
  return first.split(/\s+/)[0].toLowerCase();
}

function cleanImportPhone(s) {
  if (!s) return '';
  const m = String(s).match(/[\d+(][\d\s+\-()]{5,18}/);
  return m ? m[0].trim() : '';
}

function mapImportRow(row) {
  const get = field => {
    const candidates = IMPORT_HEADER_MAP[field];
    for (const rawKey of Object.keys(row)) {
      const norm = normalizeHeader(rawKey);
      if (candidates.includes(norm)) {
        const v = row[rawKey];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  };
  let firstName = get('firstName');
  let lastName = get('lastName');
  const email = cleanImportEmail(get('email'));
  const phone = cleanImportPhone(get('phone'));
  const fullName = get('fullName');

  if (!firstName && !lastName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      firstName = parts[0];
      lastName = parts[0];
    } else {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }
  }

  if (!firstName && !lastName && !email && !phone) return null;
  const out = { firstName, lastName, email };
  if (phone) out.phone = phone;
  return out;
}

function handleExport(kind) {
  if (typeof XLSX === 'undefined') {
    Toast.error('La librería de Excel no está disponible');
    return;
  }
  let aoa, filename, sheetName;
  const ts = new Date().toISOString().slice(0, 10);

  if (kind === 'users') {
    aoa = [['Código', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'Visitas', 'Registro']];
    State.users.forEach(u => {
      aoa.push([
        u.code,
        u.firstName,
        u.lastName,
        u.email || '',
        u.phone || '',
        u.visitCount,
        u.createdAt,
      ]);
    });
    filename = `ccb-usuarios-${ts}.xlsx`;
    sheetName = 'Usuarios';
  } else if (kind === 'activities') {
    aoa = [['Nombre', 'Tipo', 'Ubicación', 'Fecha', 'Cupo', 'Inscritos', '% Ocupación', 'Estado', 'Descripción']];
    State.activities.forEach(a => {
      const pct = a.capacity ? Math.round((a.enrolledCount / a.capacity) * 100) : 0;
      aoa.push([
        a.name,
        Utils.activityTypeLabel(a.type),
        a.location,
        a.date,
        a.capacity,
        a.enrolledCount,
        pct + '%',
        a.status,
        a.description || '',
      ]);
    });
    filename = `ccb-actividades-${ts}.xlsx`;
    sheetName = 'Actividades';
  } else if (kind === 'attendance') {
    const userByCode = new Map(State.users.map(u => [u.code, u]));
    aoa = [['Código', 'Nombre', 'Email', 'Actividad', 'Fecha del registro']];
    State.attendance.forEach(a => {
      const u = userByCode.get(a.userCode);
      aoa.push([
        a.userCode,
        u ? `${u.firstName} ${u.lastName}` : '',
        u?.email || '',
        a.activityName,
        a.registeredAt,
      ]);
    });
    filename = `ccb-registros-${ts}.xlsx`;
    sheetName = 'Registros';
  } else {
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = aoa[0].map(h => ({ wch: Math.max(12, String(h).length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
  Toast.success(`${aoa.length - 1} registros exportados`);
}

function handleUserTemplate() {
  if (typeof XLSX === 'undefined') {
    Toast.error('La librería de Excel no está disponible. Verifica tu conexión.');
    return;
  }
  const aoa = [
    ['Nombre', 'Apellido', 'Email', 'Teléfono'],
    ['María', 'Pérez', 'maria.perez@ejemplo.com', '809-555-0001'],
    ['Juan', 'García', 'juan.garcia@ejemplo.com', '809-555-0002'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 32 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
  XLSX.writeFile(wb, 'ccb-plantilla-usuarios.xlsx');
  Toast.success('Plantilla descargada');
}

function handleUserImport() {
  if (typeof XLSX === 'undefined') {
    Toast.error('La librería de Excel no está disponible. Verifica tu conexión.');
    return;
  }
  const bodyHtml = `
    <div class="form">
      <p class="form-hint">
        Selecciona un archivo <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong> con las columnas
        <strong>Nombre</strong>, <strong>Apellido</strong>, <strong>Email</strong> y <strong>Teléfono</strong> (opcional).
      </p>
      <div class="form-group">
        <label>Archivo</label>
        <input type="file" id="import-file" accept=".xlsx,.xls,.csv" />
      </div>
      <div id="import-preview"></div>
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn--primary" id="import-confirm" disabled>
          <i class="fa-solid fa-upload"></i> Importar
        </button>
      </div>
    </div>`;
  Modal.open('Importar usuarios desde Excel', bodyHtml, null);

  let parsedUsers = [];
  const fileInput = document.getElementById('import-file');
  const previewEl = document.getElementById('import-preview');
  const confirmBtn = document.getElementById('import-confirm');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) {
      parsedUsers = [];
      previewEl.innerHTML = '';
      confirmBtn.disabled = true;
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('El archivo no contiene hojas');
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const { index: headerIdx, score } = findHeaderRow(aoa);
      if (score < 1) {
        throw new Error(
          'No se detectaron columnas reconocibles. Asegúrate de tener columnas como Nombre, Apellido, Email/Correo o Teléfono.',
        );
      }
      const headers = (aoa[headerIdx] || []).map(h => String(h ?? '').trim()).filter(Boolean);
      const rows = aoaToObjects(aoa, headerIdx);
      parsedUsers = rows.map(mapImportRow).filter(Boolean);
      renderImportPreview(previewEl, parsedUsers, { headerIdx, headers, sheetName: wb.SheetNames[0] });
      confirmBtn.disabled = parsedUsers.length === 0;
    } catch (e) {
      console.error(e);
      Toast.error('Error leyendo el archivo: ' + (e.message || 'desconocido'));
      parsedUsers = [];
      previewEl.innerHTML = '';
      confirmBtn.disabled = true;
    }
  });

  confirmBtn.addEventListener('click', async () => {
    if (!parsedUsers.length) return;
    confirmBtn.disabled = true;
    const originalHtml = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando…';
    try {
      const result = await API.users.bulkCreate(parsedUsers);
      Modal.close();
      if (result.summary.created > 0) {
        Toast.success(`${result.summary.created} usuario(s) importado(s)`);
      }
      if (result.summary.failed > 0) {
        Toast.warning(`${result.summary.failed} fila(s) con errores`);
      }
      renderImportSummary(result);
      renderUsers();
    } catch (e) {
      Toast.error(explainError(e));
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalHtml;
    }
  });
}

function renderImportPreview(el, users, meta = {}) {
  if (!users.length) {
    el.innerHTML = '<div class="form-hint">No se detectaron filas válidas en el archivo.</div>';
    return;
  }
  const maxShown = Math.min(users.length, 5);
  const headerInfo =
    meta.headers && meta.headers.length
      ? `<div class="form-hint">Hoja: <strong>${Utils.escapeHtml(meta.sheetName || '—')}</strong> · Headers detectados (fila ${meta.headerIdx + 1}): ${meta.headers.map(h => `<code>${Utils.escapeHtml(h)}</code>`).join(', ')}</div>`
      : '';
  el.innerHTML = `
    ${headerInfo}
    <div class="form-hint">
      Detectadas <strong>${users.length}</strong> fila(s). Mostrando ${maxShown}:
    </div>
    <div class="table-wrapper" style="max-height:220px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md);margin-top:8px">
      <table class="table">
        <thead>
          <tr><th>#</th><th>Nombre</th><th>Apellido</th><th>Email</th><th>Teléfono</th></tr>
        </thead>
        <tbody>
          ${users
            .slice(0, maxShown)
            .map(
              (u, i) => `
            <tr>
              <td class="cell-muted">${i + 1}</td>
              <td>${Utils.escapeHtml(u.firstName || '—')}</td>
              <td>${Utils.escapeHtml(u.lastName || '—')}</td>
              <td>${Utils.escapeHtml(u.email || '—')}</td>
              <td class="cell-muted">${Utils.escapeHtml(u.phone || '—')}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function renderImportSummary(result) {
  const { errors, summary } = result;
  const errorsHtml = errors.length
    ? `
    <div style="margin-top:16px">
      <h3 style="font-size:13px;font-weight:600;color:var(--color-danger);margin-bottom:8px">
        <i class="fa-solid fa-triangle-exclamation"></i> Errores (${errors.length})
      </h3>
      <div class="table-wrapper" style="max-height:240px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md)">
        <table class="table">
          <thead><tr><th>Fila</th><th>Email</th><th>Motivo</th></tr></thead>
          <tbody>
            ${errors
              .map(
                e => `
              <tr>
                <td class="cell-muted">${e.index + 2}</td>
                <td class="cell-muted">${Utils.escapeHtml(e.email || '—')}</td>
                <td>
                  <strong>${Utils.escapeHtml(e.error)}</strong>
                  ${e.details ? `<div class="cell-muted">${Utils.escapeHtml(e.details.join(' · '))}</div>` : ''}
                </td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`
    : '<div class="form-hint" style="margin-top:16px;color:var(--color-success)"><i class="fa-solid fa-circle-check"></i> Todas las filas se importaron correctamente.</div>';

  const body = `
    <div class="form">
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:0">
        <div class="stat-card">
          <div class="stat-icon stat-icon--blue"><i class="fa-solid fa-list"></i></div>
          <div class="stat-info"><span class="stat-label">Total</span><span class="stat-value">${summary.total}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon--green"><i class="fa-solid fa-check"></i></div>
          <div class="stat-info"><span class="stat-label">Creados</span><span class="stat-value">${summary.created}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon ${summary.failed ? 'stat-icon--orange' : 'stat-icon--blue'}"><i class="fa-solid fa-circle-xmark"></i></div>
          <div class="stat-info"><span class="stat-label">Fallidos</span><span class="stat-value">${summary.failed}</span></div>
        </div>
      </div>
      ${errorsHtml}
      <div class="form-actions">
        <button type="button" class="btn btn--primary" data-close>Cerrar</button>
      </div>
    </div>`;
  Modal.open('Resultado de la importación', body, null);
}

// ============================================================
// View: Activities
// ============================================================
async function renderActivities() {
  const { activities } = await API.activities.list();
  State.activities = activities;

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn--ghost" data-action="activities-export" title="Exportar a Excel">
      <i class="fa-solid fa-file-export"></i> Exportar
    </button>
    <button class="btn btn--accent" data-action="activity-new">
      <i class="fa-solid fa-plus"></i> Nueva actividad
    </button>`;

  const typeOptions = ACTIVITY_TYPES.map(
    t => `<option value="${t.value}">${t.label}</option>`,
  ).join('');
  const statusOptions = ACTIVITY_STATUSES.map(
    s => `<option value="${s.value}">${s.label}</option>`,
  ).join('');

  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Actividades culturales</h2>
          <p>${activities.length} actividad(es) registrada(s)</p>
        </div>
        <div class="toolbar">
          <div class="search-input">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="activities-search" placeholder="Buscar por nombre o ubicación…" value="${Utils.escapeHtml(State.filters.activities.search)}" />
          </div>
          <select id="activities-status" class="select-input">
            <option value="">Todos los estados</option>
            ${statusOptions}
          </select>
          <select id="activities-type" class="select-input">
            <option value="">Todos los tipos</option>
            ${typeOptions}
          </select>
        </div>
      </div>
      <div class="panel-body panel-body--flush">
        <div id="activities-table"></div>
      </div>
    </div>`;

  document.getElementById('activities-status').value = State.filters.activities.status;
  document.getElementById('activities-type').value = State.filters.activities.type;

  document.getElementById('activities-search').addEventListener('input', e => {
    State.filters.activities.search = e.target.value;
    paintActivitiesTable();
  });
  document.getElementById('activities-status').addEventListener('change', e => {
    State.filters.activities.status = e.target.value;
    paintActivitiesTable();
  });
  document.getElementById('activities-type').addEventListener('change', e => {
    State.filters.activities.type = e.target.value;
    paintActivitiesTable();
  });
  paintActivitiesTable();
}

function paintActivitiesTable() {
  const q = State.filters.activities.search.trim().toLowerCase();
  const { status, type } = State.filters.activities;
  const filtered = State.activities.filter(a => {
    if (status && a.status !== status) return false;
    if (type && a.type !== type) return false;
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q)
    );
  });

  const statusBadge = s => {
    if (s === 'activa') return '<span class="badge badge--success">Activa</span>';
    if (s === 'finalizada') return '<span class="badge badge--neutral">Finalizada</span>';
    if (s === 'cancelada') return '<span class="badge badge--danger">Cancelada</span>';
    return '';
  };

  const result = applyTablePipeline(filtered, 'activities');

  const html = !result.total
    ? `<div class="empty"><i class="fa-solid fa-calendar-xmark"></i><h3>Sin actividades</h3><p>No hay actividades que coincidan con los filtros.</p></div>`
    : `
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            ${th('activities', 'name', 'Actividad')}
            ${th('activities', 'type', 'Tipo')}
            ${th('activities', 'location', 'Ubicación')}
            ${th('activities', 'date', 'Fecha')}
            ${th('activities', 'enrolledCount', 'Cupo')}
            ${th('activities', 'status', 'Estado')}
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${result.items
            .map(a => {
              const pct = a.capacity ? Math.round((a.enrolledCount / a.capacity) * 100) : 0;
              const nearFull = pct >= 80 && a.status === 'activa';
              return `
            <tr data-id="${Utils.escapeHtml(a.id)}" class="row-clickable" data-action="activity-detail">
              <td class="cell-strong">
                <div class="cell-with-thumb">
                  ${a.imageUrl
                    ? `<img class="activity-thumb" src="${Utils.escapeHtml(a.imageUrl)}" alt="" />`
                    : `<div class="activity-thumb activity-thumb--placeholder"><i class="fa-solid ${{exposicion:'fa-image',concierto:'fa-music',taller:'fa-screwdriver-wrench',teatro:'fa-masks-theater',conferencia:'fa-microphone'}[a.type] || 'fa-calendar-day'}"></i></div>`}
                  <span>${Utils.escapeHtml(a.name)}${nearFull ? ' <i class="fa-solid fa-fire" title="Casi lleno" style="color:var(--color-accent);margin-left:6px"></i>' : ''}</span>
                </div>
              </td>
              <td><span class="badge badge--type-${a.type}">${Utils.escapeHtml(Utils.activityTypeLabel(a.type))}</span></td>
              <td class="cell-muted">${Utils.escapeHtml(a.location)}</td>
              <td class="cell-muted">${Utils.formatDate(a.date)} ${Utils.dateRelativeBadge(a.date)}</td>
              <td>
                <div class="progress">
                  <div class="progress-track"><div class="progress-bar ${nearFull ? 'progress-bar--hot' : ''}" style="width:${pct}%"></div></div>
                  <div class="progress-meta"><span>${a.enrolledCount}/${a.capacity}</span><span>${pct}%</span></div>
                </div>
              </td>
              <td>${statusBadge(a.status)}</td>
              <td>
                <div class="table-actions" data-stop-row>
                  <button class="icon-btn" data-action="activity-detail" data-id="${Utils.escapeHtml(a.id)}" title="Ver asistentes"><i class="fa-solid fa-eye"></i></button>
                  <button class="icon-btn" data-action="activity-edit" data-id="${Utils.escapeHtml(a.id)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                  <button class="icon-btn icon-btn--danger" data-action="activity-delete" data-id="${Utils.escapeHtml(a.id)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
    ${paginationHtml('activities', result)}`;
  document.getElementById('activities-table').innerHTML = html;
}

function activityFormHtml(activity = null) {
  const typeOpts = ACTIVITY_TYPES.map(
    t => `<option value="${t.value}" ${activity?.type === t.value ? 'selected' : ''}>${t.label}</option>`,
  ).join('');
  const statusOpts = ACTIVITY_STATUSES.map(
    s => `<option value="${s.value}" ${activity?.status === s.value ? 'selected' : ''}>${s.label}</option>`,
  ).join('');
  const initialImage = activity?.imageUrl || '';
  return `
    <form class="form">
      <div class="form-group">
        <label>Imagen de la actividad</label>
        <div class="image-picker" id="activity-image-picker" data-current="${Utils.escapeHtml(initialImage)}">
          <div class="image-picker-preview ${initialImage ? 'has-image' : ''}" id="image-preview">
            ${initialImage
              ? `<img src="${Utils.escapeHtml(initialImage)}" alt="Vista previa" />
                 <button type="button" class="image-picker-remove" data-image-action="remove" title="Quitar imagen"><i class="fa-solid fa-xmark"></i></button>`
              : `<div class="image-picker-empty">
                   <i class="fa-solid fa-image"></i>
                   <span>Sin imagen</span>
                 </div>`}
          </div>
          <label class="btn btn--ghost btn--sm image-picker-btn">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
            <span>${initialImage ? 'Cambiar imagen' : 'Subir imagen'}</span>
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" hidden id="image-input" />
          </label>
          <div class="form-hint">JPG, PNG, WebP o GIF. Máx. 5 MB.</div>
        </div>
      </div>
      <div class="form-group">
        <label>Nombre <span class="required">*</span></label>
        <input type="text" name="name" required minlength="3" maxlength="100" value="${Utils.escapeHtml(activity?.name || '')}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo <span class="required">*</span></label>
          <select name="type" required>
            <option value="">Seleccionar…</option>
            ${typeOpts}
          </select>
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select name="status">${statusOpts || '<option value="activa">Activa</option>'}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ubicación <span class="required">*</span></label>
          <input type="text" name="location" required minlength="2" maxlength="100" value="${Utils.escapeHtml(activity?.location || '')}" />
        </div>
        <div class="form-group">
          <label>Cupo <span class="required">*</span></label>
          <input type="number" name="capacity" required min="1" max="10000" value="${activity?.capacity ?? ''}" />
        </div>
      </div>
      <div class="form-group">
        <label>Fecha y hora <span class="required">*</span></label>
        <input type="datetime-local" name="date" required value="${Utils.toInputValue(activity?.date) || Utils.todayInput()}" />
      </div>
      <div class="form-group">
        <label>Descripción</label>
        <textarea name="description" maxlength="1000" placeholder="Opcional">${Utils.escapeHtml(activity?.description || '')}</textarea>
      </div>
      ${activity ? `<div class="form-hint">Inscritos actuales: <strong>${activity.enrolledCount}</strong></div>` : ''}

      <div class="form-group suggestions-block" id="suggestions-block">
        <label>
          <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--color-accent)"></i>
          Personas sugeridas a invitar
          <span class="form-hint" style="font-weight:400;margin-left:6px">se actualiza al cambiar tipo/ubicación</span>
        </label>
        <div id="suggestions-content" class="suggestions-content">
          <div class="form-hint">Selecciona tipo y ubicación para ver sugerencias.</div>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> ${activity ? 'Guardar cambios' : 'Crear actividad'}</button>
      </div>
    </form>`;
}

function readActivityForm(form) {
  const fd = new FormData(form);
  const data = {
    name: fd.get('name'),
    type: fd.get('type'),
    location: fd.get('location'),
    date: Utils.toIsoFromInput(fd.get('date')),
    capacity: Number(fd.get('capacity')),
    description: fd.get('description') || '',
  };
  const status = fd.get('status');
  if (status) data.status = status;
  return data;
}

function bindImagePicker() {
  const picker = document.getElementById('activity-image-picker');
  if (!picker) return;
  const input = document.getElementById('image-input');
  const preview = document.getElementById('image-preview');
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      Toast.error('La imagen excede 5 MB');
      input.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    preview.classList.add('has-image');
    preview.innerHTML = `
      <img src="${url}" alt="Vista previa" />
      <button type="button" class="image-picker-remove" data-image-action="remove" title="Quitar imagen"><i class="fa-solid fa-xmark"></i></button>
      <span class="image-picker-pending">Nueva</span>`;
    picker.dataset.pending = '1';
  });
  preview?.addEventListener('click', e => {
    const btn = e.target.closest('[data-image-action="remove"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    input.value = '';
    picker.dataset.pending = '';
    picker.dataset.removed = '1';
    preview.classList.remove('has-image');
    preview.innerHTML = `
      <div class="image-picker-empty">
        <i class="fa-solid fa-image"></i>
        <span>Sin imagen</span>
      </div>`;
  });
}

async function resolveImageUrl(form, currentImageUrl) {
  const picker = document.getElementById('activity-image-picker');
  const input = document.getElementById('image-input');
  const file = input?.files?.[0];
  if (file) {
    const { url } = await API.uploads.image(file);
    return url;
  }
  if (picker?.dataset.removed === '1') return null;
  return currentImageUrl ?? undefined;
}

async function handleActivityNew() {
  Modal.open('Nueva actividad', activityFormHtml(), async form => {
    try {
      const payload = readActivityForm(form);
      const imageUrl = await resolveImageUrl(form, null);
      if (imageUrl !== undefined) payload.imageUrl = imageUrl;
      await API.activities.create(payload);
      Toast.success('Actividad creada');
      Modal.close();
      renderActivities();
    } catch (e) {
      Toast.error(explainError(e));
    }
  });
  bindImagePicker();
  bindSuggestionsRefresh(null);
}

async function handleActivityEdit(id) {
  const activity = State.activities.find(a => a.id === id);
  if (!activity) return;
  Modal.open('Editar actividad', activityFormHtml(activity), async form => {
    try {
      const payload = readActivityForm(form);

      // Si el usuario está cambiando a "cancelada" Y hay inscritos, confirmar
      if (
        activity.status !== 'cancelada' &&
        payload.status === 'cancelada' &&
        activity.enrolledCount > 0
      ) {
        const ok = await Modal.confirm({
          title: 'Cancelar actividad',
          message: `Se enviará un email de cancelación a los ${activity.enrolledCount} inscrito(s) con correo registrado. ¿Continuar?`,
          confirmLabel: 'Sí, cancelar y notificar',
          cancelLabel: 'Volver',
          danger: true,
        });
        if (!ok) return;
      }

      const imageUrl = await resolveImageUrl(form, activity.imageUrl);
      if (imageUrl !== undefined) payload.imageUrl = imageUrl;
      await API.activities.update(id, payload);
      if (activity.status !== 'cancelada' && payload.status === 'cancelada' && activity.enrolledCount > 0) {
        Toast.success(`Actividad cancelada. Enviando ${activity.enrolledCount} email(s)…`);
      } else {
        Toast.success('Actividad actualizada');
      }
      Modal.close();
      renderActivities();
    } catch (e) {
      Toast.error(explainError(e));
    }
  });
  bindImagePicker();
  bindSuggestionsRefresh(id);
}

const _suggestionsCache = { lastKey: null, payload: null };

function bindSuggestionsRefresh(excludeActivityId) {
  const form = document.querySelector('.modal-body form');
  if (!form) return;
  const typeSelect = form.querySelector('select[name="type"]');
  const locationInput = form.querySelector('input[name="location"]');
  if (!typeSelect || !locationInput) return;

  let debounce;
  const refresh = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const type = typeSelect.value;
      const location = locationInput.value.trim();
      loadSuggestions({ type, location, excludeActivityId });
    }, 250);
  };
  typeSelect.addEventListener('change', refresh);
  locationInput.addEventListener('input', refresh);
  refresh();
}

async function loadSuggestions({ type, location, excludeActivityId }) {
  const content = document.getElementById('suggestions-content');
  if (!content) return;
  if (!type) {
    content.innerHTML = '<div class="form-hint">Selecciona un tipo para ver sugerencias.</div>';
    return;
  }
  content.innerHTML = '<div class="form-hint"><i class="fa-solid fa-spinner fa-spin"></i> Calculando sugerencias…</div>';
  try {
    const resp = await API.insights.suggestions({
      type,
      location: location || undefined,
      limit: 50,
      excludeActivityId,
    });
    _suggestionsCache.lastKey = `${type}|${location || ''}|${excludeActivityId || ''}`;
    _suggestionsCache.payload = resp;
    renderSuggestions(resp, { type, location });
  } catch (e) {
    content.innerHTML = `<div class="form-hint" style="color:var(--color-danger)">${Utils.escapeHtml(explainError(e))}</div>`;
  }
}

function renderSuggestions(resp, { type, location }) {
  const content = document.getElementById('suggestions-content');
  if (!content) return;
  const { suggestions, total } = resp;
  if (!total) {
    content.innerHTML = `
      <div class="form-hint">
        Sin coincidencias para ${Utils.escapeHtml(Utils.activityTypeLabel(type))}${location ? ' en ' + Utils.escapeHtml(location) : ''}.
        Necesitas más asistencias históricas para generar sugerencias.
      </div>`;
    return;
  }
  content.innerHTML = `
    <div class="suggestions-header">
      <div class="form-hint">
        <strong>${total}</strong> visitante(s) con afinidad a ${Utils.escapeHtml(Utils.activityTypeLabel(type))}${location ? ` en <strong>${Utils.escapeHtml(location)}</strong>` : ''}
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-action="suggestions-export">
        <i class="fa-solid fa-file-export"></i> Exportar lista
      </button>
    </div>
    <div class="suggestions-list">
      ${suggestions
        .slice(0, 10)
        .map(
          s => `
        <div class="suggestion-row">
          <div class="suggestion-info">
            <span class="user-code">${Utils.escapeHtml(s.user.code)}</span>
            <div>
              <div class="cell-strong">${Utils.escapeHtml(s.user.firstName + ' ' + s.user.lastName)}</div>
              <div class="cell-muted">${Utils.escapeHtml(s.user.email || s.user.phone || '—')}</div>
            </div>
          </div>
          <div class="suggestion-stats">
            <span class="badge badge--info" title="Asistencias a este tipo">${s.affinity.typeMatches} ${Utils.escapeHtml(Utils.activityTypeLabel(type))}(s)</span>
            ${s.affinity.locationMatches > 0
              ? `<span class="badge badge--neutral" title="Asistencias en esta ubicación">${s.affinity.locationMatches} ${Utils.escapeHtml(location)}</span>`
              : ''}
            <span class="suggestion-score" title="Puntuación de afinidad">${s.score}</span>
          </div>
        </div>`,
        )
        .join('')}
      ${suggestions.length > 10
        ? `<div class="form-hint" style="text-align:center;padding:10px">+ ${suggestions.length - 10} más en la exportación</div>`
        : ''}
    </div>`;

  content.querySelector('[data-action="suggestions-export"]')?.addEventListener('click', () => {
    exportSuggestions(resp, { type, location });
  });
}

function exportSuggestions(resp, { type, location }) {
  if (typeof XLSX === 'undefined') {
    Toast.error('La librería de Excel no está disponible');
    return;
  }
  const aoa = [['Código', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'Visitas', `Asistencias a ${Utils.activityTypeLabel(type)}`, 'En ubicación', 'Estado', 'Puntuación']];
  resp.suggestions.forEach(s => {
    aoa.push([
      s.user.code,
      s.user.firstName,
      s.user.lastName,
      s.user.email || '',
      s.user.phone || '',
      s.user.visitCount,
      s.affinity.typeMatches,
      s.affinity.locationMatches,
      s.affinity.status,
      s.score,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = aoa[0].map(h => ({ wch: Math.max(14, String(h).length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invitados sugeridos');
  const tag = `${type}${location ? '-' + location.replace(/[^a-z0-9]/gi, '-').slice(0, 20) : ''}`;
  XLSX.writeFile(wb, `ccb-invitados-${tag}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  Toast.success(`${resp.total} invitado(s) exportados`);
}

// State cache for the open activity detail
const _activityDetailCache = { id: null, data: null };

async function handleActivityDetail(id) {
  if (!id) return;
  let data, summary;
  try {
    data = await API.request(`/activities/${encodeURIComponent(id)}/attendees`);
    summary = await API.insights.activitySummary(id).catch(() => null);
  } catch (e) {
    Toast.error(explainError(e));
    return;
  }
  _activityDetailCache.id = id;
  _activityDetailCache.data = data;
  _activityDetailCache.summary = summary;
  renderActivityDetailModal();
}

function renderActivityDetailModal() {
  const { activity, attendees, total } = _activityDetailCache.data;
  const pct = activity.capacity ? Math.round((activity.enrolledCount / activity.capacity) * 100) : 0;
  const nearFull = pct >= 80;

  const statusBadgeHtml = (() => {
    if (activity.status === 'activa') return '<span class="badge badge--success">Activa</span>';
    if (activity.status === 'finalizada') return '<span class="badge badge--neutral">Finalizada</span>';
    if (activity.status === 'cancelada') return '<span class="badge badge--danger">Cancelada</span>';
    return '';
  })();

  const attendeesTable = !attendees.length
    ? `<div class="empty">
         <i class="fa-solid fa-user-slash"></i>
         <h3>Aún no hay asistentes</h3>
         <p>Cuando se registren visitantes, aparecerán aquí.</p>
       </div>`
    : `<div class="table-wrapper" style="max-height:340px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md)">
        <table class="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Registro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${attendees.map(a => `
              <tr>
                <td><span class="user-code">${Utils.escapeHtml(a.code)}</span></td>
                <td class="cell-strong">${Utils.escapeHtml(a.firstName + ' ' + a.lastName)}</td>
                <td class="cell-muted">${Utils.escapeHtml(a.email || a.phone || '—')}</td>
                <td class="cell-muted">${Utils.formatDate(a.registeredAt)}</td>
                <td>
                  <button class="icon-btn icon-btn--danger" data-action="activity-attendance-remove" data-attendance-id="${Utils.escapeHtml(a.attendanceId)}" data-activity-id="${Utils.escapeHtml(activity.id)}" title="Eliminar registro"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  const body = `
    <div class="activity-detail">
      ${activity.imageUrl ? `
        <div class="activity-detail-banner">
          <img src="${Utils.escapeHtml(activity.imageUrl)}" alt="${Utils.escapeHtml(activity.name)}" />
        </div>` : ''}
      <div class="activity-detail-header">
        <div class="activity-detail-titles">
          <div class="activity-detail-badges">
            <span class="badge badge--type-${activity.type}">${Utils.escapeHtml(Utils.activityTypeLabel(activity.type))}</span>
            ${statusBadgeHtml}
            ${Utils.dateRelativeBadge(activity.date)}
          </div>
          <h3>${Utils.escapeHtml(activity.name)}</h3>
        </div>
      </div>

      <div class="activity-detail-info">
        <div class="activity-detail-row"><i class="fa-solid fa-calendar"></i> ${Utils.formatDate(activity.date)}</div>
        <div class="activity-detail-row"><i class="fa-solid fa-location-dot"></i> ${Utils.escapeHtml(activity.location)}</div>
        <div class="activity-detail-row">
          <i class="fa-solid fa-users"></i>
          <div style="flex:1">
            <div class="progress">
              <div class="progress-track"><div class="progress-bar ${nearFull ? 'progress-bar--hot' : ''}" style="width:${pct}%"></div></div>
              <div class="progress-meta"><span>${activity.enrolledCount}/${activity.capacity} inscritos</span><span>${pct}%</span></div>
            </div>
          </div>
        </div>
        ${activity.description ? `<div class="activity-detail-desc">${Utils.escapeHtml(activity.description)}</div>` : ''}
      </div>

      ${_activityDetailCache.summary && (activity.status === 'finalizada' || activity.enrolledCount > 0)
        ? renderActivitySummary(_activityDetailCache.summary)
        : ''}

      <div class="activity-detail-section">
        <div class="activity-detail-section-header">
          <h4>Asistentes <span class="muted-count">(${total})</span></h4>
          ${total > 0 ? `
            <div class="activity-detail-section-actions">
              <button class="btn btn--ghost btn--sm" data-action="activity-attendees-export" data-id="${Utils.escapeHtml(activity.id)}">
                <i class="fa-solid fa-file-export"></i> Exportar
              </button>
              <button class="btn btn--ghost btn--sm" data-action="activity-attendees-print" data-id="${Utils.escapeHtml(activity.id)}">
                <i class="fa-solid fa-print"></i> Imprimir
              </button>
            </div>` : ''}
        </div>
        ${attendeesTable}
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cerrar</button>
        <button type="button" class="btn btn--primary" id="activity-detail-edit">
          <i class="fa-solid fa-pen"></i> Editar actividad
        </button>
      </div>
    </div>`;

  Modal.open('Detalle de actividad', body, null);
  document.getElementById('activity-detail-edit').onclick = () => {
    Modal.close();
    handleActivityEdit(activity.id);
  };
}

function renderActivitySummary(payload) {
  const s = payload.summary;
  if (!s || s.totalAttendances === 0) return '';
  const isFinalized = payload.activity.status === 'finalizada';
  return `
    <div class="activity-detail-section">
      <div class="activity-detail-section-header">
        <h4>${isFinalized ? 'Resumen post-evento' : 'Resumen en vivo'}</h4>
      </div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-card-label">Asistencias</div>
          <div class="summary-card-value">${s.totalAttendances}</div>
          <div class="summary-card-extra">${s.occupancyPct}% ocupación</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">Nuevos visitantes</div>
          <div class="summary-card-value">${s.newcomers}</div>
          <div class="summary-card-extra">${s.newcomerRatio}% del total</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">Habituales</div>
          <div class="summary-card-value">${s.returning}</div>
          <div class="summary-card-extra">Prom. ${s.avgPriorAttendances} visitas previas</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">VIPs presentes</div>
          <div class="summary-card-value">${s.vipCount}</div>
          <div class="summary-card-extra">≥10 visitas totales</div>
        </div>
      </div>
    </div>`;
}

function exportActivityAttendees(activityId) {
  if (typeof XLSX === 'undefined') {
    Toast.error('La librería de Excel no está disponible');
    return;
  }
  if (!_activityDetailCache.data || _activityDetailCache.id !== activityId) {
    Toast.error('No hay datos de asistentes cargados');
    return;
  }
  const { activity, attendees } = _activityDetailCache.data;
  const aoa = [['Código', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'Visitas', 'Fecha de registro']];
  attendees.forEach(a => {
    aoa.push([a.code, a.firstName, a.lastName, a.email || '', a.phone || '', a.visitCount, a.registeredAt]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = aoa[0].map(h => ({ wch: Math.max(14, String(h).length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistentes');
  const safeName = activity.name.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40);
  XLSX.writeFile(wb, `ccb-asistentes-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  Toast.success(`${attendees.length} asistente(s) exportados`);
}

function printActivityAttendees(activityId) {
  if (!_activityDetailCache.data || _activityDetailCache.id !== activityId) return;
  const { activity, attendees } = _activityDetailCache.data;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    Toast.error('El navegador bloqueó la ventana de impresión');
    return;
  }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = attendees
    .map(
      (a, i) => `
      <tr>
        <td style="text-align:center;color:#6b7280">${i + 1}</td>
        <td><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-family:Menlo,monospace">${esc(a.code)}</code></td>
        <td><strong>${esc(a.firstName)} ${esc(a.lastName)}</strong></td>
        <td>${esc(a.email || a.phone || '—')}</td>
        <td>${new Date(a.registeredAt).toLocaleString('es-DO')}</td>
        <td style="border-bottom:1px solid #1a237e;width:80px"></td>
      </tr>`,
    )
    .join('');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Asistentes — ${esc(activity.name)}</title>
<style>
  body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #1f2937; }
  .header { border-bottom: 3px solid #1a237e; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { color: #1a237e; font-weight: 700; letter-spacing: 1px; font-size: 12px; margin-bottom: 4px; }
  h1 { font-size: 26px; margin: 0; }
  .meta { color: #6b7280; font-size: 14px; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
  td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
  .footer { margin-top: 32px; font-size: 11px; color: #6b7280; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    <div class="brand">CENTRO CULTURAL BANRESERVAS</div>
    <h1>${esc(activity.name)}</h1>
    <div class="meta">
      ${esc(Utils.activityTypeLabel(activity.type))} · ${esc(activity.location)} · ${new Date(activity.date).toLocaleString('es-DO')}
    </div>
    <div class="meta">${attendees.length} asistente(s) registrado(s) · ${activity.enrolledCount}/${activity.capacity} cupo</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Código</th><th>Nombre</th><th>Contacto</th><th>Registrado</th><th>Firma</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="padding:32px;text-align:center;color:#6b7280">Sin asistentes registrados</td></tr>'}</tbody>
  </table>
  <div class="footer">Impreso el ${new Date().toLocaleString('es-DO')}</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`);
  w.document.close();
}

async function removeAttendanceFromActivity(attendanceId, activityId) {
  if (!attendanceId) return;
  const ok = await Modal.confirm({
    title: 'Eliminar registro',
    message: '¿Eliminar este registro de asistencia? El cupo se liberará.',
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  try {
    await API.attendance.remove(attendanceId);
    Toast.success('Registro eliminado');
    const fresh = await API.request(`/activities/${encodeURIComponent(activityId)}/attendees`);
    _activityDetailCache.id = activityId;
    _activityDetailCache.data = fresh;
    renderActivityDetailModal();
  } catch (e) {
    Toast.error(explainError(e));
  }
}

async function handleActivityDelete(id) {
  const a = State.activities.find(x => x.id === id);
  if (!a) return;
  const hasAttendees = a.enrolledCount > 0;
  const isCancelled = a.status === 'cancelada';
  const message = isCancelled && hasAttendees
    ? `¿Eliminar definitivamente "${a.name}"? Se borrarán también los ${a.enrolledCount} registro(s) de asistencia asociados. Esta acción no se puede deshacer.`
    : `¿Eliminar la actividad "${a.name}"? Esta acción no se puede deshacer.`;
  const ok = await Modal.confirm({
    title: 'Eliminar actividad',
    message,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  try {
    await API.activities.remove(id);
    Toast.success('Actividad eliminada');
    renderActivities();
  } catch (e) {
    Toast.error(explainError(e));
  }
}

// ============================================================
// View: Attendance
// ============================================================
async function renderAttendance() {
  const [{ attendances }, { users }, { activities }] = await Promise.all([
    API.attendance.list(),
    API.users.list(),
    API.activities.list(),
  ]);
  State.attendance = attendances;
  State.users = users;
  State.activities = activities;

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn--ghost" data-action="attendance-export" title="Exportar a Excel">
      <i class="fa-solid fa-file-export"></i> Exportar
    </button>
    <button class="btn btn--accent" data-action="attendance-new">
      <i class="fa-solid fa-plus"></i> Registrar asistencia
    </button>`;

  const userOpts =
    '<option value="">Todos los usuarios</option>' +
    users
      .map(u => `<option value="${Utils.escapeHtml(u.code)}">${Utils.escapeHtml(u.code + ' · ' + u.firstName + ' ' + u.lastName)}</option>`)
      .join('');
  const activityOpts =
    '<option value="">Todas las actividades</option>' +
    activities
      .map(a => `<option value="${Utils.escapeHtml(a.id)}">${Utils.escapeHtml(a.name)}</option>`)
      .join('');

  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Registros de asistencia</h2>
          <p>${attendances.length} asistencia(s) registradas</p>
        </div>
        <div class="toolbar">
          <select id="attendance-user" class="select-input">${userOpts}</select>
          <select id="attendance-activity" class="select-input">${activityOpts}</select>
        </div>
      </div>
      <div class="panel-body panel-body--flush">
        <div id="attendance-table"></div>
      </div>
    </div>`;

  document.getElementById('attendance-user').value = State.filters.attendance.userCode;
  document.getElementById('attendance-activity').value = State.filters.attendance.activityId;

  document.getElementById('attendance-user').addEventListener('change', e => {
    State.filters.attendance.userCode = e.target.value;
    paintAttendanceTable();
  });
  document.getElementById('attendance-activity').addEventListener('change', e => {
    State.filters.attendance.activityId = e.target.value;
    paintAttendanceTable();
  });
  paintAttendanceTable();
}

function paintAttendanceTable() {
  const { userCode, activityId } = State.filters.attendance;
  const filtered = State.attendance.filter(a => {
    if (userCode && a.userCode !== userCode) return false;
    if (activityId && a.activityId !== activityId) return false;
    return true;
  });

  const userByCode = new Map(State.users.map(u => [u.code, u]));

  const result = applyTablePipeline(filtered, 'attendance');

  const html = !result.total
    ? `<div class="empty"><i class="fa-solid fa-clipboard-question"></i><h3>Sin registros</h3><p>No hay asistencias que coincidan.</p></div>`
    : `
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            ${th('attendance', 'userCode', 'Código')}
            <th>Usuario</th>
            ${th('attendance', 'activityName', 'Actividad')}
            ${th('attendance', 'registeredAt', 'Fecha del registro')}
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${result.items
            .map(a => {
              const u = userByCode.get(a.userCode);
              const name = u ? `${u.firstName} ${u.lastName}` : '—';
              return `
            <tr data-id="${Utils.escapeHtml(a.id)}">
              <td><span class="user-code">${Utils.escapeHtml(a.userCode)}</span></td>
              <td class="cell-strong">${Utils.escapeHtml(name)}</td>
              <td>${Utils.escapeHtml(a.activityName)}</td>
              <td class="cell-muted">${Utils.formatDate(a.registeredAt)}</td>
              <td>
                <div class="table-actions">
                  <button class="icon-btn icon-btn--danger" data-action="attendance-delete" data-id="${Utils.escapeHtml(a.id)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
    ${paginationHtml('attendance', result)}`;
  document.getElementById('attendance-table').innerHTML = html;
}

function attendanceFormHtml() {
  const userOpts = State.users
    .map(u => `<option value="${Utils.escapeHtml(u.code)}">${Utils.escapeHtml(u.code + ' · ' + u.firstName + ' ' + u.lastName)}</option>`)
    .join('');
  const availableActivities = State.activities.filter(
    a => a.status === 'activa' && a.enrolledCount < a.capacity,
  );
  const activityOpts = availableActivities
    .map(
      a => `<option value="${Utils.escapeHtml(a.id)}">${Utils.escapeHtml(a.name)} · ${a.enrolledCount}/${a.capacity}</option>`,
    )
    .join('');
  const noUsers = !State.users.length;
  const noActivities = !availableActivities.length;

  return `
    <form class="form">
      <div class="form-group">
        <label>Usuario <span class="required">*</span></label>
        <select name="userCode" required ${noUsers ? 'disabled' : ''}>
          <option value="">Seleccionar usuario…</option>
          ${userOpts}
        </select>
        ${noUsers ? '<div class="form-hint">No hay usuarios registrados. Crea uno primero.</div>' : ''}
      </div>
      <div class="form-group">
        <label>Actividad <span class="required">*</span></label>
        <select name="activityId" required ${noActivities ? 'disabled' : ''}>
          <option value="">Seleccionar actividad…</option>
          ${activityOpts}
        </select>
        ${noActivities ? '<div class="form-hint">No hay actividades activas con cupo disponible.</div>' : '<div class="form-hint">Solo actividades activas con cupo libre.</div>'}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary" ${noUsers || noActivities ? 'disabled' : ''}>
          <i class="fa-solid fa-check"></i> Registrar
        </button>
      </div>
    </form>`;
}

async function handleAttendanceNew() {
  Modal.open('Registrar asistencia', attendanceFormHtml(), async form => {
    const data = Object.fromEntries(new FormData(form));
    try {
      await API.attendance.create(data);
      Toast.success('Asistencia registrada');
      Modal.close();
      renderAttendance();
    } catch (e) {
      Toast.error(explainError(e));
    }
  });
}

async function handleAttendanceDelete(id) {
  const ok = await Modal.confirm({
    title: 'Eliminar registro',
    message: '¿Eliminar este registro de asistencia?',
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  try {
    await API.attendance.remove(id);
    Toast.success('Registro eliminado');
    renderAttendance();
  } catch (e) {
    Toast.error(explainError(e));
  }
}

// ============================================================
// View: Segments
// ============================================================
async function renderSegments() {
  const { segments } = await API.insights.segments();
  document.getElementById('content').innerHTML = `
    <div class="segments-grid">
      ${segments
        .map(
          s => `
        <button class="segment-card" data-action="segment-open" data-id="${Utils.escapeHtml(s.id)}">
          <div class="segment-icon segment-icon--${Utils.escapeHtml(s.color)}">
            <i class="fa-solid ${Utils.escapeHtml(s.icon)}"></i>
          </div>
          <div class="segment-info">
            <div class="segment-label">${Utils.escapeHtml(s.label)}</div>
            <div class="segment-desc">${Utils.escapeHtml(s.description)}</div>
          </div>
          <div class="segment-count">
            <span>${s.count}</span>
            <small>persona(s)</small>
          </div>
        </button>`,
        )
        .join('')}
    </div>`;
}

async function handleSegmentOpen(id) {
  let data;
  try {
    data = await API.insights.segment(id);
  } catch (e) {
    Toast.error(explainError(e));
    return;
  }
  const { segments } = await API.insights.segments().catch(() => ({ segments: [] }));
  const meta = segments.find(s => s.id === id) || { label: id, description: '', icon: 'fa-layer-group', color: 'blue' };

  const STATUS_BADGE = {
    activo: '<span class="badge badge--success">Activo</span>',
    regular: '<span class="badge badge--info">Regular</span>',
    dormido: '<span class="badge badge--warning">Dormido</span>',
    nuevo: '<span class="badge badge--neutral">Nuevo</span>',
  };

  const body = `
    <div class="segment-detail">
      <div class="segment-detail-header">
        <div class="segment-icon segment-icon--${Utils.escapeHtml(meta.color)}">
          <i class="fa-solid ${Utils.escapeHtml(meta.icon)}"></i>
        </div>
        <div>
          <h3>${Utils.escapeHtml(meta.label)}</h3>
          <p class="form-hint">${Utils.escapeHtml(meta.description)} · ${data.total} persona(s)</p>
        </div>
      </div>
      ${data.total === 0
        ? `<div class="empty"><i class="fa-solid fa-user-slash"></i><h3>Sin usuarios en este segmento</h3><p>A medida que se acumulen asistencias aparecerán aquí.</p></div>`
        : `
        <div class="table-wrapper" style="max-height:420px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md)">
          <table class="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Contacto</th>
                <th>Asistencias</th>
                <th>Última visita</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${data.users
                .map(
                  u => `
                <tr>
                  <td><span class="user-code">${Utils.escapeHtml(u.code)}</span></td>
                  <td class="cell-strong">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</td>
                  <td class="cell-muted">${Utils.escapeHtml(u.email || u.phone || '—')}</td>
                  <td><span class="badge badge--info">${u.totalAttendances}</span></td>
                  <td class="cell-muted">${u.lastAttendanceAt ? Utils.formatDate(u.lastAttendanceAt, false) : '—'}</td>
                  <td>${STATUS_BADGE[u.status] || ''}</td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>`}
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cerrar</button>
        ${data.total > 0
          ? `<button type="button" class="btn btn--primary" data-action="segment-export" data-id="${Utils.escapeHtml(id)}">
              <i class="fa-solid fa-file-export"></i> Exportar a Excel
            </button>`
          : ''}
      </div>
    </div>`;

  Modal.open(meta.label, body, null);
}

function exportSegment(id) {
  if (typeof XLSX === 'undefined') {
    Toast.error('La librería de Excel no está disponible');
    return;
  }
  API.insights
    .segment(id)
    .then(data => {
      const aoa = [['Código', 'Nombre', 'Apellido', 'Email', 'Teléfono', 'Visitas', 'Asistencias', 'Última visita', 'Estado']];
      data.users.forEach(u => {
        aoa.push([
          u.code,
          u.firstName,
          u.lastName,
          u.email || '',
          u.phone || '',
          u.visitCount,
          u.totalAttendances,
          u.lastAttendanceAt || '',
          u.status,
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = aoa[0].map(h => ({ wch: Math.max(14, String(h).length + 4) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Segmento');
      XLSX.writeFile(wb, `ccb-segmento-${id}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      Toast.success(`${data.total} persona(s) exportadas`);
    })
    .catch(e => Toast.error(explainError(e)));
}

// ============================================================
// View: Check-in
// ============================================================
async function renderCheckin() {
  const [usersResp, actsResp] = await Promise.all([
    API.users.list(),
    API.activities.list(),
  ]);
  State.users = usersResp.users;
  State.activities = actsResp.activities;
  State.checkin = State.checkin || { selectedUser: null };

  const activeCount = State.activities.filter(a => a.status === 'activa').length;

  document.getElementById('content').innerHTML = `
    <div class="checkin-grid">
      <div class="panel checkin-search-panel">
        <div class="panel-header">
          <div>
            <h2>1. Buscar visitante</h2>
            <p>Teclea código, nombre, email o teléfono</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="search-input search-input--lg">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="checkin-search" placeholder="CCB-XXXXXX, nombre o email…" autocomplete="off" />
          </div>
          <div id="checkin-suggestions" class="checkin-suggestions"></div>
          <div id="checkin-selected"></div>
        </div>
      </div>
      <div class="panel checkin-activities-panel">
        <div class="panel-header">
          <div>
            <h2>2. Elegir actividad</h2>
            <p>${activeCount} actividad(es) activa(s)</p>
          </div>
        </div>
        <div class="panel-body">
          <div id="checkin-activities" class="checkin-activities"></div>
        </div>
      </div>
    </div>`;

  paintCheckinActivities();
  paintCheckinSelected();
  const inputEl = document.getElementById('checkin-search');
  inputEl.focus();
  inputEl.addEventListener('input', e => paintCheckinSuggestions(e.target.value));
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = document.querySelector('#checkin-suggestions .checkin-suggestion');
      if (first) first.click();
    } else if (e.key === 'Escape') {
      inputEl.value = '';
      paintCheckinSuggestions('');
    }
  });
}

function paintCheckinSuggestions(q) {
  const el = document.getElementById('checkin-suggestions');
  if (!el) return;
  const query = q.trim().toLowerCase();
  if (!query) { el.innerHTML = ''; return; }
  const matches = State.users
    .filter(u =>
      u.code.toLowerCase().includes(query) ||
      u.firstName.toLowerCase().includes(query) ||
      u.lastName.toLowerCase().includes(query) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.phone && u.phone.toLowerCase().includes(query)),
    )
    .slice(0, 8);
  if (!matches.length) {
    el.innerHTML = `
      <div class="checkin-no-results">
        <i class="fa-solid fa-user-slash"></i>
        <span>Sin coincidencias para "${Utils.escapeHtml(q)}"</span>
        <button type="button" class="btn btn--ghost btn--sm" data-action="user-new">
          <i class="fa-solid fa-plus"></i> Crear usuario
        </button>
      </div>`;
    return;
  }
  el.innerHTML = matches
    .map(
      u => `
    <button type="button" class="checkin-suggestion" data-action="checkin-select" data-code="${Utils.escapeHtml(u.code)}">
      <span class="user-code">${Utils.escapeHtml(u.code)}</span>
      <div class="checkin-suggestion-info">
        <div class="cell-strong">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</div>
        <div class="cell-muted">${Utils.escapeHtml(u.email || u.phone || '—')}</div>
      </div>
      <span class="badge badge--info">${u.visitCount}v</span>
    </button>`,
    )
    .join('');
}

function paintCheckinSelected() {
  const u = State.checkin?.selectedUser;
  const el = document.getElementById('checkin-selected');
  if (!el) return;
  if (!u) {
    el.innerHTML = `
      <div class="checkin-empty-selection">
        <i class="fa-solid fa-arrow-up"></i>
        <p>Busca y selecciona un visitante para continuar</p>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="checkin-selected-card">
      <img src="${qrUrl(u.code, 80)}" alt="QR" class="checkin-qr" />
      <div class="checkin-selected-info">
        <div class="user-code">${Utils.escapeHtml(u.code)}</div>
        <h3>${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</h3>
        <div class="cell-muted">${Utils.escapeHtml(u.email || u.phone || 'Sin contacto')}</div>
        <div class="checkin-selected-stats">
          <span class="badge badge--info"><i class="fa-solid fa-repeat"></i> ${u.visitCount} visita(s)</span>
        </div>
      </div>
      <button class="icon-btn" data-action="checkin-clear" title="Limpiar selección">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`;
}

function paintCheckinActivities() {
  const active = State.activities.filter(a => a.status === 'activa');
  const el = document.getElementById('checkin-activities');
  if (!el) return;
  if (!active.length) {
    el.innerHTML = `<div class="empty"><i class="fa-solid fa-calendar-xmark"></i><h3>Sin actividades activas</h3><p>Crea una actividad para empezar a recibir asistencias.</p></div>`;
    return;
  }
  const u = State.checkin?.selectedUser;
  el.innerHTML = active
    .map(a => {
      const pct = a.capacity ? Math.round((a.enrolledCount / a.capacity) * 100) : 0;
      const isFull = a.enrolledCount >= a.capacity;
      const nearFull = pct >= 80;
      return `
      <div class="checkin-activity-card ${isFull ? 'is-full' : ''} ${nearFull && !isFull ? 'is-hot' : ''}" data-activity-id="${Utils.escapeHtml(a.id)}">
        <div class="checkin-activity-header">
          <span class="badge badge--type-${a.type}">${Utils.escapeHtml(Utils.activityTypeLabel(a.type))}</span>
          <span class="cell-muted" style="font-size:11px">${Utils.formatDate(a.date)}</span>
        </div>
        <h3>${Utils.escapeHtml(a.name)}</h3>
        <div class="cell-muted" style="margin-bottom:8px"><i class="fa-solid fa-location-dot"></i> ${Utils.escapeHtml(a.location)}</div>
        <div class="progress" style="margin-bottom:12px">
          <div class="progress-track"><div class="progress-bar ${nearFull ? 'progress-bar--hot' : ''}" style="width:${pct}%"></div></div>
          <div class="progress-meta"><span>${a.enrolledCount}/${a.capacity}</span><span>${pct}%</span></div>
        </div>
        <button class="btn ${u && !isFull ? 'btn--accent' : 'btn--ghost'}" data-action="checkin-register" data-user-code="${Utils.escapeHtml(u?.code || '')}" data-activity-id="${Utils.escapeHtml(a.id)}" ${!u || isFull ? 'disabled' : ''} style="width:100%;justify-content:center">
          ${isFull ? '<i class="fa-solid fa-ban"></i> Cupo lleno' : u ? '<i class="fa-solid fa-check"></i> Registrar asistencia' : '<i class="fa-solid fa-user"></i> Selecciona un usuario'}
        </button>
      </div>`;
    })
    .join('');
}

async function handleCheckinSelect(code) {
  try {
    const user = await API.users.get(code);
    State.checkin = State.checkin || {};
    State.checkin.selectedUser = user;
    const input = document.getElementById('checkin-search');
    if (input) input.value = '';
    paintCheckinSuggestions('');
    paintCheckinSelected();
    paintCheckinActivities();
  } catch (e) {
    Toast.error(explainError(e));
  }
}

function handleCheckinClear() {
  if (State.checkin) State.checkin.selectedUser = null;
  paintCheckinSelected();
  paintCheckinActivities();
  document.getElementById('checkin-search')?.focus();
}

async function handleCheckinRegister(userCode, activityId) {
  if (!userCode || !activityId) return;
  try {
    await API.attendance.create({ userCode, activityId });
    Toast.success('¡Asistencia registrada!');
    const [actsResp, user] = await Promise.all([
      API.activities.list(),
      API.users.get(userCode),
    ]);
    State.activities = actsResp.activities;
    State.checkin.selectedUser = user;
    paintCheckinActivities();
    paintCheckinSelected();
    const card = document.querySelector(`.checkin-activity-card[data-activity-id="${activityId}"]`);
    if (card) {
      card.classList.add('pulse-success');
      setTimeout(() => card.classList.remove('pulse-success'), 900);
    }
  } catch (e) {
    Toast.error(explainError(e));
  }
}

// ============================================================
// Event delegation
// ============================================================
function bindGlobalEvents() {
  document.addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (th) {
      const key = th.dataset.sortKey;
      const field = th.dataset.sortField;
      const p = State.pagination[key];
      if (p.sortBy === field) p.sortDir = p.sortDir === 'asc' ? 'desc' : 'asc';
      else { p.sortBy = field; p.sortDir = 'asc'; }
      p.page = 1;
      repaintTable(key);
      return;
    }

    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const code = target.dataset.code;
    const id = target.dataset.id;
    const paginateKey = target.dataset.paginateKey;

    if (e.target.closest('[data-stop-row]') && target.matches('tr[data-action]')) return;

    switch (action) {
      case 'user-new': handleUserNew(); break;
      case 'user-edit': handleUserEdit(code); break;
      case 'user-delete': handleUserDelete(code); break;
      case 'user-detail': handleUserDetail(target.dataset.code); break;
      case 'user-template': handleUserTemplate(); break;
      case 'user-import': handleUserImport(); break;
      case 'users-export': handleExport('users'); break;
      case 'activity-new': handleActivityNew(); break;
      case 'activity-edit': handleActivityEdit(id); break;
      case 'activity-delete': handleActivityDelete(id); break;
      case 'activity-detail': handleActivityDetail(id); break;
      case 'activities-export': handleExport('activities'); break;
      case 'activity-attendees-export':
        exportActivityAttendees(target.dataset.id); break;
      case 'activity-attendees-print':
        printActivityAttendees(target.dataset.id); break;
      case 'activity-attendance-remove':
        removeAttendanceFromActivity(target.dataset.attendanceId, target.dataset.activityId); break;
      case 'attendance-new': handleAttendanceNew(); break;
      case 'attendance-delete': handleAttendanceDelete(id); break;
      case 'attendance-export': handleExport('attendance'); break;
      case 'page-prev':
        State.pagination[paginateKey].page = Math.max(1, State.pagination[paginateKey].page - 1);
        repaintTable(paginateKey); break;
      case 'page-next':
        State.pagination[paginateKey].page += 1;
        repaintTable(paginateKey); break;
      case 'page-first':
        State.pagination[paginateKey].page = 1;
        repaintTable(paginateKey); break;
      case 'page-last':
        State.pagination[paginateKey].page = Infinity;
        repaintTable(paginateKey); break;
      case 'checkin-register':
        handleCheckinRegister(target.dataset.userCode, target.dataset.activityId); break;
      case 'checkin-select':
        handleCheckinSelect(target.dataset.code); break;
      case 'checkin-clear':
        handleCheckinClear(); break;
      case 'segment-open':
        handleSegmentOpen(target.dataset.id); break;
      case 'segment-export':
        exportSegment(target.dataset.id); break;
    }
  });

  document.addEventListener('change', e => {
    if (e.target.matches('[data-action="page-size"]')) {
      const key = e.target.dataset.paginateKey;
      State.pagination[key].pageSize = parseInt(e.target.value, 10);
      State.pagination[key].page = 1;
      repaintTable(key);
    }
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });
}

// ============================================================
// Init
// ============================================================
function init() {
  Modal.init();
  bindGlobalEvents();
  if (!window.location.hash) window.location.hash = '#/dashboard';
  window.addEventListener('hashchange', navigate);
  navigate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
