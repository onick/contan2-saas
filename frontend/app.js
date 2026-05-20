'use strict';

const API_BASE = '/api';
const ACTIVITY_TYPES = [
  { value: 'exposicion', label: 'Exposición' },
  { value: 'concierto', label: 'Concierto' },
  { value: 'cine', label: 'Cine' },
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
  dashboard: { title: 'Dashboard', subtitle: 'Resumen y operación del centro', render: renderDashboard },
  checkin: { title: 'Check-in', subtitle: 'Registra asistencias rápidamente', render: renderCheckin },
  users: { title: 'Usuarios', subtitle: 'Visitantes registrados con código CCB', render: renderUsers },
  activities: { title: 'Actividades', subtitle: 'Eventos culturales del centro', render: renderActivities },
  attendance: { title: 'Registros', subtitle: 'Asistencias de usuarios a actividades', render: renderAttendance },
  segments: { title: 'Segmentos', subtitle: 'Audiencias para campañas e invitaciones', render: renderSegments },
  reports: { title: 'Reportes', subtitle: 'Informes profesionales por período', render: () => window.renderReports && window.renderReports() },
  branding: { title: 'Identidad de marca', subtitle: 'Colores, logo y estilo del panel administrativo', render: () => window.renderBranding && window.renderBranding() },
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
  slugify(input) {
    if (!input) return '';
    return String(input)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  },
  relativeDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((today - target) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff > 1 && diff < 30) return `Hace ${diff} días`;
    if (diff >= 30 && diff < 60) return 'Hace ~1 mes';
    if (diff >= 60 && diff < 365) return `Hace ${Math.round(diff / 30)} meses`;
    if (diff >= 365) return `Hace ${Math.floor(diff / 365)} año${Math.floor(diff / 365) === 1 ? '' : 's'}`;
    if (diff < 0) return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
    return '—';
  },
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fallback abajo */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
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
    listInvitations: id => API.request(`/activities/${encodeURIComponent(id)}/invitations`),
    invite: (id, userIds) =>
      API.request(`/activities/${encodeURIComponent(id)}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      }),
    cancelInvitation: (activityId, invId) =>
      API.request(`/activities/${encodeURIComponent(activityId)}/invitations/${encodeURIComponent(invId)}`, {
        method: 'DELETE',
      }),
  },
  attendance: {
    list: () => API.request('/attendance'),
    create: data => API.request('/attendance', { method: 'POST', body: JSON.stringify(data) }),
    remove: id => API.request(`/attendance/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  dashboard: {
    stats: (period = '30d') => API.request(`/dashboard/stats?period=${encodeURIComponent(period)}`),
    checkinContext: () => API.request('/dashboard/checkin-context'),
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
      // Backdrop "protegido": clic en el fondo NO cierra cuando el modal
      // contiene un form (data entry). Reportado por staff en tablet: un
      // tap accidental fuera perdía los datos escritos. En su lugar se hace
      // un shake breve del card para feedback visual de "te oí, pero te
      // estoy protegiendo".
      const backdropClicked = e.target.classList && e.target.classList.contains('modal-backdrop');
      if (backdropClicked && this._formProtected) {
        const card = this.el.querySelector('.modal-card');
        if (card) {
          card.classList.remove('modal-card--shake');
          // forzar reflow para reiniciar animacion
          void card.offsetWidth;
          card.classList.add('modal-card--shake');
        }
        return;
      }
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
    // Modal con form -> proteger contra cierre por backdrop accidental.
    this._formProtected = !!form;
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
    this._formProtected = false;
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
  document.getElementById('sidebar-backdrop')?.classList.remove('is-visible');
}

// ============================================================
// View: Dashboard
// ============================================================
// ============================================================
// View: Dashboard (premium)
// ============================================================
const _dashboardState = { period: '30d', loading: false };

async function renderDashboard() {
  const root = document.getElementById('content');
  // Skeleton mientras carga
  root.innerHTML = dashboardSkeletonHtml();
  try {
    const stats = await API.dashboard.stats(_dashboardState.period);
    State.stats = stats;
    paintDashboard(stats);
  } catch (e) {
    root.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>No pudimos cargar el dashboard</h3><p>${Utils.escapeHtml(explainError(e))}</p></div>`;
  }
}

function dashboardSkeletonHtml() {
  return `
    <div class="dash">
      <div class="dash-greet skeleton-line" style="width:380px;height:24px"></div>
      <div class="dash-period-row">
        <div class="skeleton-line" style="width:280px;height:36px"></div>
      </div>
      <div class="dash-hero-grid">
        <div class="dash-kpi-hero skeleton-block"></div>
        <div class="dash-kpi-secondary-grid">
          <div class="dash-kpi skeleton-block"></div>
          <div class="dash-kpi skeleton-block"></div>
          <div class="dash-kpi skeleton-block"></div>
        </div>
      </div>
      <div class="dash-next skeleton-block" style="height:160px"></div>
      <div class="two-col">
        <div class="panel skeleton-block" style="height:320px"></div>
        <div class="panel skeleton-block" style="height:320px"></div>
      </div>
    </div>`;
}

function paintDashboard(stats) {
  const root = document.getElementById('content');
  const greeting = dashboardGreeting();
  const periodHtml = renderPeriodPicker(stats.period.key);
  const heroHtml = renderHeroKpi(stats.hero, stats.period);
  const secondaryHtml = renderSecondaryKpis(stats.secondary);
  const nextHtml = renderNextActivity(stats.nextActivity);
  const insightsHtml = renderInsights(stats.insights || []);
  const topHtml = renderTopActivities(stats.topActivities);
  const recentHtml = renderRecentUsers(stats.recentUsers);

  root.innerHTML = `
    <div class="dash">
      <header class="dash-greet">
        <div>
          <h2 class="dash-greet-title">${greeting.title}</h2>
          <p class="dash-greet-sub">${greeting.subtitle}</p>
        </div>
        <div class="dash-quick-actions">
          <a href="#/activities" class="btn btn--ghost btn--sm" data-action="dash-quick-new-activity">
            <i class="fa-solid fa-plus"></i> Nueva actividad
          </a>
          <a href="#/checkin" class="btn btn--ghost btn--sm">
            <i class="fa-solid fa-qrcode"></i> Check-in
          </a>
          <a href="#/reports" class="btn btn--primary btn--sm">
            <i class="fa-solid fa-chart-line"></i> Generar reporte
          </a>
        </div>
      </header>

      <div class="dash-period-row">${periodHtml}</div>

      ${insightsHtml}

      <div class="dash-hero-grid">
        ${heroHtml}
        <div class="dash-kpi-secondary-grid">${secondaryHtml}</div>
      </div>

      ${nextHtml}

      <div class="two-col">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Top actividades</h2>
              <p>Las 5 con más asistencias registradas</p>
            </div>
          </div>
          <div class="panel-body panel-body--flush"><div class="dash-top-list">${topHtml}</div></div>
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Últimos visitantes</h2>
              <p>Registrados recientemente</p>
            </div>
          </div>
          <div class="panel-body panel-body--flush">${recentHtml}</div>
        </div>
      </div>
    </div>`;

  // Bind period picker
  root.querySelectorAll('[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      _dashboardState.period = btn.dataset.period;
      renderDashboard();
    });
  });

  // Count-up de los KPI numbers (efecto premium)
  countUpAllNumbers(root);
}

function dashboardGreeting() {
  const now = new Date();
  const h = now.getHours();
  let salute = 'Buenas';
  if (h < 12) salute = 'Buenos días';
  else if (h < 19) salute = 'Buenas tardes';
  else salute = 'Buenas noches';
  const dateLabel = now.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
  const orgName = window.__tenant__?.name || 'tu centro';
  return {
    title: `${salute} 👋`,
    subtitle: `${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} · ${orgName}`,
  };
}

function renderPeriodPicker(active) {
  const opts = [
    { key: 'today', label: 'Hoy' },
    { key: '7d', label: '7 días' },
    { key: '30d', label: '30 días' },
    { key: '90d', label: '90 días' },
  ];
  return `
    <div class="period-picker">
      <span class="period-picker-label">Período</span>
      <div class="period-pills">
        ${opts.map(o => `
          <button type="button" class="period-pill ${o.key === active ? 'is-active' : ''}" data-period="${o.key}">
            ${o.label}
          </button>`).join('')}
      </div>
    </div>`;
}

function renderHeroKpi(hero, period) {
  const delta = hero.deltaPct ?? 0;
  const deltaCls = delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat';
  const deltaIcon = delta > 0 ? 'fa-arrow-trend-up' : delta < 0 ? 'fa-arrow-trend-down' : 'fa-minus';
  return `
    <div class="dash-kpi-hero">
      <div class="dash-kpi-head">
        <div>
          <div class="dash-kpi-label">${Utils.escapeHtml(hero.label)} · ${Utils.escapeHtml(period.label)}</div>
          <div class="dash-kpi-value dash-kpi-value--hero" data-count-target="${hero.value}">0</div>
        </div>
        <div class="dash-kpi-delta ${deltaCls}">
          <i class="fa-solid ${deltaIcon}"></i>
          ${delta > 0 ? '+' : ''}${delta}%
          <span class="dash-kpi-delta-vs">vs período anterior</span>
        </div>
      </div>
      <div class="dash-spark">${renderSparkline(hero.sparkline)}</div>
    </div>`;
}

function renderSparkline(points) {
  if (!points || points.length === 0) return '';
  const max = Math.max(1, ...points.map(p => p.value));
  const w = 600, h = 60, pad = 4;
  const stepX = (w - pad * 2) / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.value / max) * (h - pad * 2));
    return [x, y];
  });
  const line = coords.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const area = `${line} L${coords[coords.length - 1][0]},${h} L${coords[0][0]},${h} Z`;
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="dash-spark-svg" aria-hidden="true">
      <defs>
        <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-accent)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#sparkGradient)" />
      <path d="${line}" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

function renderSecondaryKpis(secondary) {
  return secondary.map(k => {
    const delta = k.deltaPct ?? 0;
    const deltaCls = delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat';
    const deltaIcon = delta > 0 ? 'fa-arrow-up' : delta < 0 ? 'fa-arrow-down' : 'fa-minus';
    const tooltipAttr = k.tooltip ? `data-tooltip="${Utils.escapeHtml(k.tooltip)}"` : '';
    return `
      <div class="dash-kpi" ${tooltipAttr}>
        <div class="dash-kpi-label">
          ${Utils.escapeHtml(k.label)}
          ${k.tooltip ? '<i class="fa-regular fa-circle-question dash-kpi-info"></i>' : ''}
        </div>
        <div class="dash-kpi-value" data-count-target="${k.value}">0</div>
        <div class="dash-kpi-row">
          <span class="dash-kpi-unit">${k.unit || ''}</span>
          <span class="dash-kpi-delta ${deltaCls}">
            <i class="fa-solid ${deltaIcon}"></i>
            ${delta > 0 ? '+' : ''}${delta}%
          </span>
        </div>
      </div>`;
  }).join('');
}

function renderNextActivity(next) {
  if (!next) {
    return `
      <div class="dash-next dash-next--empty">
        <i class="fa-solid fa-calendar-plus"></i>
        <div>
          <h3>No hay próxima actividad programada</h3>
          <p>Crea una para empezar a recibir inscripciones.</p>
        </div>
        <a href="#/activities" class="btn btn--accent btn--sm">
          <i class="fa-solid fa-plus"></i> Nueva actividad
        </a>
      </div>`;
  }
  const ms = next.countdownMs;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const countdownLabel = days >= 1
    ? `${days} día${days !== 1 ? 's' : ''}${hours > 0 ? ` ${hours}h` : ''}`
    : hours >= 1
      ? `${hours}h ${minutes}m`
      : `${minutes} min`;
  const occ = next.capacity > 0 ? Math.round((next.enrolledCount / next.capacity) * 100) : 0;
  const nearFull = occ >= 80;
  return `
    <div class="dash-next">
      <div class="dash-next-media">
        ${next.imageUrl
          ? `<img src="${Utils.escapeHtml(next.imageUrl)}" alt="" />`
          : `<div class="dash-next-media-placeholder"><i class="fa-solid ${dashTypeIcon(next.type)}"></i></div>`}
      </div>
      <div class="dash-next-info">
        <div class="dash-next-eyebrow">
          <i class="fa-solid fa-hourglass-half"></i>
          PRÓXIMA · empieza en ${countdownLabel}
        </div>
        <h3 class="dash-next-name">${Utils.escapeHtml(next.name)}</h3>
        <div class="dash-next-meta">
          <span><i class="fa-solid fa-calendar"></i> ${Utils.escapeHtml(Utils.formatDate(next.date))}</span>
          <span><i class="fa-solid fa-location-dot"></i> ${Utils.escapeHtml(next.location)}</span>
          <span class="badge badge--type-${Utils.escapeHtml(next.type)}">${Utils.escapeHtml(Utils.activityTypeLabel(next.type))}</span>
        </div>
        <div class="dash-next-progress">
          <div class="progress-track"><div class="progress-bar ${nearFull ? 'progress-bar--hot' : ''}" style="width:${occ}%"></div></div>
          <div class="progress-meta">
            <span>${next.enrolledCount} / ${next.capacity} inscritos</span>
            <span>${occ}%</span>
          </div>
        </div>
      </div>
      <div class="dash-next-actions">
        <a href="#/activities" class="btn btn--primary btn--sm" data-action="activity-detail" data-id="${Utils.escapeHtml(next.id)}">
          <i class="fa-solid fa-eye"></i> Ver detalle
        </a>
        <a href="#/activities" class="btn btn--ghost btn--sm" data-action="activity-invite" data-id="${Utils.escapeHtml(next.id)}">
          <i class="fa-solid fa-envelope"></i> Invitar
        </a>
        <a href="/api/reports/activity/${Utils.escapeHtml(next.id)}.pdf" class="btn btn--ghost btn--sm" target="_blank">
          <i class="fa-solid fa-file-pdf"></i> Reporte
        </a>
      </div>
    </div>`;
}

function renderInsights(insights) {
  if (!insights || insights.length === 0) return '';
  return `
    <div class="dash-insights">
      ${insights.map(ins => `
        <div class="dash-insight dash-insight--${Utils.escapeHtml(ins.severity || 'info')}">
          <i class="fa-solid ${ins.severity === 'warning' ? 'fa-triangle-exclamation' : 'fa-lightbulb'}"></i>
          <div class="dash-insight-body">
            <strong>${Utils.escapeHtml(ins.title)}</strong>
            <span>${Utils.escapeHtml(ins.message)}</span>
          </div>
          ${ins.action ? `<a href="${Utils.escapeHtml(ins.action.href)}" class="btn btn--ghost btn--sm">${Utils.escapeHtml(ins.action.label)} →</a>` : ''}
        </div>`).join('')}
    </div>`;
}

function renderTopActivities(tops) {
  if (!tops || tops.length === 0) {
    return `<div class="empty"><i class="fa-solid fa-calendar-xmark"></i><h3>Sin actividades</h3><p>Crea una para empezar.</p></div>`;
  }
  return tops.map((a, i) => {
    const occ = a.capacity ? Math.round((a.enrolledCount / a.capacity) * 100) : 0;
    const statusCls = a.status === 'activa' ? 'is-active'
      : a.status === 'finalizada' ? 'is-finalized'
      : a.status === 'cancelada' ? 'is-cancelled' : '';
    return `
      <div class="dash-top-item ${statusCls}" data-action="activity-detail" data-id="${Utils.escapeHtml(a.id)}">
        <div class="dash-top-rank">${i + 1}</div>
        <div class="dash-top-thumb">
          ${a.imageUrl
            ? `<img src="${Utils.escapeHtml(a.imageUrl)}" alt="" />`
            : `<i class="fa-solid ${dashTypeIcon(a.type)}"></i>`}
        </div>
        <div class="dash-top-info">
          <div class="dash-top-name">${Utils.escapeHtml(a.name)}</div>
          <div class="dash-top-meta">
            <span class="badge badge--type-${Utils.escapeHtml(a.type)}">${Utils.escapeHtml(Utils.activityTypeLabel(a.type))}</span>
            <span class="cell-muted">${Utils.escapeHtml(a.location)}</span>
          </div>
        </div>
        <div class="dash-top-progress">
          <div class="progress-track"><div class="progress-bar" style="width:${occ}%"></div></div>
          <div class="progress-meta"><span>${a.enrolledCount}/${a.capacity}</span><span>${occ}%</span></div>
        </div>
      </div>`;
  }).join('');
}

function renderRecentUsers(users) {
  if (!users || users.length === 0) {
    return `<div class="empty"><i class="fa-solid fa-user-slash"></i><h3>Sin usuarios</h3><p>Registra al primer visitante.</p></div>`;
  }
  return `
    <div class="dash-recent-list">
      ${users.map(u => {
        const initials = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase() || '?';
        const isNew = (u.visitCount || 0) <= 1;
        const isVip = (u.visitCount || 0) >= 10;
        const tag = isVip
          ? `<span class="dash-recent-tag dash-recent-tag--vip">VIP</span>`
          : isNew
            ? `<span class="dash-recent-tag dash-recent-tag--new">Primera vez</span>`
            : `<span class="dash-recent-tag dash-recent-tag--reg">${u.visitCount} visitas</span>`;
        return `
          <div class="dash-recent-item" data-action="user-detail" data-code="${Utils.escapeHtml(u.code)}">
            <div class="dash-recent-avatar">${Utils.escapeHtml(initials)}</div>
            <div class="dash-recent-info">
              <div class="dash-recent-name">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</div>
              <div class="dash-recent-meta">
                <span class="user-code">${Utils.escapeHtml(u.code)}</span>
                ${u.email ? `<span class="cell-muted">${Utils.escapeHtml(u.email)}</span>` : ''}
              </div>
            </div>
            ${tag}
          </div>`;
      }).join('')}
    </div>`;
}

function dashTypeIcon(t) {
  return ({
    concierto: 'fa-music',
    cine: 'fa-film',
    taller: 'fa-screwdriver-wrench',
    exposicion: 'fa-image',
    teatro: 'fa-masks-theater',
    conferencia: 'fa-microphone',
  })[t] || 'fa-calendar-day';
}

// Count-up animado de los números KPI (efecto premium)
function countUpAllNumbers(root) {
  root.querySelectorAll('[data-count-target]').forEach(el => {
    const target = Number(el.dataset.countTarget) || 0;
    const duration = 700;
    const start = performance.now();
    const from = 0;
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (target - from) * eased);
      el.textContent = v.toLocaleString('es-DO');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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
    cine: 'fa-film',
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
                    : `<div class="activity-thumb activity-thumb--placeholder"><i class="fa-solid ${{exposicion:'fa-image',concierto:'fa-music',cine:'fa-film',taller:'fa-screwdriver-wrench',teatro:'fa-masks-theater',conferencia:'fa-microphone'}[a.type] || 'fa-calendar-day'}"></i></div>`}
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
                  <button class="icon-btn" data-action="activity-report-pdf" data-id="${Utils.escapeHtml(a.id)}" title="Descargar informe PDF"><i class="fa-solid fa-file-pdf"></i></button>
                  <button class="icon-btn" data-action="activity-report-xlsx" data-id="${Utils.escapeHtml(a.id)}" title="Descargar informe Excel"><i class="fa-solid fa-file-excel"></i></button>
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
      <div class="form-group">
        <label>Ciclo o categoría <span class="form-hint" style="font-weight:400">(opcional)</span></label>
        <input type="text" name="category" list="activity-categories-list" maxlength="60"
               value="${Utils.escapeHtml(activity?.category || '')}"
               placeholder="Ej: 5to ciclo cine dominicano, cine clásico, jazz, patrimonio…" />
        <datalist id="activity-categories-list">
          ${[...new Set((State.activities || []).map(a => a.category).filter(Boolean))]
            .sort()
            .map(c => `<option value="${Utils.escapeHtml(c)}"></option>`)
            .join('')}
        </datalist>
        <div class="form-hint">Agrupa actividades del mismo ciclo o tema. Te ayuda a segmentar la audiencia y a etiquetar la página pública.</div>
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
  const rawCategory = (fd.get('category') || '').trim();
  data.category = rawCategory === '' ? null : rawCategory;
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
        .map(s => {
          const typeLbl = Utils.activityTypeLabel(type).toLowerCase();
          const locShort = location && location.length > 20 ? location.slice(0, 18) + '…' : location;
          return `
        <div class="suggestion-row">
          <span class="user-code">${Utils.escapeHtml(s.user.code)}</span>
          <div class="suggestion-info">
            <div class="suggestion-name-row">
              <div class="cell-strong suggestion-name" title="${Utils.escapeHtml(s.user.firstName + ' ' + s.user.lastName)}">${Utils.escapeHtml(s.user.firstName + ' ' + s.user.lastName)}</div>
              <span class="suggestion-score" title="Puntuación de afinidad">${s.score}</span>
            </div>
            <div class="cell-muted suggestion-contact" title="${Utils.escapeHtml(s.user.email || s.user.phone || '')}">${Utils.escapeHtml(s.user.email || s.user.phone || '—')}</div>
            <div class="suggestion-badges">
              <span class="badge badge--info" title="${s.affinity.typeMatches} asistencias a ${typeLbl}"><i class="fa-solid fa-check"></i> ${s.affinity.typeMatches} ${Utils.escapeHtml(typeLbl)}</span>
              ${s.affinity.locationMatches > 0
                ? `<span class="badge badge--neutral" title="${s.affinity.locationMatches} asistencias en ${Utils.escapeHtml(location)}"><i class="fa-solid fa-location-dot"></i> ${s.affinity.locationMatches} en ${Utils.escapeHtml(locShort)}</span>`
                : ''}
            </div>
          </div>
        </div>`;
        })
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
  let data, summary, invitations;
  try {
    [data, summary, invitations] = await Promise.all([
      API.request(`/activities/${encodeURIComponent(id)}/attendees`),
      API.insights.activitySummary(id).catch(() => null),
      API.activities.listInvitations(id).catch(() => ({ counts: { pending: 0, confirmed: 0, declined: 0 }, total: 0 })),
    ]);
  } catch (e) {
    Toast.error(explainError(e));
    return;
  }
  _activityDetailCache.id = id;
  _activityDetailCache.data = data;
  _activityDetailCache.summary = summary;
  _activityDetailCache.invitations = invitations;
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

  const attendeeSearchKey = a => `${a.code} ${a.firstName} ${a.lastName} ${a.email || ''} ${a.phone || ''}`
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const attendeesTable = !attendees.length
    ? `<div class="empty">
         <i class="fa-solid fa-user-slash"></i>
         <h3>Aún no hay asistentes</h3>
         <p>Cuando se registren visitantes, aparecerán aquí.</p>
       </div>`
    : `<div class="attendees-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="attendees-search-input" placeholder="Buscar por nombre, código, email o teléfono…" autocomplete="off" />
        <span class="attendees-search-count" id="attendees-search-count">${attendees.length} de ${attendees.length}</span>
      </div>
      <div class="table-wrapper" style="max-height:340px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md)">
        <table class="table" id="attendees-table">
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
              <tr data-attendee-search="${Utils.escapeHtml(attendeeSearchKey(a))}">
                <td><span class="user-code">${Utils.escapeHtml(a.code)}</span></td>
                <td class="cell-strong">${Utils.escapeHtml(a.firstName + ' ' + a.lastName)}</td>
                <td class="cell-muted">${Utils.escapeHtml(a.email || a.phone || '—')}</td>
                <td class="cell-muted">${Utils.formatDate(a.registeredAt)}</td>
                <td>
                  <button class="icon-btn icon-btn--danger" data-action="activity-attendance-remove" data-attendance-id="${Utils.escapeHtml(a.attendanceId)}" data-activity-id="${Utils.escapeHtml(activity.id)}" title="Eliminar registro"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>`).join('')}
            <tr class="attendees-empty-state hidden" id="attendees-empty-row">
              <td colspan="5" class="empty-inline"><i class="fa-solid fa-magnifying-glass"></i> Sin resultados para tu búsqueda</td>
            </tr>
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
            ${activity.category ? `<span class="badge" style="background:var(--color-primary-100);color:var(--color-primary-800);border:1px solid var(--color-primary-200);"><i class="fa-solid fa-bookmark"></i> ${Utils.escapeHtml(activity.category)}</span>` : ''}
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

      ${activity.status === 'activa' ? renderActivityShareSection(activity) : ''}

      ${_activityDetailCache.summary && (activity.status === 'finalizada' || activity.enrolledCount > 0)
        ? renderActivitySummary(_activityDetailCache.summary)
        : ''}

      ${renderInvitationsSection(activity, _activityDetailCache.invitations)}

      <div class="activity-detail-section">
        <div class="activity-detail-section-header">
          <h4>Asistentes <span class="muted-count">(${total})</span></h4>
          <div class="activity-detail-section-actions">
            ${activity.status !== 'cancelada' ? `
              <button class="btn btn--accent btn--sm" data-action="activity-attendee-add" data-id="${Utils.escapeHtml(activity.id)}">
                <i class="fa-solid fa-user-plus"></i> Agregar asistente
              </button>` : ''}
            ${total > 0 ? `
              <button class="btn btn--ghost btn--sm" data-action="activity-attendees-export" data-id="${Utils.escapeHtml(activity.id)}">
                <i class="fa-solid fa-file-export"></i> Exportar
              </button>
              <button class="btn btn--ghost btn--sm" data-action="activity-attendees-print" data-id="${Utils.escapeHtml(activity.id)}">
                <i class="fa-solid fa-print"></i> Imprimir
              </button>` : ''}
          </div>
        </div>
        <div id="attendee-picker-panel" class="attendee-picker hidden"></div>
        ${attendeesTable}
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cerrar</button>
        ${activity.status === 'activa' ? `
          <button type="button" class="btn btn--accent" data-action="activity-invite" data-id="${Utils.escapeHtml(activity.id)}">
            <i class="fa-solid fa-envelope"></i> Invitar usuarios
          </button>` : ''}
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
  bindAttendeesSearch(attendees.length);
}

function renderActivityShareSection(activity) {
  const slug = Utils.slugify(activity.name);
  if (!slug) return '';
  const url = `${window.location.origin}/eventos/${slug}`;
  const waText = `Te invitamos a *${activity.name}* en ${activity.location} — ${url}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;
  const twHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(activity.name)}&url=${encodeURIComponent(url)}`;
  return `
    <div class="activity-detail-section">
      <div class="activity-detail-section-header">
        <h4><i class="fa-solid fa-share-nodes"></i> Compartir esta actividad</h4>
      </div>
      <p class="form-hint" style="margin:0 0 10px">
        Página pública para compartir en WhatsApp y redes. Visitantes pueden reservar su cupo desde el link y recibir su credencial por correo.
      </p>
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--color-surface-muted,#f4f6fa);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:10px;">
        <i class="fa-solid fa-link" style="color:var(--color-text-muted);font-size:13px"></i>
        <input id="activity-share-url" type="text" readonly value="${Utils.escapeHtml(url)}"
               style="flex:1;border:0;background:transparent;font-family:Menlo,Monaco,monospace;font-size:13px;color:var(--color-text);outline:none;text-overflow:ellipsis"
               onclick="this.select()" />
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button type="button" class="btn btn--primary btn--sm" data-action="activity-share-copy" data-share-url="${Utils.escapeHtml(url)}">
          <i class="fa-regular fa-copy"></i> Copiar enlace
        </button>
        <a class="btn btn--sm" href="${Utils.escapeHtml(waHref)}" target="_blank" rel="noopener" style="background:#25d366;color:#fff;border-color:#25d366">
          <i class="fa-brands fa-whatsapp"></i> WhatsApp
        </a>
        <a class="btn btn--ghost btn--sm" href="${Utils.escapeHtml(twHref)}" target="_blank" rel="noopener">
          <i class="fa-brands fa-x-twitter"></i> X / Twitter
        </a>
        <a class="btn btn--ghost btn--sm" href="${Utils.escapeHtml(url)}" target="_blank" rel="noopener">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir
        </a>
      </div>
    </div>`;
}

function renderInvitationsSection(activity, invitations) {
  if (!invitations) return '';
  const c = invitations.counts || { pending: 0, confirmed: 0, declined: 0, canceled: 0 };
  if (invitations.total === 0) {
    if (activity.status !== 'activa') return '';
    return `
      <div class="activity-detail-section">
        <div class="activity-detail-section-header">
          <h4>Invitaciones</h4>
        </div>
        <div class="form-hint" style="text-align:center;padding:16px;border:1px dashed var(--color-border);border-radius:var(--radius-md)">
          Sin invitaciones enviadas. Usa el botón "Invitar usuarios" abajo para enviar invitaciones con RSVP.
        </div>
      </div>`;
  }
  const rows = invitations.invitations.map(inv => {
    const u = inv.user || {};
    const name = u.firstName ? `${u.firstName} ${u.lastName || ''}` : '—';
    const statusBadge = {
      pending: '<span class="badge badge--neutral">Pendiente</span>',
      confirmed: '<span class="badge badge--success">Confirmada</span>',
      declined: '<span class="badge badge--warning">Declinada</span>',
      canceled: '<span class="badge badge--danger">Cancelada</span>',
      expired: '<span class="badge badge--neutral">Expirada</span>',
    }[inv.status] || '';
    return `
      <tr>
        <td><span class="user-code">${Utils.escapeHtml(u.code || '—')}</span></td>
        <td class="cell-strong">${Utils.escapeHtml(name)}</td>
        <td class="cell-muted">${Utils.escapeHtml(u.email || '—')}</td>
        <td>${statusBadge}</td>
        <td class="cell-muted">${inv.respondedAt ? Utils.formatDate(inv.respondedAt) : (inv.sentAt ? 'Enviada ' + Utils.formatDate(inv.sentAt, false) : '—')}</td>
      </tr>`;
  }).join('');
  return `
    <div class="activity-detail-section">
      <div class="activity-detail-section-header">
        <h4>Invitaciones <span class="muted-count">(${invitations.total})</span></h4>
      </div>
      <div class="summary-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">
        <div class="summary-card"><div class="summary-card-label">Pendientes</div><div class="summary-card-value" style="color:var(--color-text-muted)">${c.pending}</div></div>
        <div class="summary-card"><div class="summary-card-label">Confirmadas</div><div class="summary-card-value" style="color:var(--color-success)">${c.confirmed}</div></div>
        <div class="summary-card"><div class="summary-card-label">Declinadas</div><div class="summary-card-value" style="color:var(--color-warning)">${c.declined}</div></div>
        <div class="summary-card"><div class="summary-card-label">Aceptación</div><div class="summary-card-value">${invitations.total ? Math.round((c.confirmed / invitations.total) * 100) : 0}%</div></div>
      </div>
      <div class="table-wrapper" style="max-height:240px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md)">
        <table class="table">
          <thead><tr><th>Código</th><th>Nombre</th><th>Email</th><th>Estado</th><th>Respondida</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

async function handleActivityShareCopy(target) {
  const url = target?.dataset?.shareUrl;
  if (!url) return;
  const ok = await Utils.copyToClipboard(url);
  if (ok) {
    Toast.success('Enlace copiado');
    const original = target.innerHTML;
    target.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
    setTimeout(() => { target.innerHTML = original; }, 1500);
  } else {
    Toast.error('No fue posible copiar — selecciona el enlace y cópialo manualmente');
  }
}

async function handleActivityInvite(activityId) {
  const activity = _activityDetailCache.data?.activity || State.activities.find(a => a.id === activityId);
  if (!activity) return;
  // Cargar usuarios si no están cacheados
  if (!State.users || State.users.length === 0) {
    try {
      const r = await API.users.list();
      State.users = r.users;
    } catch (e) {
      Toast.error(explainError(e));
      return;
    }
  }
  // Filtrar: solo usuarios con email + que no estén ya invitados/inscritos
  const invitedIds = new Set((_activityDetailCache.invitations?.invitations || []).map(i => i.user?.code).filter(Boolean));
  const enrolledIds = new Set((_activityDetailCache.data?.attendees || []).map(a => a.code));
  const candidates = State.users.filter(
    u => u.email && !invitedIds.has(u.code) && !enrolledIds.has(u.code),
  );

  const listHtml = candidates.length
    ? candidates.map(u => `
        <label class="invite-row">
          <input type="checkbox" name="userId" value="${Utils.escapeHtml(u.id)}" />
          <div class="invite-row-info">
            <div class="cell-strong">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</div>
            <div class="cell-muted">${Utils.escapeHtml(u.email)} · ${Utils.escapeHtml(u.code)}</div>
          </div>
          <span class="badge badge--info">${u.visitCount}v</span>
        </label>
      `).join('')
    : '<div class="empty"><i class="fa-solid fa-user-slash"></i><h3>Sin candidatos</h3><p>Todos los usuarios con email ya están invitados o inscritos.</p></div>';

  const body = `
    <form class="form">
      <div class="form-hint">
        Selecciona los usuarios a invitar a <strong>${Utils.escapeHtml(activity.name)}</strong>.<br>
        Se enviará un email con botones Sí/No. Quien confirme reservará una plaza automáticamente.
      </div>
      <div class="form-group">
        <div class="search-input">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="invite-search" placeholder="Filtrar por nombre o email…" />
        </div>
      </div>
      <div class="invite-list" id="invite-list" style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px">
        ${listHtml}
      </div>
      <div class="form-hint" id="invite-count">0 seleccionados</div>
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn--accent" id="invite-submit" disabled>
          <i class="fa-solid fa-envelope"></i> Enviar invitaciones
        </button>
      </div>
    </form>`;
  Modal.open(`Invitar a "${activity.name}"`, body, async form => {
    const userIds = Array.from(form.querySelectorAll('input[name="userId"]:checked')).map(i => i.value);
    if (userIds.length === 0) return;
    const submitBtn = document.getElementById('invite-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';
    try {
      const result = await API.activities.invite(activityId, userIds);
      Modal.close();
      Toast.success(`${result.summary.emailsSent} invitación(es) enviada(s)`);
      if (result.summary.emailsSkipped > 0) {
        Toast.warning(`${result.summary.emailsSkipped} sin email (saltadas)`);
      }
      // Refresh detalle
      handleActivityDetail(activityId);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-envelope"></i> Enviar invitaciones';
      Toast.error(explainError(e));
    }
  });

  // Wire up: filter + count
  const list = document.getElementById('invite-list');
  const search = document.getElementById('invite-search');
  const count = document.getElementById('invite-count');
  const submit = document.getElementById('invite-submit');
  const updateCount = () => {
    const n = list.querySelectorAll('input[name="userId"]:checked').length;
    count.textContent = `${n} seleccionado(s)`;
    submit.disabled = n === 0;
  };
  list?.addEventListener('change', updateCount);
  search?.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    list.querySelectorAll('.invite-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? 'flex' : 'none';
    });
  });
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
// Picker para registrar asistencia retroactiva
// ============================================================
const _attendeePicker = { activityId: null, users: null, query: '' };

async function openAttendeePicker(activityId) {
  const panel = document.getElementById('attendee-picker-panel');
  if (!panel) return;
  _attendeePicker.activityId = activityId;
  _attendeePicker.query = '';
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="attendee-picker-head">
      <i class="fa-solid fa-user-plus"></i>
      <strong>Agregar asistente</strong>
      <span class="muted-count">— escribe para buscar entre usuarios registrados</span>
      <button class="icon-btn" data-action="attendee-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="attendees-search attendee-picker-search">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="text" id="attendee-picker-input" placeholder="Nombre, código o email…" autocomplete="off" />
    </div>
    <div class="attendee-picker-list" id="attendee-picker-list">
      <div class="loader-small"><div class="spinner"></div></div>
    </div>
  `;
  // Lazy fetch lista de usuarios si no la tenemos.
  try {
    if (!_attendeePicker.users) {
      const { users } = await API.users.list();
      _attendeePicker.users = users;
    }
    renderAttendeePickerList();
  } catch (e) {
    document.getElementById('attendee-picker-list').innerHTML = `
      <div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>No pudimos cargar la lista de usuarios</h3></div>`;
  }
  const input = document.getElementById('attendee-picker-input');
  if (input) {
    input.focus();
    input.addEventListener('input', e => {
      _attendeePicker.query = e.target.value;
      renderAttendeePickerList();
    });
  }
}

function closeAttendeePicker() {
  const panel = document.getElementById('attendee-picker-panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }
}

function renderAttendeePickerList() {
  const list = document.getElementById('attendee-picker-list');
  if (!list) return;
  const cached = _activityDetailCache.data;
  const attendedCodes = new Set((cached?.attendees || []).map(a => a.code));
  const allUsers = _attendeePicker.users || [];
  const candidates = allUsers.filter(u => !attendedCodes.has(u.code));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(_attendeePicker.query.trim());
  const filtered = q
    ? candidates.filter(u => norm(`${u.code} ${u.firstName} ${u.lastName} ${u.email || ''} ${u.phone || ''}`).includes(q))
    : candidates;
  // Orden: más recientemente creados primero (típicamente quien staff busca)
  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const showing = filtered.slice(0, 20);

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-inline">
        <i class="fa-solid fa-magnifying-glass"></i>
        ${q ? 'Sin coincidencias para tu búsqueda.' : 'Todos los usuarios ya están en esta actividad.'}
      </div>`;
    return;
  }
  list.innerHTML = `
    <div class="attendee-picker-meta">
      Mostrando ${showing.length} de ${filtered.length} candidatos
    </div>
    ${showing.map(u => {
      const isFirstTime = (u.visitCount || 0) <= 1;
      const tag = isFirstTime
        ? `<span class="tag tag--new">Primera vez</span>`
        : `<span class="tag tag--reg">${u.visitCount} visitas</span>`;
      return `
        <div class="attendee-picker-row">
          <div class="attendee-picker-row-avatar"><i class="fa-solid fa-user"></i></div>
          <div class="attendee-picker-row-info">
            <div class="attendee-picker-row-name">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</div>
            <div class="attendee-picker-row-meta">
              <span class="user-code">${Utils.escapeHtml(u.code)}</span>
              ${u.email ? `· ${Utils.escapeHtml(u.email)}` : ''}
              ${tag}
            </div>
          </div>
          <button class="btn btn--primary btn--sm" data-action="attendee-picker-assign"
                  data-code="${Utils.escapeHtml(u.code)}" data-id="${Utils.escapeHtml(_attendeePicker.activityId)}">
            <i class="fa-solid fa-plus"></i> Agregar
          </button>
        </div>`;
    }).join('')}
  `;
}

async function assignAttendeeToActivity(userCode, activityId, btn) {
  if (!userCode || !activityId) return;
  const orig = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Agregando…';
  }
  const activity = _activityDetailCache.data?.activity;
  const isRetro = activity && activity.status !== 'activa';
  try {
    await API.request('/attendance', {
      method: 'POST',
      body: JSON.stringify({ userCode, activityId, retroactive: isRetro || undefined }),
    });
    Toast.success(isRetro
      ? `${userCode} agregado (asistencia retroactiva)`
      : `${userCode} agregado a la actividad`);
    // Refresca el modal completo: nueva attendance + sumario + contador.
    closeAttendeePicker();
    _attendeePicker.users = null; // invalidar caché de usuarios (visitCount cambió)
    await handleActivityDetail(activityId);
  } catch (e) {
    Toast.error(explainError(e));
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
}

function bindAttendeesSearch(total) {
  const input = document.getElementById('attendees-search-input');
  if (!input) return;
  const countEl = document.getElementById('attendees-search-count');
  const emptyRow = document.getElementById('attendees-empty-row');
  const rows = [...document.querySelectorAll('#attendees-table tbody tr[data-attendee-search]')];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filter = () => {
    const q = norm(input.value.trim());
    let visible = 0;
    for (const r of rows) {
      const match = !q || r.dataset.attendeeSearch.includes(q);
      r.classList.toggle('hidden', !match);
      if (match) visible += 1;
    }
    countEl.textContent = q ? `${visible} de ${total}` : `${total} de ${total}`;
    emptyRow.classList.toggle('hidden', visible !== 0);
  };
  input.addEventListener('input', filter);
  input.focus();
}

async function handleActivityReport(id, btn, format) {
  const originalHtml = btn?.innerHTML;
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    const res = await fetch(`/api/reports/activity/${encodeURIComponent(id)}.${ext}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^"]+)"?/i.exec(cd);
    const filename = match ? match[1] : `Informe_actividad_${id}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    Toast.success(`Informe ${ext.toUpperCase()} generado`);
  } catch (e) {
    Toast.error(e.message || 'No se pudo generar el informe');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
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
const _segState = { onlyWithMembers: false, lastData: null };

async function renderSegments() {
  const root = document.getElementById('content');
  root.innerHTML = `
    <div class="segments-toolbar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div class="form-hint" id="segments-summary" style="margin:0">Cargando segmentos…</div>
      <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:13px;color:var(--color-text-muted)">
        <input type="checkbox" id="segments-only-active" ${_segState.onlyWithMembers ? 'checked' : ''} />
        Mostrar solo con miembros
      </label>
    </div>
    <div id="segments-grid-host"><div class="segments-grid"><div class="skeleton-block" style="height:120px"></div><div class="skeleton-block" style="height:120px"></div><div class="skeleton-block" style="height:120px"></div></div></div>`;

  try {
    const { segments } = await API.insights.segments();
    _segState.lastData = segments;
    paintSegmentsGrid();
  } catch (e) {
    document.getElementById('segments-grid-host').innerHTML =
      `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>No pudimos cargar los segmentos</h3><p>${Utils.escapeHtml(explainError(e))}</p></div>`;
  }

  const toggle = document.getElementById('segments-only-active');
  if (toggle) {
    toggle.addEventListener('change', e => {
      _segState.onlyWithMembers = e.target.checked;
      paintSegmentsGrid();
    });
  }
}

function paintSegmentsGrid() {
  const segments = _segState.lastData || [];
  const visible = _segState.onlyWithMembers ? segments.filter(s => s.count > 0) : segments;
  const totalPeople = segments.reduce((sum, s) => sum + (s.count || 0), 0);
  const withMembers = segments.filter(s => s.count > 0).length;

  const summary = document.getElementById('segments-summary');
  if (summary) {
    summary.textContent = `${withMembers} de ${segments.length} segmentos con miembros · ${totalPeople} apariciones totales (un mismo usuario puede contar en varios segmentos).`;
  }

  const host = document.getElementById('segments-grid-host');
  if (!host) return;

  if (visible.length === 0) {
    host.innerHTML = `<div class="empty"><i class="fa-solid fa-layer-group"></i><h3>No hay segmentos con miembros</h3><p>A medida que se acumulen asistencias y registros, los segmentos se irán poblando.</p></div>`;
    return;
  }

  host.innerHTML = `
    <div class="segments-grid">
      ${visible.map(s => {
        const empty = !s.count;
        return `
        <button class="segment-card" data-action="segment-open" data-id="${Utils.escapeHtml(s.id)}" data-empty="${empty ? 'true' : 'false'}"
                style="${empty ? 'opacity:0.5' : ''}">
          <div class="segment-icon segment-icon--${Utils.escapeHtml(s.color)}">
            <i class="fa-solid ${Utils.escapeHtml(s.icon)}"></i>
          </div>
          <div class="segment-info">
            <div class="segment-label">${Utils.escapeHtml(s.label)}</div>
            <div class="segment-desc">${Utils.escapeHtml(s.description)}</div>
          </div>
          <div class="segment-count">
            <span>${s.count}</span>
            <small>persona${s.count === 1 ? '' : 's'}</small>
          </div>
        </button>`;
      }).join('')}
    </div>`;
}

const _segDetailCache = { id: null, data: null, meta: null };

async function handleSegmentOpen(id) {
  let data;
  try {
    data = await API.insights.segment(id);
  } catch (e) {
    Toast.error(explainError(e));
    return;
  }
  const meta = (_segState.lastData || []).find(s => s.id === id)
    || { label: id, description: '', icon: 'fa-layer-group', color: 'blue' };
  _segDetailCache.id = id;
  _segDetailCache.data = data;
  _segDetailCache.meta = meta;

  // Asegura que las actividades activas estén disponibles para el picker de invitación
  if (!State.activities || State.activities.length === 0) {
    try {
      const r = await API.activities.list();
      State.activities = r.activities;
    } catch { /* el picker reportará si no hay actividades */ }
  }

  Modal.open(meta.label, renderSegmentDetailBody(), null);
  bindSegmentDetailHandlers();
}

function renderSegmentDetailBody() {
  const { data, meta, id } = _segDetailCache;
  const STATUS_BADGE = {
    activo: '<span class="badge badge--success">Activo</span>',
    regular: '<span class="badge badge--info">Regular</span>',
    dormido: '<span class="badge badge--warning">Dormido</span>',
    nuevo: '<span class="badge badge--neutral">Nuevo</span>',
  };

  const withEmail = data.users.filter(u => u.email).length;
  const activeActivities = (State.activities || []).filter(a => a.status === 'activa');
  const canInvite = data.total > 0 && withEmail > 0 && activeActivities.length > 0;

  const searchKey = u => `${u.code} ${u.firstName} ${u.lastName} ${u.email || ''} ${u.phone || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const tableHtml = data.total === 0
    ? `<div class="empty"><i class="fa-solid fa-user-slash"></i><h3>Sin usuarios en este segmento</h3><p>A medida que se acumulen asistencias aparecerán aquí.</p></div>`
    : `
      <div class="attendees-search" style="margin-bottom:10px">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="segment-search-input" placeholder="Buscar por nombre, código, email o teléfono…" autocomplete="off" />
        <span class="attendees-search-count" id="segment-search-count">${data.total} de ${data.total}</span>
      </div>
      <div class="table-wrapper" style="max-height:380px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md)">
        <table class="table" id="segment-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Asistencias</th>
              <th>Última visita</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${data.users.map(u => `
              <tr data-segment-row="${Utils.escapeHtml(searchKey(u))}">
                <td><span class="user-code">${Utils.escapeHtml(u.code)}</span></td>
                <td class="cell-strong">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</td>
                <td class="cell-muted" title="${Utils.escapeHtml(u.phone || '')}">${u.email ? Utils.escapeHtml(u.email) : '<span class="badge badge--warning badge--xs">Sin email</span>'}</td>
                <td><span class="badge badge--info">${u.totalAttendances}</span></td>
                <td class="cell-muted">${Utils.relativeDate(u.lastAttendanceAt)}</td>
                <td>${STATUS_BADGE[u.status] || ''}</td>
              </tr>`).join('')}
            <tr id="segment-empty-row" class="hidden">
              <td colspan="6" class="empty-inline"><i class="fa-solid fa-magnifying-glass"></i> Sin resultados</td>
            </tr>
          </tbody>
        </table>
      </div>`;

  return `
    <div class="segment-detail">
      <div class="segment-detail-header">
        <div class="segment-icon segment-icon--${Utils.escapeHtml(meta.color)}">
          <i class="fa-solid ${Utils.escapeHtml(meta.icon)}"></i>
        </div>
        <div>
          <h3>${Utils.escapeHtml(meta.label)}</h3>
          <p class="form-hint">${Utils.escapeHtml(meta.description)} · ${data.total} persona${data.total === 1 ? '' : 's'}${data.total > 0 ? ` · ${withEmail} con correo` : ''}</p>
        </div>
      </div>

      ${tableHtml}

      <div id="segment-invite-panel"></div>

      <div class="form-actions">
        <button type="button" class="btn btn--ghost" data-close>Cerrar</button>
        ${data.total > 0
          ? `<button type="button" class="btn btn--ghost" data-action="segment-export" data-id="${Utils.escapeHtml(id)}">
              <i class="fa-solid fa-file-export"></i> Exportar a Excel
            </button>`
          : ''}
        ${canInvite
          ? `<button type="button" class="btn btn--primary" id="segment-invite-open">
              <i class="fa-solid fa-paper-plane"></i> Invitar a una actividad
            </button>`
          : ''}
      </div>
    </div>`;
}

function bindSegmentDetailHandlers() {
  const input = document.getElementById('segment-search-input');
  const countEl = document.getElementById('segment-search-count');
  const rows = document.querySelectorAll('[data-segment-row]');
  const emptyRow = document.getElementById('segment-empty-row');
  if (input) {
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let visible = 0;
      rows.forEach(tr => {
        const match = !q || tr.dataset.segmentRow.includes(q);
        tr.classList.toggle('hidden', !match);
        if (match) visible += 1;
      });
      if (countEl) countEl.textContent = `${visible} de ${rows.length}`;
      if (emptyRow) emptyRow.classList.toggle('hidden', visible !== 0);
    });
  }
  const openBtn = document.getElementById('segment-invite-open');
  if (openBtn) {
    openBtn.addEventListener('click', () => paintSegmentInvitePanel());
  }
}

function paintSegmentInvitePanel() {
  const host = document.getElementById('segment-invite-panel');
  if (!host) return;
  const { data } = _segDetailCache;
  const activeActivities = (State.activities || []).filter(a => a.status === 'activa');
  const withEmailIds = data.users.filter(u => u.email && u.id).map(u => u.id);
  const noEmailCount = data.users.filter(u => !u.email).length;

  host.innerHTML = `
    <div class="activity-detail-section" id="segment-invite-section">
      <div class="activity-detail-section-header">
        <h4><i class="fa-solid fa-paper-plane"></i> Invitar a este segmento</h4>
      </div>
      <p class="form-hint" style="margin:0 0 10px">
        Se enviará una invitación por correo (con link único de RSVP) a los <strong>${withEmailIds.length}</strong> usuarios del segmento que tienen email.
        ${noEmailCount > 0 ? ` Los ${noEmailCount} sin email serán omitidos.` : ''}
      </p>
      <div class="form-grid" style="grid-template-columns:1fr;gap:10px">
        <label class="form-field">
          <span class="form-label">Actividad</span>
          <select id="segment-invite-activity" class="form-input">
            ${activeActivities.map(a => `
              <option value="${Utils.escapeHtml(a.id)}">${Utils.escapeHtml(a.name)} · ${Utils.formatDate(a.date, false)} · ${a.enrolledCount}/${a.capacity}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <div id="segment-invite-result" style="margin-top:10px"></div>
      <div class="form-actions" style="margin-top:10px;border-top:0;padding-top:0">
        <button type="button" class="btn btn--ghost" id="segment-invite-cancel">Cancelar</button>
        <button type="button" class="btn btn--primary" id="segment-invite-confirm" ${withEmailIds.length === 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-paper-plane"></i> Enviar ${withEmailIds.length} invitación${withEmailIds.length === 1 ? '' : 'es'}
        </button>
      </div>
    </div>`;

  document.getElementById('segment-invite-cancel').onclick = () => { host.innerHTML = ''; };
  document.getElementById('segment-invite-confirm').onclick = async () => {
    const select = document.getElementById('segment-invite-activity');
    const activityId = select?.value;
    if (!activityId) { Toast.error('Selecciona una actividad'); return; }
    const activity = activeActivities.find(a => a.id === activityId);
    const ok = await Modal.confirm({
      title: 'Confirmar envío',
      message: `Vas a enviar ${withEmailIds.length} invitación${withEmailIds.length === 1 ? '' : 'es'} por correo para "${activity?.name || ''}". Los que ya estén invitados no recibirán doble. ¿Continuar?`,
      confirmLabel: 'Sí, enviar',
    });
    if (!ok) return;
    await sendSegmentInvitations(activityId, withEmailIds);
  };
}

async function sendSegmentInvitations(activityId, userIds) {
  const confirmBtn = document.getElementById('segment-invite-confirm');
  const cancelBtn = document.getElementById('segment-invite-cancel');
  const resultEl = document.getElementById('segment-invite-result');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…'; }
  if (cancelBtn) cancelBtn.disabled = true;
  try {
    const result = await API.activities.invite(activityId, userIds);
    const s = result.summary || {};
    const html = `
      <div class="form-hint" style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;background:#f0fdf4;color:#166534">
        <strong><i class="fa-solid fa-circle-check"></i> Envío completado.</strong><br>
        Solicitadas: ${s.requested ?? userIds.length} ·
        Creadas: ${s.created ?? 0} ·
        Ya invitadas: ${s.alreadyInvited ?? 0} ·
        Enviadas: ${s.emailsSent ?? 0} ·
        Omitidas: ${s.emailsSkipped ?? 0} ·
        Fallidas: ${s.emailsFailed ?? 0}
      </div>`;
    if (resultEl) resultEl.innerHTML = html;
    Toast.success(`${s.emailsSent || 0} invitación${(s.emailsSent || 0) === 1 ? '' : 'es'} enviada${(s.emailsSent || 0) === 1 ? '' : 's'}`);
    if (confirmBtn) {
      confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Enviado';
    }
  } catch (e) {
    if (resultEl) {
      resultEl.innerHTML = `<div class="form-hint" style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;background:#fef2f2;color:#991b1b">
        <strong><i class="fa-solid fa-triangle-exclamation"></i> No se pudo enviar.</strong><br>
        ${Utils.escapeHtml(explainError(e))}
      </div>`;
    }
    Toast.error(explainError(e));
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Reintentar'; }
    if (cancelBtn) cancelBtn.disabled = false;
  }
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
      const prefix = (State.tenant?.codePrefix || 'segmento').toLowerCase();
      XLSX.writeFile(wb, `${prefix}-segmento-${id}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      Toast.success(`${data.total} persona(s) exportadas`);
    })
    .catch(e => Toast.error(explainError(e)));
}

// ============================================================
// View: Check-in
// ============================================================
// ============================================================
// View: Check-in (premium command center)
// ============================================================
const _ckState = { ctx: null, autoRefreshTimer: null, lastQuery: '' };

async function renderCheckin() {
  if (_ckState.autoRefreshTimer) clearInterval(_ckState.autoRefreshTimer);
  const root = document.getElementById('content');
  root.innerHTML = checkinSkeletonHtml();
  try {
    const [usersResp, ctx] = await Promise.all([
      API.users.list(),
      API.dashboard.checkinContext(),
    ]);
    State.users = usersResp.users;
    _ckState.ctx = ctx;
    State.activities = ctx.activeActivities;
    State.checkin = State.checkin || { selectedUser: null };
    paintCheckin();
  } catch (e) {
    root.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>No se pudo cargar Check-in</h3><p>${Utils.escapeHtml(explainError(e))}</p></div>`;
    return;
  }
  // Auto-refresh del context cada 30s (counters, recent feed)
  _ckState.autoRefreshTimer = setInterval(refreshCheckinContext, 30_000);
}

function checkinSkeletonHtml() {
  return `
    <div class="ck">
      <div class="ck-statsbar skeleton-block" style="height:88px"></div>
      <div class="ck-grid">
        <div class="panel skeleton-block" style="height:520px"></div>
        <div class="panel skeleton-block" style="height:520px"></div>
      </div>
    </div>`;
}

async function refreshCheckinContext() {
  if (window.location.hash.replace(/^#\/?/, '').split('/')[0] !== 'checkin') {
    if (_ckState.autoRefreshTimer) clearInterval(_ckState.autoRefreshTimer);
    return;
  }
  try {
    const ctx = await API.dashboard.checkinContext();
    _ckState.ctx = ctx;
    State.activities = ctx.activeActivities;
    paintCheckinStatsbar();
    paintCheckinActivities();
    paintCheckinRecentFeed();
    paintCheckinRecentChips();
  } catch {}
}

function paintCheckin() {
  const root = document.getElementById('content');
  root.innerHTML = `
    <div class="ck">
      <div id="ck-statsbar"></div>
      <div id="ck-today-hero"></div>
      <div class="ck-grid">
        <section class="panel ck-left">
          <div class="panel-header">
            <div>
              <h2><span class="ck-step">1</span> Encuentra al visitante</h2>
              <p>Por nombre, código, email o teléfono</p>
            </div>
          </div>
          <div class="panel-body ck-left-body">
            <div class="search-input search-input--lg">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" id="ck-search" placeholder="${(window.__tenant__?.codePrefix || 'CCB').toUpperCase()}-XXXXXX, nombre o email…" autocomplete="off" />
              <kbd class="ck-kbd">/</kbd>
            </div>
            <div id="ck-recent-chips" class="ck-recent-chips"></div>
            <div id="ck-suggestions" class="ck-suggestions"></div>
            <div id="ck-selected"></div>
          </div>
        </section>

        <section class="panel ck-right">
          <div class="panel-header">
            <div>
              <h2><span class="ck-step">2</span> Registra asistencia</h2>
              <p id="ck-activities-meta"></p>
            </div>
          </div>
          <div class="panel-body">
            <div id="ck-activities" class="ck-activities"></div>
          </div>
          <div class="panel-footer ck-feed-wrap">
            <h3 class="ck-feed-title"><i class="fa-solid fa-tower-broadcast"></i> Movimiento en vivo</h3>
            <div id="ck-feed" class="ck-feed"></div>
          </div>
        </section>
      </div>
    </div>`;

  paintCheckinStatsbar();
  paintCheckinTodayHero();
  paintCheckinActivities();
  paintCheckinSelected();
  paintCheckinRecentChips();
  paintCheckinRecentFeed();

  const input = document.getElementById('ck-search');
  input.focus();
  input.addEventListener('input', e => paintCheckinSuggestions(e.target.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = document.querySelector('#ck-suggestions .ck-suggestion');
      if (first) first.click();
    } else if (e.key === 'Escape') {
      input.value = '';
      _ckState.lastQuery = '';
      paintCheckinSuggestions('');
    }
  });

  // Atajo global: '/' enfoca la búsqueda si no se está escribiendo en otro input
  document.addEventListener('keydown', ckShortcutHandler);
}

function ckShortcutHandler(e) {
  if (window.location.hash.replace(/^#\/?/, '').split('/')[0] !== 'checkin') {
    document.removeEventListener('keydown', ckShortcutHandler);
    return;
  }
  const target = e.target;
  const editable = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;
  if (e.key === '/' && !editable) {
    e.preventDefault();
    document.getElementById('ck-search')?.focus();
  }
}

function paintCheckinStatsbar() {
  const el = document.getElementById('ck-statsbar');
  if (!el || !_ckState.ctx) return;
  const s = _ckState.ctx.stats;
  el.innerHTML = `
    <div class="ck-statsbar">
      <div class="ck-stat">
        <div class="ck-stat-icon ck-stat-icon--accent"><i class="fa-solid fa-clipboard-check"></i></div>
        <div>
          <div class="ck-stat-label">Check-ins hoy</div>
          <div class="ck-stat-value">${s.checkinsToday}</div>
        </div>
      </div>
      <div class="ck-stat">
        <div class="ck-stat-icon"><i class="fa-solid fa-users"></i></div>
        <div>
          <div class="ck-stat-label">Visitantes únicos hoy</div>
          <div class="ck-stat-value">${s.uniqueAttendeesToday}</div>
        </div>
      </div>
      <div class="ck-stat">
        <div class="ck-stat-icon"><i class="fa-solid fa-bolt"></i></div>
        <div>
          <div class="ck-stat-label">Actividades activas</div>
          <div class="ck-stat-value">${s.activeActivities}</div>
        </div>
      </div>
      <div class="ck-stat-actions">
        <button type="button" class="btn btn--ghost btn--sm" data-action="user-new">
          <i class="fa-solid fa-user-plus"></i> Nuevo visitante
        </button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="ck-refresh" title="Refrescar">
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
      </div>
    </div>`;
}

function paintCheckinTodayHero() {
  const el = document.getElementById('ck-today-hero');
  if (!el || !_ckState.ctx) return;
  const today = _ckState.ctx.todayActivity;
  if (!today) { el.innerHTML = ''; return; }
  const occ = today.capacity ? Math.round((today.enrolledCount / today.capacity) * 100) : 0;
  const hour = new Date(today.date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `
    <div class="ck-today-hero">
      <div class="ck-today-eyebrow"><i class="fa-solid fa-circle"></i> EVENTO DE HOY</div>
      <div class="ck-today-row">
        ${today.imageUrl
          ? `<div class="ck-today-thumb"><img src="${Utils.escapeHtml(today.imageUrl)}" alt="" /></div>`
          : `<div class="ck-today-thumb ck-today-thumb--placeholder"><i class="fa-solid ${dashTypeIcon(today.type)}"></i></div>`}
        <div class="ck-today-info">
          <h3 class="ck-today-name">${Utils.escapeHtml(today.name)}</h3>
          <div class="ck-today-meta">
            <span><i class="fa-solid fa-clock"></i> ${Utils.escapeHtml(hour)}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${Utils.escapeHtml(today.location)}</span>
            <span class="badge badge--type-${Utils.escapeHtml(today.type)}">${Utils.escapeHtml(Utils.activityTypeLabel(today.type))}</span>
          </div>
        </div>
        <div class="ck-today-progress">
          <div class="ck-today-progress-num">${today.enrolledCount}<span>/${today.capacity}</span></div>
          <div class="progress-track"><div class="progress-bar ${occ >= 80 ? 'progress-bar--hot' : ''}" style="width:${occ}%"></div></div>
          <div class="progress-meta"><span>${occ}% de capacidad</span></div>
        </div>
      </div>
    </div>`;
}

function paintCheckinRecentChips() {
  const el = document.getElementById('ck-recent-chips');
  if (!el || !_ckState.ctx) return;
  const recents = _ckState.ctx.recentUsersToday;
  if (!recents || !recents.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="ck-recent-chips-label">Recientes de hoy</div>
    <div class="ck-recent-chips-list">
      ${recents.map(u => {
        const initials = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase();
        return `
          <button type="button" class="ck-recent-chip" data-action="checkin-select" data-code="${Utils.escapeHtml(u.code)}" title="${Utils.escapeHtml(u.firstName + ' ' + u.lastName)} · ${u.visitCount} visita(s)">
            <span class="ck-recent-chip-avatar">${Utils.escapeHtml(initials)}</span>
            <span class="ck-recent-chip-name">${Utils.escapeHtml(u.firstName)}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function paintCheckinSuggestions(q) {
  const el = document.getElementById('ck-suggestions');
  if (!el) return;
  const query = q.trim().toLowerCase();
  _ckState.lastQuery = query;
  if (!query) { el.innerHTML = ''; return; }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nq = norm(query);
  const matches = State.users
    .filter(u =>
      norm(u.code).includes(nq) ||
      norm(u.firstName).includes(nq) ||
      norm(u.lastName).includes(nq) ||
      (u.email && norm(u.email).includes(nq)) ||
      (u.phone && u.phone.toLowerCase().includes(query)),
    )
    .slice(0, 8);
  if (!matches.length) {
    el.innerHTML = `
      <div class="ck-no-results">
        <i class="fa-solid fa-user-slash"></i>
        <div>
          <div><strong>Sin coincidencias</strong></div>
          <div class="cell-muted">No encontramos a nadie con "${Utils.escapeHtml(q)}"</div>
        </div>
        <button type="button" class="btn btn--accent btn--sm" data-action="user-new">
          <i class="fa-solid fa-user-plus"></i> Crear visitante
        </button>
      </div>`;
    return;
  }
  el.innerHTML = matches.map(u => {
    const initials = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase() || '?';
    const isNew = (u.visitCount || 0) <= 1;
    const isVip = (u.visitCount || 0) >= 10;
    const tag = isVip
      ? `<span class="ck-suggestion-tag ck-suggestion-tag--vip">VIP</span>`
      : isNew
        ? `<span class="ck-suggestion-tag ck-suggestion-tag--new">1ª vez</span>`
        : `<span class="ck-suggestion-tag ck-suggestion-tag--reg">${u.visitCount}v</span>`;
    return `
      <button type="button" class="ck-suggestion" data-action="checkin-select" data-code="${Utils.escapeHtml(u.code)}">
        <span class="ck-suggestion-avatar">${Utils.escapeHtml(initials)}</span>
        <span class="ck-suggestion-info">
          <span class="ck-suggestion-name">${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</span>
          <span class="ck-suggestion-meta">
            <span class="user-code">${Utils.escapeHtml(u.code)}</span>
            ${u.email ? `· ${Utils.escapeHtml(u.email)}` : ''}
          </span>
        </span>
        ${tag}
      </button>`;
  }).join('');
}

function paintCheckinSelected() {
  const u = State.checkin?.selectedUser;
  const el = document.getElementById('ck-selected');
  if (!el) return;
  if (!u) {
    el.innerHTML = `
      <div class="ck-empty">
        <i class="fa-solid fa-arrow-up"></i>
        <span>Selecciona un visitante para continuar</span>
      </div>`;
    return;
  }
  const initials = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase() || '?';
  const isNew = (u.visitCount || 0) <= 1;
  const isVip = (u.visitCount || 0) >= 10;
  const tag = isVip
    ? `<span class="ck-selected-tag ck-selected-tag--vip"><i class="fa-solid fa-crown"></i> VIP · ${u.visitCount} visitas</span>`
    : isNew
      ? `<span class="ck-selected-tag ck-selected-tag--new"><i class="fa-solid fa-seedling"></i> Primera vez</span>`
      : `<span class="ck-selected-tag ck-selected-tag--reg"><i class="fa-solid fa-repeat"></i> ${u.visitCount} visitas</span>`;
  el.innerHTML = `
    <div class="ck-selected">
      <div class="ck-selected-avatar">${Utils.escapeHtml(initials)}</div>
      <div class="ck-selected-info">
        <h3>${Utils.escapeHtml(u.firstName + ' ' + u.lastName)}</h3>
        <div class="ck-selected-meta">
          <span class="user-code">${Utils.escapeHtml(u.code)}</span>
          ${u.email ? `<span class="cell-muted">· ${Utils.escapeHtml(u.email)}</span>` : ''}
        </div>
        ${tag}
      </div>
      <button class="icon-btn" data-action="checkin-clear" title="Limpiar (Esc)">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`;
}

function paintCheckinActivities() {
  const meta = document.getElementById('ck-activities-meta');
  const el = document.getElementById('ck-activities');
  if (!el) return;
  const active = State.activities;
  if (meta) meta.textContent = `${active.length} actividad(es) activa(s)`;
  if (!active.length) {
    el.innerHTML = `<div class="empty"><i class="fa-solid fa-calendar-xmark"></i><h3>Sin actividades activas</h3><p>Crea una para empezar a recibir asistencias.</p></div>`;
    return;
  }
  const u = State.checkin?.selectedUser;
  const todayMs = new Date(); todayMs.setHours(0, 0, 0, 0);
  const tomorrowMs = todayMs.getTime() + 86400000;
  el.innerHTML = active.map(a => {
    const pct = a.capacity ? Math.round((a.enrolledCount / a.capacity) * 100) : 0;
    const isFull = a.enrolledCount >= a.capacity;
    const nearFull = pct >= 80;
    const t = new Date(a.date).getTime();
    const isToday = t >= todayMs.getTime() && t < tomorrowMs;
    return `
      <div class="ck-activity ${isFull ? 'is-full' : ''} ${nearFull && !isFull ? 'is-hot' : ''} ${isToday ? 'is-today' : ''}" data-activity-id="${Utils.escapeHtml(a.id)}">
        <div class="ck-activity-head">
          <span class="badge badge--type-${a.type}">${Utils.escapeHtml(Utils.activityTypeLabel(a.type))}</span>
          ${isToday ? '<span class="ck-activity-today-pill"><i class="fa-solid fa-circle"></i> HOY</span>' : ''}
          <span class="cell-muted" style="font-size:11px;margin-left:auto">${Utils.escapeHtml(Utils.formatDate(a.date))}</span>
        </div>
        <h4>${Utils.escapeHtml(a.name)}</h4>
        <div class="cell-muted ck-activity-loc"><i class="fa-solid fa-location-dot"></i> ${Utils.escapeHtml(a.location)}</div>
        <div class="ck-activity-progress">
          <div class="progress-track"><div class="progress-bar ${nearFull ? 'progress-bar--hot' : ''}" style="width:${pct}%"></div></div>
          <div class="progress-meta"><span>${a.enrolledCount}/${a.capacity}</span><span>${pct}%</span></div>
        </div>
        <button class="btn ${u && !isFull ? 'btn--accent' : 'btn--ghost'} btn--block" data-action="${u ? 'checkin-register' : 'checkin-focus-search'}" data-user-code="${Utils.escapeHtml(u?.code || '')}" data-activity-id="${Utils.escapeHtml(a.id)}" ${isFull ? 'disabled' : ''}>
          ${isFull ? '<i class="fa-solid fa-ban"></i> Cupo lleno' : u ? '<i class="fa-solid fa-check"></i> Registrar asistencia' : '<i class="fa-solid fa-user"></i> Selecciona un visitante'}
        </button>
      </div>`;
  }).join('');
}

function paintCheckinRecentFeed() {
  const el = document.getElementById('ck-feed');
  if (!el || !_ckState.ctx) return;
  const feed = _ckState.ctx.recentFeed;
  if (!feed || feed.length === 0) {
    el.innerHTML = `<div class="ck-feed-empty"><i class="fa-regular fa-clock"></i> Aún no hay check-ins hoy</div>`;
    return;
  }
  const now = Date.now();
  el.innerHTML = feed.map(f => {
    const initials = ((f.userName?.[0] || '') + (f.userName?.split(' ')[1]?.[0] || '')).toUpperCase() || '?';
    const secs = Math.max(0, Math.floor((now - new Date(f.registeredAt).getTime()) / 1000));
    const ago = secs < 60 ? `hace ${secs}s`
      : secs < 3600 ? `hace ${Math.floor(secs / 60)} min`
      : `hace ${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    return `
      <div class="ck-feed-item">
        <div class="ck-feed-avatar">${Utils.escapeHtml(initials)}</div>
        <div class="ck-feed-info">
          <div class="ck-feed-name">${Utils.escapeHtml(f.userName)}</div>
          <div class="ck-feed-meta">
            ${f.activityName ? `<i class="fa-solid ${dashTypeIcon(f.activityType)}"></i> ${Utils.escapeHtml(f.activityName)}` : ''}
          </div>
        </div>
        <div class="ck-feed-time">${Utils.escapeHtml(ago)}</div>
      </div>`;
  }).join('');
}

async function handleCheckinSelect(code) {
  try {
    const user = await API.users.get(code);
    State.checkin = State.checkin || {};
    State.checkin.selectedUser = user;
    const input = document.getElementById('ck-search');
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
  document.getElementById('ck-search')?.focus();
}

function handleCheckinFocusSearch() {
  const input = document.getElementById('ck-search');
  if (!input) return;
  input.focus();
  // Scroll a la columna izquierda con un pulse visual para que sea obvio.
  const card = input.closest('.card') || input;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('pulse-attention');
  setTimeout(() => card.classList.remove('pulse-attention'), 1200);
}

async function handleCheckinRegister(userCode, activityId) {
  if (!userCode || !activityId) return;
  try {
    await API.attendance.create({ userCode, activityId });
    Toast.success('¡Asistencia registrada!');
    // Refresca el contexto vivo: stats, recent feed, activities, recent chips
    const [ctx, user] = await Promise.all([
      API.dashboard.checkinContext(),
      API.users.get(userCode),
    ]);
    _ckState.ctx = ctx;
    State.activities = ctx.activeActivities;
    State.checkin.selectedUser = user;
    paintCheckinStatsbar();
    paintCheckinActivities();
    paintCheckinSelected();
    paintCheckinRecentChips();
    paintCheckinRecentFeed();
    // Pulse en la card de la actividad recién registrada
    const card = document.querySelector(`.ck-activity[data-activity-id="${activityId}"]`);
    if (card) {
      card.classList.add('pulse-success');
      setTimeout(() => card.classList.remove('pulse-success'), 1200);
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
      case 'activity-report-xlsx': handleActivityReport(id, target, 'xlsx'); break;
      case 'activity-report-pdf': handleActivityReport(id, target, 'pdf'); break;
      case 'activity-invite': handleActivityInvite(id); break;
      case 'activity-share-copy': handleActivityShareCopy(target); break;
      case 'activities-export': handleExport('activities'); break;
      case 'activity-attendees-export':
        exportActivityAttendees(target.dataset.id); break;
      case 'activity-attendees-print':
        printActivityAttendees(target.dataset.id); break;
      case 'activity-attendee-add':
        openAttendeePicker(target.dataset.id); break;
      case 'attendee-picker-close':
        closeAttendeePicker(); break;
      case 'attendee-picker-assign':
        assignAttendeeToActivity(target.dataset.code, target.dataset.id, target); break;
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
      case 'checkin-focus-search':
        handleCheckinFocusSearch(); break;
      case 'ck-refresh':
        refreshCheckinContext(); break;
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

  setupSidebarToggle();
}

function setupSidebarToggle() {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  if (!sidebar) return;

  let backdrop = document.getElementById('sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sidebar-backdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const open = () => {
    sidebar.classList.add('open');
    backdrop.classList.add('is-visible');
  };
  const close = () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('is-visible');
  };
  const isOpen = () => sidebar.classList.contains('open');

  toggle?.addEventListener('click', () => (isOpen() ? close() : open()));
  backdrop.addEventListener('click', close);

  // Esc cierra el sidebar abierto.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  // Al cambiar de hash (navegación) cerrar para evitar quedar atrapado.
  window.addEventListener('hashchange', close);

  // Si el viewport pasa a desktop con el sidebar abierto, limpiar el backdrop.
  const mq = window.matchMedia('(min-width: 901px)');
  const onChange = () => { if (mq.matches) backdrop.classList.remove('is-visible'); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else mq.addListener(onChange); // Safari < 14
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
