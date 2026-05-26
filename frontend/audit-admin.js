// =============================================================================
// audit-admin.js · vista "Historial" (#/audit)
// Layout Variante A: dense pro tipo Linear/Stripe audit log.
// Filter pills por categoría + date pills + search por actor +
// day-grouped sticky headers + rows densas + expand in-place con metadata.
// =============================================================================

(function () {
  const ACTION_LABELS = {
    'auth.login':                'Inicio de sesión',
    'auth.login_failed':         'Intento fallido de login',
    'auth.logout':               'Cierre de sesión',
    'auth.password_changed':     'Cambio de contraseña',
    'auth.password_reset_used':  'Recovery de contraseña usado',
    'staff.invited':             'Invitación enviada',
    'staff.invitation_revoked':  'Invitación revocada',
    'staff.invitation_resent':   'Invitación reenviada',
    'staff.invite_accepted':     'Invitación aceptada',
    'staff.role_changed':        'Cambio de rol',
    'staff.suspended':           'Staff suspendido',
    'staff.reactivated':         'Staff reactivado',
    'staff.deleted':             'Staff eliminado',
    'activity.created':          'Actividad creada',
    'activity.cancelled':        'Actividad cancelada',
    'branding.updated':          'Identidad actualizada',
    'domain.requested':          'Dominio solicitado',
    'domain.verified':           'Dominio verificado',
  };

  // Pills de categoría (filter por prefijo). El value vacío = todas.
  // El value que termina en "." filtra por LIKE prefix; el value exacto filtra
  // por igualdad (lo mismo que el backend ya soporta).
  const CATEGORY_PILLS = [
    { value: '',                  label: 'Todos',        prefix: null },
    { value: 'auth.',             label: 'Auth',         prefix: 'auth.' },
    { value: 'staff.',            label: 'Staff',        prefix: 'staff.' },
    { value: 'activity.',         label: 'Actividades',  prefix: 'activity.' },
    { value: 'branding.updated',  label: 'Identidad',    prefix: 'branding.' },
    { value: 'domain.',           label: 'Dominio',      prefix: 'domain.' },
  ];

  // Severity tier (ok / warn / risk / default) — visual color del dot e icon bg.
  function severity(action) {
    if (action === 'auth.login_failed') return 'risk';
    if (action === 'staff.deleted' || action === 'staff.suspended') return 'risk';
    if (action === 'tenant.suspended') return 'risk';
    if (action === 'activity.cancelled') return 'risk';
    if (action === 'staff.role_changed' || action === 'branding.updated' || action === 'domain.requested') return 'warn';
    if (action === 'auth.login' || action === 'staff.invite_accepted' ||
        action === 'staff.reactivated' || action === 'domain.verified') return 'ok';
    return '';
  }

  function actionIcon(a) {
    if (a === 'auth.login_failed') return 'fa-triangle-exclamation';
    if (a === 'auth.login') return 'fa-key';
    if (a === 'auth.logout') return 'fa-right-from-bracket';
    if (a === 'auth.password_changed' || a === 'auth.password_reset_used') return 'fa-lock';
    if (a === 'staff.role_changed') return 'fa-arrows-up-down';
    if (a === 'staff.suspended') return 'fa-ban';
    if (a === 'staff.deleted') return 'fa-trash';
    if (a === 'staff.reactivated') return 'fa-rotate-left';
    if (a === 'staff.invite_accepted') return 'fa-circle-check';
    if (a.startsWith('staff.invit')) return 'fa-envelope-open-text';
    if (a === 'activity.created') return 'fa-calendar-plus';
    if (a === 'activity.cancelled') return 'fa-calendar-xmark';
    if (a === 'branding.updated') return 'fa-palette';
    if (a.startsWith('domain.')) return 'fa-globe';
    return 'fa-circle-dot';
  }

  function labelAction(a) { return ACTION_LABELS[a] || a; }

  // Hash determinista nombre/email → color HSL para avatar.
  function avatarColor(seed) {
    const s = String(seed || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFFFFFF;
    return `hsl(${Math.abs(h) % 360}, 45%, 42%)`;
  }
  function initialsFromMaskedEmail(masked) {
    if (!masked) return '?';
    return String(masked).charAt(0).toUpperCase();
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return ''; }
  }
  function fmtDateFull(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-DO', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch { return iso; }
  }

  // Agrupa entries por día local. Devuelve [{ key, title, subtitle, count, entries[] }].
  function groupByDay(entries) {
    if (!entries.length) return [];
    const groups = new Map();
    const today = new Date(); today.setHours(0,0,0,0);
    const yest = new Date(today.getTime() - 86400000);
    for (const e of entries) {
      const d = new Date(e.createdAt);
      const k = d.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!groups.has(k)) {
        const day = new Date(d); day.setHours(0,0,0,0);
        let title, subtitle;
        if (day.getTime() === today.getTime()) {
          title = 'Hoy';
          subtitle = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
        } else if (day.getTime() === yest.getTime()) {
          title = 'Ayer';
          subtitle = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
        } else {
          title = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
          // Cuántos días atrás
          const ageDays = Math.round((today.getTime() - day.getTime()) / 86400000);
          subtitle = ageDays < 7 ? `hace ${ageDays} días` : d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        groups.set(k, { key: k, title, subtitle, entries: [] });
      }
      groups.get(k).entries.push(e);
    }
    return Array.from(groups.values()).map(g => ({ ...g, count: g.entries.length }));
  }

  // === Local state ===
  const Ctx = {
    entries: [],
    nextCursor: null,
    loading: false,
    filters: {
      category: '',           // value de CATEGORY_PILLS
      datePreset: '7d',       // 'today' | '7d' | '30d' | 'all'
      search: '',             // por actor (email/nombre)
    },
    expandedIds: new Set(),   // ids de entries expandidas
  };

  function dateRangeForPreset(preset) {
    const now = new Date();
    if (preset === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0);
      return { since: start.toISOString(), until: undefined };
    }
    if (preset === '7d') {
      const start = new Date(now.getTime() - 7 * 86400000);
      return { since: start.toISOString(), until: undefined };
    }
    if (preset === '30d') {
      const start = new Date(now.getTime() - 30 * 86400000);
      return { since: start.toISOString(), until: undefined };
    }
    return { since: undefined, until: undefined };
  }

  async function fetchPage({ append } = {}) {
    Ctx.loading = true;
    const qs = new URLSearchParams();
    qs.set('limit', '50');
    if (Ctx.filters.category) qs.set('action', Ctx.filters.category);
    const { since, until } = dateRangeForPreset(Ctx.filters.datePreset);
    if (since) qs.set('since', since);
    if (until) qs.set('until', until);
    if (append && Ctx.nextCursor) qs.set('before', Ctx.nextCursor);

    const res = await fetch(`/api/audit-log?${qs.toString()}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('No se pudo cargar el historial');
    const data = await res.json();
    Ctx.nextCursor = data.nextCursor || null;
    Ctx.entries = append ? [...Ctx.entries, ...(data.entries || [])] : (data.entries || []);
    Ctx.loading = false;
  }

  function applySearch(entries) {
    const q = Ctx.filters.search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => {
      const haystack = [
        e.actorEmailMasked, e.actorRole, e.targetLabel,
        e.targetType, labelAction(e.action), e.action,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderToolbar() {
    const pills = CATEGORY_PILLS.map(p => `
      <button type="button" class="audit-pill ${Ctx.filters.category === p.value ? 'is-active' : ''}" data-pill="${Utils.escapeHtml(p.value)}">
        ${Utils.escapeHtml(p.label)}
      </button>`).join('');

    const dates = [
      { v: 'today', label: 'Hoy' },
      { v: '7d',    label: 'Últimos 7d' },
      { v: '30d',   label: 'Últimos 30d' },
      { v: 'all',   label: 'Todo' },
    ].map(d => `
      <button type="button" class="audit-date-pill ${Ctx.filters.datePreset === d.v ? 'is-active' : ''}" data-date="${d.v}">
        ${Utils.escapeHtml(d.label)}
      </button>`).join('');

    return `
      <div class="audit-toolbar">
        <div class="audit-pills" role="tablist">${pills}</div>
        <div class="audit-date-pills">${dates}</div>
        <label class="audit-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="search" id="audit-search" placeholder="Buscar por actor o target…"
                 value="${Utils.escapeHtml(Ctx.filters.search)}" />
        </label>
        <div class="audit-toolbar__spacer"></div>
        <span class="audit-toolbar__count" id="audit-count">—</span>
      </div>`;
  }

  function renderEntry(e) {
    const sev = severity(e.action);
    const isOpen = Ctx.expandedIds.has(e.id);
    const actorAvatar = e.actorStaffId
      ? `<span class="audit-entry__avatar" style="background:${avatarColor(e.actorEmailMasked || e.actorStaffId)}">${Utils.escapeHtml(initialsFromMaskedEmail(e.actorEmailMasked))}</span>`
      : '';
    const actorBlock = e.actorEmailMasked
      ? `<span class="audit-entry__actor ${e.actorStaffId ? '' : 'audit-entry__actor--sys'}">
           ${actorAvatar}
           ${Utils.escapeHtml(e.actorEmailMasked)}
           ${e.actorRole ? `<span class="audit-role">${Utils.escapeHtml(e.actorRole)}</span>` : ''}
         </span>`
      : '<span class="audit-entry__actor audit-entry__actor--sys"><em>sistema</em></span>';
    const target = e.targetLabel
      ? `<span class="audit-entry__sep">·</span><span class="audit-entry__target">${Utils.escapeHtml(e.targetLabel)}</span>`
      : '';

    return `
      <div class="audit-entry ${sev ? `audit-entry--${sev}` : ''} ${isOpen ? 'is-open' : ''}" data-id="${Utils.escapeHtml(e.id)}">
        <span class="audit-entry__sev"></span>
        <span class="audit-entry__time">${Utils.escapeHtml(fmtTime(e.createdAt))}</span>
        <span class="audit-entry__icon"><i class="fa-solid ${actionIcon(e.action)}"></i></span>
        <div class="audit-entry__body">
          <span class="audit-entry__action">${Utils.escapeHtml(labelAction(e.action))}</span>
          ${actorBlock}
          ${target}
        </div>
        <i class="fa-solid fa-chevron-right audit-entry__chevron"></i>
      </div>
      ${isOpen ? renderDetail(e) : ''}
    `;
  }

  function renderDetail(e) {
    const rows = [];
    rows.push(['Acción', `<code>${Utils.escapeHtml(e.action)}</code>`]);
    if (e.actorEmailMasked) {
      rows.push(['Actor', `${Utils.escapeHtml(e.actorEmailMasked)}${e.actorRole ? ` · <code>${Utils.escapeHtml(e.actorRole)}</code>` : ''}`]);
    } else {
      rows.push(['Actor', '<em>sistema</em>']);
    }
    if (e.targetLabel) rows.push(['Target', Utils.escapeHtml(e.targetLabel)]);
    if (e.targetType)  rows.push(['Tipo de target', `<code>${Utils.escapeHtml(e.targetType)}</code>`]);
    rows.push(['Fecha', Utils.escapeHtml(fmtDateFull(e.createdAt))]);
    if (e.ipHash) rows.push(['IP (hashed)', `<code>${Utils.escapeHtml(String(e.ipHash).slice(0, 40))}…</code>`]);
    if (e.ua)     rows.push(['User agent', `<code>${Utils.escapeHtml(String(e.ua).slice(0, 120))}</code>`]);
    const hasMeta = e.metadata && Object.keys(e.metadata).length > 0;
    return `
      <div class="audit-detail">
        <dl class="audit-detail__grid">
          ${rows.map(([k, v]) => `<dt>${Utils.escapeHtml(k)}</dt><dd>${v}</dd>`).join('')}
          ${hasMeta ? `
            <dt>Metadata</dt>
            <dd><pre class="audit-detail__json">${Utils.escapeHtml(JSON.stringify(e.metadata, null, 2))}</pre></dd>
          ` : ''}
        </dl>
      </div>`;
  }

  function renderDayGroup(g) {
    return `
      <section class="audit-day">
        <header class="audit-day__head">
          <span class="audit-day__title">${Utils.escapeHtml(g.title)}</span>
          <span class="audit-day__date">${Utils.escapeHtml(g.subtitle)}</span>
          <span class="audit-day__count">${g.count} evento${g.count === 1 ? '' : 's'}</span>
        </header>
        <div class="audit-entries">
          ${g.entries.map(renderEntry).join('')}
        </div>
      </section>`;
  }

  function renderList() {
    const filtered = applySearch(Ctx.entries);
    const count = filtered.length;
    const countEl = document.getElementById('audit-count');
    if (countEl) {
      const totalLabel = Ctx.entries.length === count ? `${count}` : `${count} de ${Ctx.entries.length}`;
      countEl.innerHTML = `<strong>${totalLabel}</strong> evento${count === 1 ? '' : 's'}`;
    }

    if (!count) {
      const filteredOut = Ctx.entries.length > 0; // hay entries pero el search los oculta
      return `
        <div class="empty">
          <i class="fa-solid ${filteredOut ? 'fa-filter-circle-xmark' : 'fa-clipboard-list'}"></i>
          <h3>${filteredOut ? 'Sin coincidencias' : 'Sin eventos para mostrar'}</h3>
          <p>${filteredOut ? 'Probá con otro término o limpiá la búsqueda.' : 'Cuando el sistema registre eventos, aparecerán aquí.'}</p>
        </div>`;
    }

    const groups = groupByDay(filtered);
    const more = Ctx.nextCursor
      ? `<div class="audit-more"><button class="btn btn--ghost" id="audit-load-more">Cargar más</button></div>`
      : '';
    return groups.map(renderDayGroup).join('') + more;
  }

  // ============================================================
  // ORCHESTRATION
  // ============================================================
  async function renderAudit() {
    const content = document.getElementById('content');
    const role = State?.currentStaff?.role;
    if (role !== 'owner' && role !== 'admin') {
      document.getElementById('topbar-actions').innerHTML = '';
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-lock"></i>
          <h3>No tienes permiso para esta sección</h3>
          <p>El historial solo está disponible para administradores.</p>
        </div>`;
      return;
    }

    document.getElementById('topbar-actions').innerHTML = `
      <button class="btn btn--ghost btn--sm" id="audit-refresh" title="Refrescar">
        <i class="fa-solid fa-rotate"></i> Refrescar
      </button>`;
    content.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;

    try {
      await fetchPage();
      paint();
    } catch (e) {
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h3>No se pudo cargar el historial</h3>
          <p>${Utils.escapeHtml(e.message)}</p>
        </div>`;
    }
  }

  function paint() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="audit-view">
        ${renderToolbar()}
        <div id="audit-list-wrap" class="audit-list-wrap">${renderList()}</div>
      </div>`;
    bindEvents();
  }

  let _searchTimer = null;
  function bindEvents() {
    const content = document.getElementById('content');

    // Pills categoría
    content.querySelectorAll('[data-pill]').forEach(btn => {
      btn.addEventListener('click', async () => {
        Ctx.filters.category = btn.dataset.pill;
        Ctx.nextCursor = null;
        Ctx.expandedIds.clear();
        const wrap = document.getElementById('audit-list-wrap');
        wrap.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
        try { await fetchPage(); paint(); }
        catch (e) { Toast.error(e.message); }
      });
    });

    // Date pills
    content.querySelectorAll('[data-date]').forEach(btn => {
      btn.addEventListener('click', async () => {
        Ctx.filters.datePreset = btn.dataset.date;
        Ctx.nextCursor = null;
        Ctx.expandedIds.clear();
        const wrap = document.getElementById('audit-list-wrap');
        wrap.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
        try { await fetchPage(); paint(); }
        catch (e) { Toast.error(e.message); }
      });
    });

    // Search (client-side, debounced)
    const searchInput = document.getElementById('audit-search');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
          Ctx.filters.search = e.target.value;
          const wrap = document.getElementById('audit-list-wrap');
          wrap.innerHTML = renderList();
          bindEntryEvents();
          bindMoreBtn();
        }, 180);
      });
    }

    // Refresh
    document.getElementById('audit-refresh')?.addEventListener('click', async () => {
      Ctx.nextCursor = null;
      Ctx.expandedIds.clear();
      const wrap = document.getElementById('audit-list-wrap');
      wrap.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
      try { await fetchPage(); paint(); }
      catch (e) { Toast.error(e.message); }
    });

    bindEntryEvents();
    bindMoreBtn();
  }

  function bindEntryEvents() {
    document.querySelectorAll('.audit-entry').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        if (Ctx.expandedIds.has(id)) Ctx.expandedIds.delete(id);
        else Ctx.expandedIds.add(id);
        const wrap = document.getElementById('audit-list-wrap');
        wrap.innerHTML = renderList();
        bindEntryEvents();
        bindMoreBtn();
      });
    });
  }

  function bindMoreBtn() {
    const btn = document.getElementById('audit-load-more');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Cargando…';
      try {
        await fetchPage({ append: true });
        const wrap = document.getElementById('audit-list-wrap');
        wrap.innerHTML = renderList();
        bindEntryEvents();
        bindMoreBtn();
      } catch (e) {
        Toast.error(e.message);
        btn.disabled = false;
        btn.textContent = 'Cargar más';
      }
    });
  }

  window.renderAudit = renderAudit;
})();
