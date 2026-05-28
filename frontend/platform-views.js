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
  const TenantsCtx = {
    raw: [],
    q: '',
    status: '',      // '' | 'active' | 'suspended' | 'trial' | 'deleted'
    plan: '',        // '' | 'free' | 'pro' | 'enterprise'
    sortKey: 'lastActivityAt',
    sortDir: 'desc',
    density: 'comfortable', // 'comfortable' | 'compact'
    loaded: false,
  };

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('pf:tenants:prefs') || '{}');
      if (p.status) TenantsCtx.status = p.status;
      if (p.plan) TenantsCtx.plan = p.plan;
      if (p.sortKey) TenantsCtx.sortKey = p.sortKey;
      if (p.sortDir) TenantsCtx.sortDir = p.sortDir;
      if (p.density) TenantsCtx.density = p.density;
    } catch {}
  }
  function savePrefs() {
    try {
      localStorage.setItem('pf:tenants:prefs', JSON.stringify({
        status: TenantsCtx.status, plan: TenantsCtx.plan,
        sortKey: TenantsCtx.sortKey, sortDir: TenantsCtx.sortDir,
        density: TenantsCtx.density,
      }));
    } catch {}
  }

  /**
   * Health signal por tenant. Devuelve { level, label, hint }.
   *   ok     verde  — operación activa
   *   warn   ámbar  — algo a revisar (stale, dominio pendiente)
   *   risk   rojo   — riesgo alto (suspendido, trial vence pronto)
   *   off    gris   — eliminado o pre-uso
   */
  function healthOf(t) {
    if (t.status === 'deleted') return { level: 'off', label: 'Eliminado', hint: 'Tenant marcado como eliminado.' };
    if (t.status === 'suspended') return { level: 'risk', label: 'Suspendido', hint: 'Sin acceso para el staff de este tenant.' };

    const flags = [];
    if (t.trialEndsAt) {
      const daysLeft = Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 86400000);
      if (daysLeft <= 0) flags.push({ level: 'risk', label: 'Trial vencido', hint: 'El trial terminó.' });
      else if (daysLeft <= 7) flags.push({ level: 'warn', label: `Trial: ${daysLeft}d`, hint: `Quedan ${daysLeft} días de trial.` });
    }
    if (t.customDomain && !t.customDomainVerifiedAt) {
      flags.push({ level: 'warn', label: 'DNS pendiente', hint: `Dominio ${t.customDomain} no verificado.` });
    }
    const lastTs = t.lastActivityAt ? new Date(t.lastActivityAt).getTime() : 0;
    if (lastTs) {
      const days = (Date.now() - lastTs) / 86400000;
      if (days >= 30) flags.push({ level: 'warn', label: 'Inactivo 30d+', hint: 'Sin actividad relevante en 30 días.' });
      else if (days >= 14) flags.push({ level: 'warn', label: 'Inactivo 14d+', hint: 'Sin actividad relevante en 14 días.' });
    } else {
      flags.push({ level: 'warn', label: 'Sin uso', hint: 'Tenant nunca ha tenido actividad operativa.' });
    }
    if (!flags.length) return { level: 'ok', label: 'Operando', hint: 'Tenant activo con uso reciente.' };
    // Si hay varias warns y al menos una risk, priorizar risk
    const risk = flags.find(f => f.level === 'risk');
    if (risk) return risk;
    return flags[0];
  }

  function applyFiltersAndSort() {
    const q = TenantsCtx.q.trim().toLowerCase();
    let list = TenantsCtx.raw.slice();
    if (q) {
      list = list.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.slug || '').toLowerCase().includes(q) ||
        (t.customDomain || '').toLowerCase().includes(q),
      );
    }
    if (TenantsCtx.status === 'trial') {
      list = list.filter(t => !!t.trialEndsAt && new Date(t.trialEndsAt) > new Date());
    } else if (TenantsCtx.status) {
      list = list.filter(t => t.status === TenantsCtx.status);
    }
    if (TenantsCtx.plan) {
      list = list.filter(t => t.plan === TenantsCtx.plan);
    }

    const dir = TenantsCtx.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const k = TenantsCtx.sortKey;
      const av = a[k], bv = b[k];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      const as = String(av), bs = String(bv);
      if (/^\d{4}-\d{2}-\d{2}T/.test(as) && /^\d{4}-\d{2}-\d{2}T/.test(bs)) {
        return (new Date(as) - new Date(bs)) * dir;
      }
      return as.localeCompare(bs, 'es') * dir;
    });
    return list;
  }

  function tenantInitials(name) {
    if (!name) return '··';
    return String(name).trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  function brandSwatch(t) {
    const primary = t.primaryColor || '#1a237e';
    const accent = t.secondaryColor || '#ff6f00';
    if (t.logoUrl) {
      return `<div class="pf-tenant-cell__avatar" style="background:${escapeHtml(primary)};">
        <img src="${escapeHtml(t.logoUrl)}" alt="" />
      </div>`;
    }
    return `<div class="pf-tenant-cell__avatar" style="background:linear-gradient(135deg, ${escapeHtml(primary)} 0%, ${escapeHtml(accent)} 100%);">${escapeHtml(tenantInitials(t.name))}</div>`;
  }

  function domainBadge(t) {
    if (t.customDomain && t.customDomainVerifiedAt) {
      return `<span class="pf-mini-pill pf-mini-pill--ok" title="${escapeHtml(t.customDomain)} verificado">
        <i class="fa-solid fa-globe"></i> ${escapeHtml(t.customDomain)}
      </span>`;
    }
    if (t.customDomain) {
      return `<span class="pf-mini-pill pf-mini-pill--warn" title="DNS sin verificar">
        <i class="fa-solid fa-globe"></i> ${escapeHtml(t.customDomain)}
      </span>`;
    }
    return `<span class="pf-mini-pill pf-mini-pill--mute"><i class="fa-solid fa-link"></i> ${escapeHtml(t.slug || '')}.contan2.com</span>`;
  }

  function tenantUrl(t) {
    if (t.customDomain && t.customDomainVerifiedAt) return `https://${t.customDomain}`;
    return `https://${t.slug}.contan2.com`;
  }

  function renderKpiStrip() {
    const list = TenantsCtx.raw;
    const total = list.length;
    const active = list.filter(t => t.status === 'active').length;
    const suspended = list.filter(t => t.status === 'suspended').length;
    const trial = list.filter(t => t.trialEndsAt && new Date(t.trialEndsAt) > new Date()).length;
    const att30 = list.reduce((s, t) => s + (t.attendancesCount30d || 0), 0);
    const users = list.reduce((s, t) => s + (t.usersCount || 0), 0);
    const planCounts = list.reduce((acc, t) => {
      acc[t.plan] = (acc[t.plan] || 0) + 1; return acc;
    }, {});
    const distroParts = [];
    if (planCounts.enterprise) distroParts.push(`<span class="pf-plan-dot pf-plan-dot--enterprise"></span> ${planCounts.enterprise} ent.`);
    if (planCounts.pro)        distroParts.push(`<span class="pf-plan-dot pf-plan-dot--pro"></span> ${planCounts.pro} pro`);
    if (planCounts.free)       distroParts.push(`<span class="pf-plan-dot pf-plan-dot--free"></span> ${planCounts.free} free`);

    return `
      <div class="pf-kpis pf-kpis--compact">
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-building"></i> Total</div>
          <div class="pf-kpi__value">${fmtNum(total)}</div>
          <div class="pf-kpi__delta">${distroParts.join(' · ') || '—'}</div>
        </div>
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-circle-check"></i> Activos</div>
          <div class="pf-kpi__value" style="color:#34d399;">${fmtNum(active)}</div>
          <div class="pf-kpi__delta">${suspended ? `${suspended} suspendidos` : 'sin suspensiones'}</div>
        </div>
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-hourglass-half"></i> En trial</div>
          <div class="pf-kpi__value">${fmtNum(trial)}</div>
          <div class="pf-kpi__delta">${trial ? 'requieren follow-up' : 'sin trials abiertos'}</div>
        </div>
        <div class="pf-kpi">
          <div class="pf-kpi__label"><i class="fa-solid fa-users"></i> Audiencia total</div>
          <div class="pf-kpi__value">${fmtNum(users)}</div>
          <div class="pf-kpi__delta">${fmtNum(att30)} asistencias 30d</div>
        </div>
      </div>`;
  }

  function renderFilterBar() {
    const tab = (val, label, count) => `
      <button type="button" class="pf-pill-tab ${TenantsCtx.status === val ? 'is-active' : ''}" data-status="${val}">
        ${label}${count != null ? ` <span class="pf-pill-tab__count">${fmtNum(count)}</span>` : ''}
      </button>`;
    const counts = TenantsCtx.raw.reduce((acc, t) => {
      acc.active += t.status === 'active' ? 1 : 0;
      acc.suspended += t.status === 'suspended' ? 1 : 0;
      acc.trial += (t.trialEndsAt && new Date(t.trialEndsAt) > new Date()) ? 1 : 0;
      return acc;
    }, { active: 0, suspended: 0, trial: 0 });
    return `
      <div class="pf-filters pf-filters--tenants">
        <div class="pf-pill-tabs" role="tablist">
          ${tab('', 'Todos', TenantsCtx.raw.length)}
          ${tab('active', 'Activos', counts.active)}
          ${tab('trial', 'En trial', counts.trial)}
          ${tab('suspended', 'Suspendidos', counts.suspended)}
        </div>
        <select id="pf-plan-filter" aria-label="Filtrar por plan">
          <option value="">Todos los planes</option>
          <option value="enterprise" ${TenantsCtx.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
          <option value="pro" ${TenantsCtx.plan === 'pro' ? 'selected' : ''}>Pro</option>
          <option value="free" ${TenantsCtx.plan === 'free' ? 'selected' : ''}>Free</option>
        </select>
        <div class="pf-filters__spacer"></div>
        <div class="pf-density" role="group" aria-label="Densidad">
          <button type="button" class="pf-density__btn ${TenantsCtx.density === 'comfortable' ? 'is-active' : ''}" data-density="comfortable" title="Cómodo">
            <i class="fa-solid fa-bars"></i>
          </button>
          <button type="button" class="pf-density__btn ${TenantsCtx.density === 'compact' ? 'is-active' : ''}" data-density="compact" title="Compacto">
            <i class="fa-solid fa-grip-lines"></i>
          </button>
        </div>
      </div>`;
  }

  const COLS = [
    { key: 'name',                 label: 'Tenant',          sortable: true,  align: 'left'  },
    { key: 'plan',                 label: 'Plan',            sortable: true,  align: 'left'  },
    { key: 'status',               label: 'Salud',           sortable: false, align: 'left'  },
    { key: 'usersCount',           label: 'Usuarios',        sortable: true,  align: 'right' },
    { key: 'attendancesCount30d',  label: 'Asist. 30d',      sortable: true,  align: 'right' },
    { key: 'staffCount',           label: 'Staff',           sortable: true,  align: 'right' },
    { key: 'lastActivityAt',       label: 'Última actividad',sortable: true,  align: 'left'  },
    { key: '_actions',             label: '',                sortable: false, align: 'right' },
  ];

  function renderTable(list) {
    const compact = TenantsCtx.density === 'compact';
    return `
      <div class="pf-card pf-card--scroll-x">
        <div class="pf-table-wrap">
          <table class="pf-table pf-table--tenants ${compact ? 'is-compact' : ''}">
            <thead>
              <tr>
                ${COLS.map(c => {
                  if (!c.sortable) return `<th class="${c.align === 'right' ? 'is-right' : ''}">${escapeHtml(c.label)}</th>`;
                  const isActive = TenantsCtx.sortKey === c.key;
                  const arrow = isActive ? (TenantsCtx.sortDir === 'asc' ? '▲' : '▼') : '';
                  return `<th class="pf-th-sort ${c.align === 'right' ? 'is-right' : ''} ${isActive ? 'is-active' : ''}" data-sort="${c.key}">
                    ${escapeHtml(c.label)} <span class="pf-th-arrow">${arrow}</span>
                  </th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${list.map(t => renderTenantRow(t)).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function renderTenantRow(t) {
    const h = healthOf(t);
    return `
      <tr class="is-clickable" data-id="${escapeHtml(t.id)}">
        <td>
          <div class="pf-tenant-cell">
            ${brandSwatch(t)}
            <div class="pf-tenant-cell__meta">
              <div class="pf-tenant-cell__name">${escapeHtml(t.name || '—')}</div>
              <div class="pf-tenant-cell__sub">
                <code>${escapeHtml(t.slug || '')}</code>
                ${domainBadge(t)}
              </div>
            </div>
          </div>
        </td>
        <td><span class="pf-tag pf-tag--${escapeHtml(t.plan)}">${escapeHtml(t.plan || '—')}</span></td>
        <td>
          <span class="pf-health pf-health--${h.level}" title="${escapeHtml(h.hint)}">
            <span class="pf-health__dot"></span>${escapeHtml(h.label)}
          </span>
        </td>
        <td class="is-right">${fmtNum(t.usersCount)}</td>
        <td class="is-right">${fmtNum(t.attendancesCount30d)}</td>
        <td class="is-right">${fmtNum(t.staffCount)}</td>
        <td title="${escapeHtml(fmtDate(t.lastActivityAt))}">${escapeHtml(relTime(t.lastActivityAt))}</td>
        <td class="is-right">
          <div class="pf-row-actions" data-row-actions>
            <button type="button" class="pf-icon-btn" data-act="menu" aria-label="Acciones">
              <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }

  function rowActionsMenu(t) {
    const isActive = t.status === 'active';
    return `
      <div class="pf-popover" id="pf-row-menu">
        <a class="pf-popover__item" href="#/tenants/${escapeHtml(t.id)}">
          <i class="fa-solid fa-eye"></i> Ver detalle
        </a>
        <a class="pf-popover__item" href="${escapeHtml(tenantUrl(t))}" target="_blank" rel="noopener"
           title="Requiere credencial staff del tenant. La sesión super admin no se comparte por seguridad.">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir panel del tenant
        </a>
        <button class="pf-popover__item" data-action="copy-url" data-url="${escapeHtml(tenantUrl(t))}">
          <i class="fa-solid fa-copy"></i> Copiar URL
        </button>
        <div class="pf-popover__sep"></div>
        ${t.status === 'deleted' ? '' : (isActive
          ? `<button class="pf-popover__item pf-popover__item--danger" data-action="suspend">
              <i class="fa-solid fa-ban"></i> Suspender
            </button>`
          : `<button class="pf-popover__item" data-action="reactivate">
              <i class="fa-solid fa-rotate-left"></i> Reactivar
            </button>`)}
      </div>`;
  }

  function closePopover() {
    document.getElementById('pf-row-menu')?.remove();
  }

  function bindTenantsUI() {
    const root = content();

    // Tabs
    root.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        TenantsCtx.status = btn.dataset.status;
        savePrefs();
        rerender(true);
      });
    });

    // Plan select
    root.querySelector('#pf-plan-filter')?.addEventListener('change', (e) => {
      TenantsCtx.plan = e.target.value;
      savePrefs();
      rerender(true);
    });

    // Density
    root.querySelectorAll('[data-density]').forEach(btn => {
      btn.addEventListener('click', () => {
        TenantsCtx.density = btn.dataset.density;
        savePrefs();
        rerender();
      });
    });

    // Sort headers
    root.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (TenantsCtx.sortKey === k) {
          TenantsCtx.sortDir = TenantsCtx.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          TenantsCtx.sortKey = k;
          TenantsCtx.sortDir = ['name', 'plan'].includes(k) ? 'asc' : 'desc';
        }
        savePrefs();
        rerender();
      });
    });

    // Row click → detalle (excepto si clickeas en el menú)
    root.querySelectorAll('tr.is-clickable').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-row-actions]')) return;
        window.location.hash = `#/tenants/${tr.dataset.id}`;
      });
    });

    // Row menu
    root.querySelectorAll('[data-row-actions] [data-act="menu"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = btn.closest('tr');
        const tenant = TenantsCtx.raw.find(x => x.id === tr.dataset.id);
        if (!tenant) return;
        closePopover();
        const wrapper = btn.closest('[data-row-actions]');
        wrapper.insertAdjacentHTML('beforeend', rowActionsMenu(tenant));
        bindPopoverActions(tenant);
      });
    });

    // Cierra popover al clickear afuera
    document.addEventListener('click', closePopover, { once: true });
  }

  function bindPopoverActions(tenant) {
    const menu = document.getElementById('pf-row-menu');
    if (!menu) return;
    menu.addEventListener('click', e => e.stopPropagation());

    menu.querySelector('[data-action="copy-url"]')?.addEventListener('click', async (e) => {
      const url = e.currentTarget.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        Toast.ok('URL copiada');
      } catch {
        Toast.error('No se pudo copiar');
      }
      closePopover();
    });

    menu.querySelector('[data-action="suspend"]')?.addEventListener('click', async () => {
      closePopover();
      const ok = await Modal.confirm({
        title: 'Suspender tenant',
        message: `Suspender "${tenant.name}" deshabilita el acceso de su staff. Esta acción se puede revertir.`,
        danger: true,
      });
      if (!ok) return;
      try {
        await api('POST', `/api/platform/tenants/${tenant.id}/suspend`);
        Toast.ok('Tenant suspendido');
        await loadTenantsData();
        rerender();
      } catch (e) { Toast.error(e.message); }
    });

    menu.querySelector('[data-action="reactivate"]')?.addEventListener('click', async () => {
      closePopover();
      try {
        await api('POST', `/api/platform/tenants/${tenant.id}/reactivate`);
        Toast.ok('Tenant reactivado');
        await loadTenantsData();
        rerender();
      } catch (e) { Toast.error(e.message); }
    });
  }

  function downloadCsv() {
    const list = applyFiltersAndSort();
    const rows = [
      ['Nombre', 'Slug', 'Plan', 'Estado', 'Custom domain', 'Dominio verificado',
       'Usuarios', 'Asist 30d', 'Asist 7d', 'Actividades activas', 'Staff',
       'Última actividad', 'Último login staff', 'Creado'],
      ...list.map(t => [
        t.name || '', t.slug || '', t.plan || '', t.status || '',
        t.customDomain || '', t.customDomainVerifiedAt ? 'sí' : 'no',
        t.usersCount ?? '', t.attendancesCount30d ?? '', t.attendancesCount7d ?? '',
        t.activitiesActive ?? '', t.staffCount ?? '',
        t.lastActivityAt || '', t.lastStaffLoginAt || '',
        t.createdAt || '',
      ]),
    ];
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    Toast.ok(`CSV con ${list.length} tenant${list.length === 1 ? '' : 's'} listo`);
  }

  function renderSkeleton() {
    const rows = Array(4).fill(0).map(() => `
      <tr class="pf-skel-row">
        <td><div class="pf-skel pf-skel--avatar"></div><div class="pf-skel pf-skel--line" style="width:60%"></div></td>
        <td><div class="pf-skel pf-skel--line" style="width:48px"></div></td>
        <td><div class="pf-skel pf-skel--line" style="width:80px"></div></td>
        <td class="is-right"><div class="pf-skel pf-skel--line" style="width:40px;margin-left:auto;"></div></td>
        <td class="is-right"><div class="pf-skel pf-skel--line" style="width:40px;margin-left:auto;"></div></td>
        <td class="is-right"><div class="pf-skel pf-skel--line" style="width:30px;margin-left:auto;"></div></td>
        <td><div class="pf-skel pf-skel--line" style="width:80px"></div></td>
        <td></td>
      </tr>`).join('');
    return `
      <div class="pf-kpis pf-kpis--compact">
        ${Array(4).fill(0).map(() => `
          <div class="pf-kpi">
            <div class="pf-skel pf-skel--line" style="width:60%;margin-bottom:8px;"></div>
            <div class="pf-skel pf-skel--line pf-skel--big" style="width:30%;"></div>
          </div>`).join('')}
      </div>
      <div class="pf-card">
        <div class="pf-table-wrap">
          <table class="pf-table pf-table--tenants">
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  let _tenantSearchTimer = null;

  async function tenants() {
    loadPrefs();
    setPageTitle('Tenants', 'Organizaciones que viven en la plataforma');
    setTopbarActions(`
      <div class="pf-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" id="pf-tenants-q" placeholder="Buscar nombre, slug o dominio" autocomplete="off" />
      </div>
      <button class="pf-btn pf-btn--ghost pf-btn--sm" id="pf-export-btn" title="Exportar CSV">
        <i class="fa-solid fa-file-csv"></i> Exportar
      </button>
      <button class="pf-btn pf-btn--primary pf-btn--sm" id="pf-new-tenant-btn" disabled title="Self-service de signup llega en Sprint 5">
        <i class="fa-solid fa-plus"></i> Nuevo tenant
      </button>
    `);

    if (!TenantsCtx.loaded) {
      content().innerHTML = renderSkeleton();
    }

    try {
      await loadTenantsData();
      rerender();
    } catch (e) {
      errorBlock(e.message);
      return;
    }

    // Topbar bindings
    document.getElementById('pf-tenants-q').value = TenantsCtx.q;
    document.getElementById('pf-tenants-q').addEventListener('input', (e) => {
      clearTimeout(_tenantSearchTimer);
      _tenantSearchTimer = setTimeout(() => {
        TenantsCtx.q = e.target.value;
        rerender();
      }, 180);
    });
    document.getElementById('pf-export-btn').addEventListener('click', downloadCsv);
  }

  async function loadTenantsData() {
    const data = await api('GET', '/api/platform/tenants');
    TenantsCtx.raw = data.tenants || [];
    TenantsCtx.loaded = true;
  }

  function rerender() {
    const list = applyFiltersAndSort();

    if (!TenantsCtx.raw.length) {
      content().innerHTML = `
        ${renderKpiStrip()}
        <div class="pf-empty">
          <i class="fa-solid fa-building-circle-xmark"></i>
          <h3>Aún no hay tenants</h3>
          <p>Cuando crees el primero, aparecerá aquí.</p>
        </div>`;
      return;
    }

    if (!list.length) {
      content().innerHTML = `
        ${renderKpiStrip()}
        ${renderFilterBar()}
        <div class="pf-empty">
          <i class="fa-solid fa-filter-circle-xmark"></i>
          <h3>Ningún tenant cumple los filtros</h3>
          <p>Limpia o ajusta los filtros para ver más resultados.</p>
          <button class="pf-btn pf-btn--ghost pf-btn--sm" id="pf-clear-filters">Limpiar filtros</button>
        </div>`;
      bindTenantsUI();
      document.getElementById('pf-clear-filters')?.addEventListener('click', () => {
        TenantsCtx.q = '';
        TenantsCtx.status = '';
        TenantsCtx.plan = '';
        const input = document.getElementById('pf-tenants-q');
        if (input) input.value = '';
        savePrefs();
        rerender();
      });
      return;
    }

    content().innerHTML = `
      ${renderKpiStrip()}
      ${renderFilterBar()}
      ${renderTable(list)}
      <div class="pf-table-foot">
        Mostrando <strong>${fmtNum(list.length)}</strong> de ${fmtNum(TenantsCtx.raw.length)} tenant${TenantsCtx.raw.length === 1 ? '' : 's'}
      </div>
    `;
    bindTenantsUI();
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
          <a href="${escapeHtml(tenantUrl)}" target="_blank" rel="noopener" class="pf-btn pf-btn--ghost"
             title="Requiere credencial staff del tenant. La sesión super admin no se comparte por seguridad.">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir panel del tenant
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
