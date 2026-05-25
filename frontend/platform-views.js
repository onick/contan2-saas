// =============================================================================
// platform-views.js · vistas del panel super admin
// Cada vista pinta su contenido en #pf-content y setea title + actions.
// Depende de PF (platform-app.js).
// =============================================================================

(function () {
  const { api, Toast, Modal, escapeHtml, fmtNum, relTime, fmtDate,
          setPageTitle, setTopbarActions, State } = PF;
  const $ = (s, r = document) => r.querySelector(s);

  const ACTION_LABELS = {
    'auth.login': 'Inicio de sesión',
    'auth.login_failed': 'Intento fallido de login',
    'auth.logout': 'Cierre de sesión',
    'auth.password_changed': 'Cambio de contraseña',
    'auth.password_reset_used': 'Recovery usado',
    'staff.invited': 'Invitación enviada',
    'staff.invitation_revoked': 'Invitación revocada',
    'staff.invitation_resent': 'Invitación reenviada',
    'staff.invite_accepted': 'Invitación aceptada',
    'staff.role_changed': 'Cambio de rol',
    'staff.suspended': 'Staff suspendido',
    'staff.reactivated': 'Staff reactivado',
    'staff.deleted': 'Staff eliminado',
    'tenant.suspended': 'Tenant suspendido',
    'tenant.reactivated': 'Tenant reactivado',
    'activity.created': 'Actividad creada',
    'activity.cancelled': 'Actividad cancelada',
    'branding.updated': 'Identidad actualizada',
    'domain.requested': 'Dominio solicitado',
    'domain.verified': 'Dominio verificado',
  };
  const actionLabel = a => ACTION_LABELS[a] || a;
  function actionIcon(a) {
    if (a.startsWith('auth.')) return 'fa-key';
    if (a.startsWith('staff.')) return 'fa-user';
    if (a.startsWith('tenant.')) return 'fa-building';
    if (a.startsWith('activity.')) return 'fa-calendar-day';
    if (a.startsWith('branding.')) return 'fa-palette';
    if (a.startsWith('domain.')) return 'fa-globe';
    return 'fa-circle-dot';
  }
  function actionVariant(a) {
    if (a.includes('failed') || a.includes('deleted') || a.includes('suspended') || a.includes('revoked') || a.includes('cancelled')) return 'danger';
    if (a.includes('updated') || a.includes('role_changed') || a.includes('reactivated')) return 'info';
    if (a.endsWith('.login') || a.includes('verified') || a.includes('accepted')) return 'ok';
    return '';
  }

  function content() { return $('#pf-content'); }
  function loader() {
    content().innerHTML = `<div class="pf-loader"><div class="pf-spinner"></div></div>`;
  }
  function errorBlock(msg) {
    content().innerHTML = `
      <div class="pf-empty">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>No se pudo cargar</h3>
        <p>${escapeHtml(msg)}</p>
      </div>`;
  }

  // ============================================================
  // OPERACIÓN (dashboard)
  // ============================================================
  async function operacion() {
    setPageTitle('Operación', 'Vista de plataforma. Datos cross-tenant en tiempo real.');
    setTopbarActions(`
      <button class="pf-btn pf-btn--ghost pf-btn--sm" id="pf-refresh-kpis">
        <i class="fa-solid fa-rotate"></i> Refrescar
      </button>
    `);
    loader();
    try {
      const data = await api('GET', '/api/platform/kpis');
      const k = data.kpis || {};
      content().innerHTML = `
        <div class="pf-kpis">
          <div class="pf-kpi">
            <div class="pf-kpi__label"><i class="fa-solid fa-building"></i> Tenants activos</div>
            <div class="pf-kpi__value">${fmtNum(k.activeTenants)}</div>
            <div class="pf-kpi__delta">${fmtNum(k.tenants)} totales · ${fmtNum(k.suspendedTenants)} suspendidos</div>
          </div>
          <div class="pf-kpi">
            <div class="pf-kpi__label"><i class="fa-solid fa-users"></i> Usuarios totales</div>
            <div class="pf-kpi__value">${fmtNum(k.users)}</div>
            <div class="pf-kpi__delta">Cross-tenant</div>
          </div>
          <div class="pf-kpi">
            <div class="pf-kpi__label"><i class="fa-solid fa-clipboard-check"></i> Asistencias</div>
            <div class="pf-kpi__value">${fmtNum(k.attendances)}</div>
            <div class="pf-kpi__delta">Acumulado histórico</div>
          </div>
          <div class="pf-kpi">
            <div class="pf-kpi__label"><i class="fa-solid fa-calendar-day"></i> Actividades activas</div>
            <div class="pf-kpi__value">${fmtNum(k.activeActivities)}</div>
            <div class="pf-kpi__delta">${fmtNum(k.staff)} staff registrado</div>
          </div>
        </div>

        <div class="pf-card">
          <header class="pf-card__head">
            <div>
              <h2>Actividad reciente</h2>
              <div class="pf-card__sub">Últimos eventos en todos los tenants</div>
            </div>
            <a href="#/audit" class="pf-btn pf-btn--ghost pf-btn--sm">Ver bitácora completa</a>
          </header>
          ${renderRecentList(data.recentAudit || [])}
        </div>
      `;
      $('#pf-refresh-kpis')?.addEventListener('click', () => operacion());
    } catch (e) {
      errorBlock(e.message);
    }
  }

  function renderRecentList(entries) {
    if (!entries.length) {
      return `<div class="pf-empty pf-empty--soft" style="padding:36px 20px;">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <h3>Sin actividad reciente</h3>
        <p>Cuando los tenants empiecen a operar verás los eventos aquí.</p>
      </div>`;
    }
    return `<ul class="pf-list">${entries.map(e => `
      <li class="pf-list__item pf-list__item--${actionVariant(e.action)}">
        <div class="pf-list__icon"><i class="fa-solid ${actionIcon(e.action)}"></i></div>
        <div>
          <div class="pf-list__title">${escapeHtml(actionLabel(e.action))}${e.targetLabel ? ` · <span style="color:var(--pf-text-mute);font-weight:400;">${escapeHtml(e.targetLabel)}</span>` : ''}</div>
          <div class="pf-list__sub">
            ${e.actorEmailMasked ? escapeHtml(e.actorEmailMasked) : '<em>sistema</em>'}
            ${e.organizationSlug ? ` · <span class="pf-pill">${escapeHtml(e.organizationSlug)}</span>` : ''}
          </div>
        </div>
        <div class="pf-list__time" title="${escapeHtml(fmtDate(e.createdAt))}">${escapeHtml(relTime(e.createdAt))}</div>
      </li>`).join('')}</ul>`;
  }

  // ============================================================
  // TENANTS
  // ============================================================
  let _tenantSearchTimer = null;
  async function tenants() {
    setPageTitle('Tenants', 'Organizaciones que viven en la plataforma');
    setTopbarActions(`
      <div class="pf-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" id="pf-tenants-q" placeholder="Buscar por nombre o slug" autocomplete="off" />
      </div>`);
    loader();
    await loadTenants('');
    $('#pf-tenants-q')?.addEventListener('input', (e) => {
      clearTimeout(_tenantSearchTimer);
      const q = e.target.value;
      _tenantSearchTimer = setTimeout(() => loadTenants(q), 220);
    });
  }

  async function loadTenants(q) {
    try {
      const url = '/api/platform/tenants' + (q ? `?q=${encodeURIComponent(q)}` : '');
      const data = await api('GET', url);
      const list = data.tenants || [];
      if (!list.length) {
        content().innerHTML = `
          <div class="pf-empty">
            <i class="fa-solid fa-building-circle-xmark"></i>
            <h3>${q ? 'Sin resultados' : 'Aún no hay tenants'}</h3>
            <p>${q ? 'Ajusta tu búsqueda.' : 'Cuando crees el primer tenant aparecerá aquí.'}</p>
          </div>`;
        return;
      }
      content().innerHTML = `
        <div class="pf-card">
          <div class="pf-table-wrap">
            <table class="pf-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Slug</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Usuarios</th>
                  <th>Asist. 30d</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(t => `
                  <tr class="is-clickable" data-id="${t.id}">
                    <td><strong>${escapeHtml(t.name || '—')}</strong></td>
                    <td><code>${escapeHtml(t.slug || '')}</code></td>
                    <td><span class="pf-tag pf-tag--${t.plan}">${escapeHtml(t.plan || '—')}</span></td>
                    <td><span class="pf-tag pf-tag--${t.status}">${escapeHtml(t.status || '—')}</span></td>
                    <td>${fmtNum(t.usersCount)}</td>
                    <td>${fmtNum(t.attendancesCount30d)}</td>
                    <td title="${escapeHtml(fmtDate(t.lastActivityAt))}">${escapeHtml(relTime(t.lastActivityAt))}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
      content().querySelectorAll('tr.is-clickable').forEach(tr => {
        tr.addEventListener('click', () => {
          window.location.hash = `#/tenants/${tr.dataset.id}`;
        });
      });
    } catch (e) {
      errorBlock(e.message);
    }
  }

  // ============================================================
  // TENANT DETAIL
  // ============================================================
  async function tenantDetail(id) {
    if (!id) return tenants();
    setPageTitle('Detalle del tenant', '');
    setTopbarActions(`
      <a href="#/tenants" class="pf-btn pf-btn--ghost pf-btn--sm">
        <i class="fa-solid fa-arrow-left"></i> Volver
      </a>`);
    loader();
    try {
      const data = await api('GET', '/api/platform/tenants/' + encodeURIComponent(id));
      renderTenantDetail(data);
    } catch (e) {
      errorBlock(e.message);
    }
  }

  function renderTenantDetail(data) {
    const t = data.tenant || {};
    const staff = data.staff || [];
    const audit = data.recentAudit || [];
    const isActive = t.status === 'active';
    const primary = t.primaryColor || '#1a237e';
    const secondary = t.secondaryColor || '#ff6f00';
    const tenantUrl = (t.customDomain && t.customDomainVerifiedAt)
      ? `https://${t.customDomain}`
      : `https://${t.slug}.contan2.com`;

    setPageTitle(t.name || 'Tenant', t.slug ? `${t.slug}.contan2.com` : '');

    content().innerHTML = `
      <div class="pf-detail-head">
        <div class="pf-tenant-logo" style="background:${escapeHtml(primary)}20;color:${escapeHtml(primary)};">
          ${t.logoUrl
            ? `<img src="${escapeHtml(t.logoUrl)}" alt="" />`
            : escapeHtml(initials(t.name))}
        </div>
        <div class="pf-detail-head__title">
          <div class="pf-detail-head__name">${escapeHtml(t.name || '—')}</div>
          <div class="pf-detail-head__line">
            <code>${escapeHtml(t.slug || '')}</code>
            <span class="pf-tag pf-tag--${t.plan}">${escapeHtml(t.plan || '—')}</span>
            <span class="pf-tag pf-tag--${t.status}">${escapeHtml(t.status || '—')}</span>
            ${t.customDomain ? `<span class="pf-pill"><i class="fa-solid fa-globe"></i> ${escapeHtml(t.customDomain)}${t.customDomainVerifiedAt ? ' ✓' : ' · pendiente'}</span>` : ''}
            <span style="color:var(--pf-text-dim);">creado ${escapeHtml(relTime(t.createdAt))}</span>
          </div>
        </div>
        <div class="pf-detail-head__actions">
          <a href="${escapeHtml(tenantUrl)}" target="_blank" rel="noopener" class="pf-btn pf-btn--ghost">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir panel
          </a>
          ${isActive
            ? `<button class="pf-btn pf-btn--danger" data-act="suspend">Suspender</button>`
            : `<button class="pf-btn pf-btn--primary" data-act="reactivate">Reactivar</button>`}
        </div>
      </div>

      <div class="pf-kpis">
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-users"></i> Usuarios</div>
          <div class="pf-kpi__value">${fmtNum(t.usersCount)}</div>
        </div>
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-clipboard-check"></i> Asistencias 30d</div>
          <div class="pf-kpi__value">${fmtNum(t.attendancesCount30d)}</div>
        </div>
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-calendar-day"></i> Actividades activas</div>
          <div class="pf-kpi__value">${fmtNum(t.activitiesActive)}</div>
        </div>
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-user-shield"></i> Staff</div>
          <div class="pf-kpi__value">${fmtNum(t.staffCount)}</div>
        </div>
      </div>

      <div class="pf-card__split">
        <div class="pf-card">
          <header class="pf-card__head">
            <h3>Identidad</h3>
          </header>
          <div class="pf-card__body--padded">
            <div class="pf-swatch-row">
              <span class="pf-swatch"><span class="pf-swatch__dot" style="background:${escapeHtml(primary)}"></span> Primario</span>
              <span class="pf-swatch"><span class="pf-swatch__dot" style="background:${escapeHtml(secondary)}"></span> Acento</span>
            </div>
            <div style="margin-top:14px;font-size:.86rem;color:var(--pf-text-mute);">
              Sidebar: <strong style="color:var(--pf-text);">${escapeHtml(t.sidebarStyle || '—')}</strong><br>
              Logo: ${t.logoUrl ? '<strong style="color:var(--pf-ok);">✓ configurado</strong>' : '<em>sin logo</em>'}<br>
              Custom domain: ${t.customDomain ? `${escapeHtml(t.customDomain)} ${t.customDomainVerifiedAt ? '<span class="pf-tag pf-tag--active">verificado</span>' : '<span class="pf-tag pf-tag--suspended">pendiente</span>'}` : '<em>—</em>'}
            </div>
          </div>
        </div>

        <div class="pf-card">
          <header class="pf-card__head">
            <h3>Staff (${staff.length})</h3>
          </header>
          ${staff.length ? `
            <div class="pf-table-wrap">
              <table class="pf-table">
                <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último login</th></tr></thead>
                <tbody>
                  ${staff.map(s => `
                    <tr>
                      <td>
                        <strong>${escapeHtml(s.fullName || '—')}</strong>
                        <div style="font-size:.78rem;color:var(--pf-text-mute);">${escapeHtml(s.email)}</div>
                      </td>
                      <td>${escapeHtml(s.role || '—')}</td>
                      <td><span class="pf-tag pf-tag--${s.status}">${escapeHtml(s.status || '—')}</span></td>
                      <td title="${escapeHtml(fmtDate(s.lastLoginAt))}">${escapeHtml(relTime(s.lastLoginAt))}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : `<div class="pf-empty" style="padding:32px;"><i class="fa-solid fa-user-slash"></i><p>Aún no hay staff registrado.</p></div>`}
        </div>
      </div>

      <div class="pf-card">
        <header class="pf-card__head">
          <h3>Actividad reciente del tenant</h3>
          <a href="#/audit?tenant=${encodeURIComponent(t.id)}" class="pf-btn pf-btn--ghost pf-btn--sm">Ver bitácora</a>
        </header>
        ${renderRecentList(audit)}
      </div>
    `;

    // Bind acciones
    content().querySelector('[data-act="suspend"]')?.addEventListener('click', async () => {
      const ok = await Modal.confirm({
        title: 'Suspender tenant',
        message: `Suspender "${t.name}" deshabilita el acceso de su staff. Esta acción se puede revertir.`,
        danger: true,
      });
      if (!ok) return;
      try {
        await api('POST', `/api/platform/tenants/${t.id}/suspend`);
        Toast.ok('Tenant suspendido');
        tenantDetail(t.id);
      } catch (e) { Toast.error(e.message); }
    });
    content().querySelector('[data-act="reactivate"]')?.addEventListener('click', async () => {
      try {
        await api('POST', `/api/platform/tenants/${t.id}/reactivate`);
        Toast.ok('Tenant reactivado');
        tenantDetail(t.id);
      } catch (e) { Toast.error(e.message); }
    });
  }

  function initials(name) {
    if (!name) return '··';
    return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  // ============================================================
  // AUDIT (cross-tenant)
  // ============================================================
  const AuditCtx = { entries: [], nextCursor: null, filters: { action: '', tenant: '', since: '', until: '' } };

  async function audit() {
    setPageTitle('Bitácora global', 'Eventos en todos los tenants');
    setTopbarActions('');
    loader();
    // Aprovechamos para cargar tenants una sola vez para el filtro
    try {
      const [logData, tenantsData] = await Promise.all([
        fetchAudit(true),
        api('GET', '/api/platform/tenants'),
      ]);
      const tenantOptions = (tenantsData.tenants || []).map(t =>
        `<option value="${t.id}" ${AuditCtx.filters.tenant === t.id ? 'selected' : ''}>${escapeHtml(t.name)} (${escapeHtml(t.slug)})</option>`,
      ).join('');
      content().innerHTML = `
        <div class="pf-filters">
          <select id="pf-f-action">
            <option value="">Todas las acciones</option>
            <option value="auth.">Auth</option>
            <option value="staff.">Staff</option>
            <option value="tenant.">Tenant</option>
            <option value="activity.">Actividades</option>
            <option value="branding.">Identidad</option>
            <option value="domain.">Dominio</option>
          </select>
          <select id="pf-f-tenant">
            <option value="">Todos los tenants</option>
            ${tenantOptions}
          </select>
          <input id="pf-f-since" type="date" value="${AuditCtx.filters.since}" />
          <span class="pf-dash">—</span>
          <input id="pf-f-until" type="date" value="${AuditCtx.filters.until}" />
          <button class="pf-btn pf-btn--ghost pf-btn--sm" id="pf-f-apply">Aplicar</button>
          ${(AuditCtx.filters.action || AuditCtx.filters.tenant || AuditCtx.filters.since || AuditCtx.filters.until)
            ? `<button class="pf-btn pf-btn--ghost pf-btn--sm" id="pf-f-clear">Limpiar</button>` : ''}
        </div>
        <div class="pf-card" id="pf-audit-host">${renderAuditList()}</div>`;

      // Si venimos con ?tenant=<id> en el hash, pre-aplicar
      const qs = (window.location.hash.split('?')[1] || '');
      const params = new URLSearchParams(qs);
      if (params.get('tenant')) {
        AuditCtx.filters.tenant = params.get('tenant');
        $('#pf-f-tenant').value = AuditCtx.filters.tenant;
        await applyFilters();
      }

      $('#pf-f-action').value = AuditCtx.filters.action;
      $('#pf-f-tenant').value = AuditCtx.filters.tenant;
      $('#pf-f-apply').addEventListener('click', applyFilters);
      $('#pf-f-clear')?.addEventListener('click', async () => {
        AuditCtx.filters = { action: '', tenant: '', since: '', until: '' };
        await audit();
      });
      bindMore();
    } catch (e) { errorBlock(e.message); }
  }

  async function applyFilters() {
    AuditCtx.filters.action = $('#pf-f-action').value;
    AuditCtx.filters.tenant = $('#pf-f-tenant').value;
    AuditCtx.filters.since = $('#pf-f-since').value;
    AuditCtx.filters.until = $('#pf-f-until').value;
    AuditCtx.nextCursor = null;
    try {
      await fetchAudit(true);
      $('#pf-audit-host').innerHTML = renderAuditList();
      bindMore();
    } catch (e) { Toast.error(e.message); }
  }

  async function fetchAudit(reset) {
    const p = new URLSearchParams({ limit: '50' });
    if (AuditCtx.filters.action) p.set('action', AuditCtx.filters.action);
    if (AuditCtx.filters.tenant) p.set('tenant', AuditCtx.filters.tenant);
    if (AuditCtx.filters.since)  p.set('since', new Date(AuditCtx.filters.since).toISOString());
    if (AuditCtx.filters.until)  p.set('until', new Date(AuditCtx.filters.until).toISOString());
    if (!reset && AuditCtx.nextCursor) p.set('before', AuditCtx.nextCursor);
    const data = await api('GET', '/api/platform/audit-log?' + p.toString());
    AuditCtx.nextCursor = data.nextCursor || null;
    AuditCtx.entries = reset ? (data.entries || []) : [...AuditCtx.entries, ...(data.entries || [])];
    return data;
  }

  function renderAuditList() {
    if (!AuditCtx.entries.length) {
      return `<div class="pf-empty"><i class="fa-solid fa-clipboard-list"></i><h3>Sin eventos</h3><p>Ajusta los filtros o espera a que ocurran acciones.</p></div>`;
    }
    return `<ul class="pf-list">${AuditCtx.entries.map(e => `
      <li class="pf-list__item pf-list__item--${actionVariant(e.action)}">
        <div class="pf-list__icon"><i class="fa-solid ${actionIcon(e.action)}"></i></div>
        <div>
          <div class="pf-list__title">${escapeHtml(actionLabel(e.action))}${e.targetLabel ? ` · <span style="color:var(--pf-text-mute);font-weight:400;">${escapeHtml(e.targetLabel)}</span>` : ''}</div>
          <div class="pf-list__sub">
            ${e.actorEmailMasked ? escapeHtml(e.actorEmailMasked) : '<em>sistema</em>'}
            ${e.organizationSlug ? ` · <span class="pf-pill">${escapeHtml(e.organizationSlug)}</span>` : ''}
            ${e.actorRole ? ` · <span style="color:var(--pf-text-dim);">${escapeHtml(e.actorRole)}</span>` : ''}
          </div>
        </div>
        <div class="pf-list__time" title="${escapeHtml(fmtDate(e.createdAt))}">${escapeHtml(relTime(e.createdAt))}</div>
      </li>`).join('')}</ul>
      ${AuditCtx.nextCursor ? `<div class="pf-more"><button class="pf-btn pf-btn--ghost" id="pf-audit-more">Cargar más</button></div>` : ''}`;
  }

  function bindMore() {
    const btn = $('#pf-audit-more');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Cargando…';
      try {
        await fetchAudit(false);
        $('#pf-audit-host').innerHTML = renderAuditList();
        bindMore();
      } catch (e) {
        Toast.error(e.message);
        btn.disabled = false;
        btn.textContent = 'Cargar más';
      }
    });
  }

  // ============================================================
  // ACCOUNT
  // ============================================================
  async function account() {
    setPageTitle('Mi cuenta', 'Datos personales, contraseña y sesiones activas');
    setTopbarActions('');
    loader();
    try {
      const [me, sessions] = await Promise.all([
        api('GET', '/api/platform/auth/me'),
        api('GET', '/api/platform/auth/sessions'),
      ]);
      State.admin = me.admin;
      content().innerHTML = `
        <div class="pf-card">
          <header class="pf-card__head"><h3>Tu cuenta</h3></header>
          <div class="pf-card__body--padded">
            <p style="margin:0 0 6px;color:var(--pf-text);"><strong>${escapeHtml(me.admin.fullName || '—')}</strong></p>
            <p style="margin:0;color:var(--pf-text-mute);font-size:.9rem;">${escapeHtml(me.admin.email)}</p>
            <p style="margin:10px 0 0;color:var(--pf-text-mute);font-size:.85rem;">
              Último login: ${escapeHtml(fmtDate(me.admin.lastLoginAt))}<br>
              Creada: ${escapeHtml(fmtDate(me.admin.createdAt))}
            </p>
            ${me.admin.mustChangePassword ? `<div style="margin-top:14px;padding:10px 14px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:8px;color:#fcd34d;font-size:.86rem;">
              Tu contraseña sigue siendo la temporal — cámbiala abajo.
            </div>` : ''}
          </div>
        </div>

        <div class="pf-card">
          <header class="pf-card__head"><h3>Cambiar contraseña</h3></header>
          <div class="pf-card__body--padded">
            <form id="pf-pass-form" autocomplete="off">
              <div class="pf-field">
                <label for="cur">Contraseña actual</label>
                <input id="cur" name="currentPassword" type="password" autocomplete="current-password" required />
              </div>
              <div class="pf-field">
                <label for="new">Nueva contraseña</label>
                <input id="new" name="newPassword" type="password" autocomplete="new-password" required minlength="10" />
              </div>
              <div class="pf-field">
                <label for="new2">Confirmar nueva contraseña</label>
                <input id="new2" name="confirmPassword" type="password" autocomplete="new-password" required minlength="10" />
              </div>
              <p id="pf-pass-msg" style="margin:6px 0 12px;font-size:.86rem;min-height:1em;"></p>
              <button type="submit" class="pf-btn pf-btn--primary">Actualizar contraseña</button>
            </form>
          </div>
        </div>

        <div class="pf-card">
          <header class="pf-card__head">
            <h3>Sesiones activas</h3>
            <div class="pf-card__sub" style="margin:0;">Tus sesiones abiertas en otros dispositivos</div>
          </header>
          ${renderSessions(sessions.sessions || [])}
        </div>
      `;
      bindAccount(me.admin);
    } catch (e) { errorBlock(e.message); }
  }

  function renderSessions(list) {
    if (!list.length) {
      return `<div class="pf-empty" style="padding:32px;"><i class="fa-solid fa-key"></i><p>Solo tu sesión actual.</p></div>`;
    }
    return `<div class="pf-table-wrap">
      <table class="pf-table">
        <thead><tr><th>Dispositivo</th><th>Creada</th><th>Expira</th><th style="width:1%"></th></tr></thead>
        <tbody>
          ${list.map(s => `
            <tr>
              <td>
                <strong>${s.current ? 'Esta sesión' : 'Otra sesión'}</strong>
                <div style="font-size:.78rem;color:var(--pf-text-mute);max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.userAgent || '—')}</div>
              </td>
              <td title="${escapeHtml(fmtDate(s.createdAt))}">${escapeHtml(relTime(s.createdAt))}</td>
              <td title="${escapeHtml(fmtDate(s.expiresAt))}">${escapeHtml(relTime(s.expiresAt))}</td>
              <td style="text-align:right;">${s.current
                ? '<span class="pf-tag pf-tag--active">Actual</span>'
                : `<button class="pf-btn pf-btn--ghost pf-btn--sm" data-revoke="${s.id}">Cerrar</button>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function bindAccount(admin) {
    const form = $('#pf-pass-form');
    const msg = $('#pf-pass-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      msg.style.color = '';
      const cur = form.currentPassword.value;
      const nw = form.newPassword.value;
      const c2 = form.confirmPassword.value;
      if (nw !== c2) {
        msg.style.color = 'var(--pf-danger)';
        msg.textContent = 'La confirmación no coincide.';
        return;
      }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Actualizando…';
      try {
        await api('POST', '/api/platform/auth/change-password', {
          currentPassword: cur, newPassword: nw,
        });
        Toast.ok('Contraseña actualizada');
        msg.style.color = 'var(--pf-ok)';
        msg.textContent = 'Listo. Otras sesiones fueron cerradas.';
        form.reset();
        $('#pf-must-change-banner').hidden = true;
        // Refresh sesiones list
        setTimeout(account, 800);
      } catch (e) {
        msg.style.color = 'var(--pf-danger)';
        msg.textContent = e.message || 'No se pudo actualizar.';
      } finally {
        btn.disabled = false; btn.textContent = 'Actualizar contraseña';
      }
    });

    content().querySelectorAll('[data-revoke]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.revoke;
        const ok = await Modal.confirm({ title: 'Cerrar sesión', message: '¿Cerrar esta sesión en otro dispositivo?' });
        if (!ok) return;
        try {
          await api('DELETE', `/api/platform/auth/sessions/${id}`);
          Toast.ok('Sesión cerrada');
          account();
        } catch (e) { Toast.error(e.message); }
      });
    });
  }

  // ============================================================
  // Expose
  // ============================================================
  window.PFViews = { operacion, tenants, tenantDetail, audit, account };
})();
