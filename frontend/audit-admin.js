// =============================================================================
// audit-admin.js · vista "Bitácora" (#/audit)
// =============================================================================

(function () {
  const ACTION_LABELS = {
    'auth.login': 'Inicio de sesión',
    'auth.login_failed': 'Intento fallido de login',
    'auth.logout': 'Cierre de sesión',
    'auth.password_changed': 'Cambio de contraseña',
    'auth.password_reset_used': 'Recovery de contraseña usado',
    'staff.invited': 'Invitación enviada',
    'staff.invitation_revoked': 'Invitación revocada',
    'staff.invitation_resent': 'Invitación reenviada',
    'staff.invite_accepted': 'Invitación aceptada',
    'staff.role_changed': 'Cambio de rol',
    'staff.suspended': 'Staff suspendido',
    'staff.reactivated': 'Staff reactivado',
    'staff.deleted': 'Staff eliminado',
    'activity.created': 'Actividad creada',
    'activity.cancelled': 'Actividad cancelada',
    'branding.updated': 'Identidad actualizada',
    'domain.requested': 'Dominio solicitado',
    'domain.verified': 'Dominio verificado',
  };

  const ACTION_GROUPS = [
    { value: '', label: 'Todas las acciones' },
    { value: 'auth.', label: 'Autenticación' },
    { value: 'staff.', label: 'Staff' },
    { value: 'activity.', label: 'Actividades' },
    { value: 'branding.updated', label: 'Identidad' },
    { value: 'domain.', label: 'Dominio' },
  ];

  function labelAction(a) {
    return ACTION_LABELS[a] || a;
  }

  function actionIcon(a) {
    if (a.startsWith('auth.')) return 'fa-key';
    if (a.startsWith('staff.')) return 'fa-user';
    if (a.startsWith('activity.')) return 'fa-calendar-day';
    if (a.startsWith('branding.')) return 'fa-palette';
    if (a.startsWith('domain.')) return 'fa-globe';
    return 'fa-circle-dot';
  }

  function actionColor(a) {
    if (a.includes('failed') || a.includes('deleted') || a.includes('suspended') || a.includes('revoked') || a.includes('cancelled')) return 'audit-row--danger';
    if (a.includes('changed') || a.includes('updated') || a.includes('role_changed')) return 'audit-row--info';
    return '';
  }

  function fmtFull(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-DO', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  const Ctx = { entries: [], nextCursor: null, loading: false, filters: { action: '', since: '', until: '' } };

  async function fetchPage({ append } = {}) {
    Ctx.loading = true;
    const qs = new URLSearchParams();
    qs.set('limit', '50');
    if (Ctx.filters.action) qs.set('action', Ctx.filters.action);
    if (Ctx.filters.since)  qs.set('since', new Date(Ctx.filters.since).toISOString());
    if (Ctx.filters.until)  qs.set('until', new Date(Ctx.filters.until).toISOString());
    if (append && Ctx.nextCursor) qs.set('before', Ctx.nextCursor);

    const res = await fetch(`/api/audit-log?${qs.toString()}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('No se pudo cargar la bitácora');
    const data = await res.json();
    Ctx.nextCursor = data.nextCursor || null;
    Ctx.entries = append ? [...Ctx.entries, ...(data.entries || [])] : (data.entries || []);
    Ctx.loading = false;
  }

  function renderRow(e) {
    const meta = e.metadata && Object.keys(e.metadata).length
      ? `<details class="audit-meta"><summary>detalles</summary><pre>${Utils.escapeHtml(JSON.stringify(e.metadata, null, 2))}</pre></details>`
      : '';
    const target = e.targetLabel ? ` · <span class="audit-target">${Utils.escapeHtml(e.targetLabel)}</span>` : '';
    return `
      <li class="audit-row ${actionColor(e.action)}">
        <div class="audit-row__icon">
          <i class="fa-solid ${actionIcon(e.action)}"></i>
        </div>
        <div class="audit-row__body">
          <div class="audit-row__title">
            <strong>${labelAction(e.action)}</strong>${target}
          </div>
          <div class="audit-row__line">
            ${e.actorEmailMasked ? `<span>${Utils.escapeHtml(e.actorEmailMasked)}</span>` : '<span class="audit-muted">sistema</span>'}
            ${e.actorRole ? `<span class="audit-pill">${Utils.escapeHtml(e.actorRole)}</span>` : ''}
            <span class="audit-dot">·</span>
            <time datetime="${e.createdAt}">${fmtFull(e.createdAt)}</time>
          </div>
          ${meta}
        </div>
      </li>`;
  }

  function renderList() {
    if (!Ctx.entries.length) {
      return `<div class="empty"><i class="fa-solid fa-clipboard-list"></i><h3>Sin eventos para mostrar</h3><p>Ajusta los filtros o vuelve más tarde.</p></div>`;
    }
    const list = `<ul class="audit-list">${Ctx.entries.map(renderRow).join('')}</ul>`;
    const more = Ctx.nextCursor
      ? `<div class="audit-more"><button class="btn btn--ghost" id="audit-load-more">Cargar más</button></div>`
      : '';
    return list + more;
  }

  function renderFilters() {
    return `
      <div class="audit-filters">
        <select id="audit-action">
          ${ACTION_GROUPS.map(g => `<option value="${g.value}" ${g.value === Ctx.filters.action ? 'selected' : ''}>${g.label}</option>`).join('')}
        </select>
        <input id="audit-since" type="date" value="${Ctx.filters.since}" />
        <span class="audit-dash">—</span>
        <input id="audit-until" type="date" value="${Ctx.filters.until}" />
        <button class="btn btn--ghost btn--sm" id="audit-apply">Aplicar</button>
        ${Ctx.filters.action || Ctx.filters.since || Ctx.filters.until
          ? `<button class="btn btn--ghost btn--sm" id="audit-clear">Limpiar</button>` : ''}
      </div>`;
  }

  async function renderAudit() {
    const content = document.getElementById('content');
    const role = State?.currentStaff?.role;
    if (role !== 'owner' && role !== 'admin') {
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-lock"></i>
          <h3>No tienes permiso para esta sección</h3>
          <p>La bitácora solo está disponible para administradores.</p>
        </div>`;
      return;
    }

    document.getElementById('topbar-actions').innerHTML = '';
    content.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;

    try {
      await fetchPage();
      content.innerHTML = `
        <section class="audit-shell">
          ${renderFilters()}
          <div class="audit-list-wrap" id="audit-list-wrap">${renderList()}</div>
        </section>`;
      bindEvents();
    } catch (e) {
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h3>No se pudo cargar la bitácora</h3>
          <p>${Utils.escapeHtml(e.message)}</p>
        </div>`;
    }
  }

  function bindEvents() {
    document.getElementById('audit-apply')?.addEventListener('click', async () => {
      Ctx.filters.action = document.getElementById('audit-action').value;
      Ctx.filters.since = document.getElementById('audit-since').value;
      Ctx.filters.until = document.getElementById('audit-until').value;
      Ctx.nextCursor = null;
      const wrap = document.getElementById('audit-list-wrap');
      wrap.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
      try {
        await fetchPage();
        wrap.innerHTML = renderList();
        bindMoreBtn();
      } catch (e) { Toast.error(e.message); }
    });

    document.getElementById('audit-clear')?.addEventListener('click', async () => {
      Ctx.filters = { action: '', since: '', until: '' };
      Ctx.nextCursor = null;
      await renderAudit();
    });

    bindMoreBtn();
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
