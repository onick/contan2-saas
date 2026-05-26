// =============================================================================
// staff-admin.js · vista "Mi equipo" (#/staff)
// Variante D (mix A+B): pill tabs por status, pending bar expandible,
// miembros agrupados por rol como cards horizontales, modal de invitar
// disparado desde topbar.
// Requiere `app.js` ya cargado (depende de State, Modal, Toast, Utils).
// =============================================================================

(function () {
  const ROLES = [
    { value: 'owner',    label: 'Propietario(a)',     short: 'Propietaria',   desc: 'Permisos totales · transferir ownership.' },
    { value: 'admin',    label: 'Administrador(a)',   short: 'Administrador', desc: 'Gestiona staff, branding, dominio. No elimina.' },
    { value: 'operator', label: 'Operador(a)',        short: 'Operador',      desc: 'Check-in, registro de visitantes y consulta.' },
  ];
  const ROLE_GROUPS = [
    { role: 'owner',    title: 'Propietarios',     hint: 'Permisos totales · incluye transferir ownership' },
    { role: 'admin',    title: 'Administradores',  hint: 'Gestionan staff, branding, dominio · no eliminan' },
    { role: 'operator', title: 'Operadores',       hint: 'Check-in, registro de visitantes y consulta de actividades' },
  ];

  function roleLabel(r) {
    const m = ROLES.find(x => x.value === r);
    return m ? m.label : r;
  }
  function roleShort(r) {
    const m = ROLES.find(x => x.value === r);
    return m ? m.short : r;
  }
  function roleIcon(r) {
    if (r === 'owner') return 'fa-solid fa-shield-halved';
    if (r === 'admin') return 'fa-solid fa-user-gear';
    return 'fa-regular fa-user';
  }

  function relTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) {
      const mins = Math.round(-diff / 60000);
      if (mins < 60) return `en ${mins} min`;
      const hrs = Math.round(mins / 60);
      return `en ${hrs} h`;
    }
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'recién';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.round(hrs / 24);
    return `hace ${days} d`;
  }
  function isLive(iso) {
    if (!iso) return false;
    return (Date.now() - new Date(iso).getTime()) < 5 * 60_000; // últimos 5 min
  }

  // Hash determinista nombre → color HSL. Saturación/luminosidad acotadas para
  // que se vea cohesivo con el branding del tenant.
  function avatarColor(seed) {
    const s = String(seed || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFFFFFF;
    const hue = Math.abs(h) % 360;
    return `hsl(${hue}, 45%, 42%)`;
  }
  function avatarInitials(name) {
    if (!name) return '··';
    return String(name).trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  // ============================================================
  // API
  // ============================================================
  async function fetchMembers() {
    const res = await fetch('/api/staff/members', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('No se pudo cargar el equipo');
    const data = await res.json();
    return data.members || [];
  }
  async function fetchInvitations() {
    const res = await fetch('/api/staff/invitations', { credentials: 'same-origin' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.invitations || [];
  }
  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  async function deleteUrl(url) {
    const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ============================================================
  // State (local)
  // ============================================================
  const Ctx = {
    members: [],
    invitations: [],
    statusFilter: 'all', // all | owner | admin | operator | suspended
    pendingExpanded: false,
  };

  function pendingInvites() {
    return Ctx.invitations.filter(i => i.status === 'pending');
  }
  function memberById(id) {
    return Ctx.members.find(m => m.id === id);
  }
  function urgentInvite() {
    // El que vence más pronto
    const list = pendingInvites().slice().sort((a, b) =>
      new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    return list[0] || null;
  }

  // ============================================================
  // RENDER pieces
  // ============================================================
  function renderTopbar() {
    const total = Ctx.members.length;
    const pending = pendingInvites().length;
    document.getElementById('page-subtitle').textContent =
      `${total} ${total === 1 ? 'persona' : 'personas'} con acceso al panel` +
      (pending ? ` · ${pending} ${pending === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}` : '');

    document.getElementById('topbar-actions').innerHTML = `
      <button class="btn btn--primary" id="staff-open-invite-btn">
        <i class="fa-solid fa-user-plus"></i> Invitar persona
      </button>`;
    document.getElementById('staff-open-invite-btn')
      .addEventListener('click', () => openInviteModal());
  }

  function renderPills() {
    const counts = {
      all: Ctx.members.length,
      owner: Ctx.members.filter(m => m.role === 'owner' && m.status !== 'suspended').length,
      admin: Ctx.members.filter(m => m.role === 'admin' && m.status !== 'suspended').length,
      operator: Ctx.members.filter(m => m.role === 'operator' && m.status !== 'suspended').length,
      suspended: Ctx.members.filter(m => m.status === 'suspended').length,
    };
    const pill = (val, label, n) => `
      <button type="button" class="staff-pill ${Ctx.statusFilter === val ? 'is-active' : ''}" data-pill="${val}">
        ${Utils.escapeHtml(label)} <span class="staff-pill__n">${n}</span>
      </button>`;
    return `
      <div class="staff-pills" role="tablist">
        ${pill('all', 'Todos', counts.all)}
        ${pill('owner', 'Propietarios', counts.owner)}
        ${pill('admin', 'Administradores', counts.admin)}
        ${pill('operator', 'Operadores', counts.operator)}
        ${pill('suspended', 'Suspendidos', counts.suspended)}
      </div>`;
  }

  function renderPendingBar() {
    const pend = pendingInvites();
    if (!pend.length) return '';
    const urgent = urgentInvite();
    const urgentTime = relTime(urgent.expiresAt);
    const urgentEmail = urgent.email.length > 32 ? urgent.email.slice(0, 30) + '…' : urgent.email;
    const avatars = pend.slice(0, 4).map(i => `
      <div class="staff-pending__av" style="background:${avatarColor(i.email)}">
        ${Utils.escapeHtml(avatarInitials(i.email))}
      </div>`).join('');

    return `
      <div class="staff-pending" id="staff-pending-bar" ${Ctx.pendingExpanded ? 'hidden' : ''}>
        <div class="staff-pending__icon"><i class="fa-solid fa-envelope-open-text"></i></div>
        <div class="staff-pending__main">
          <div class="staff-pending__title">${pend.length} ${pend.length === 1 ? 'invitación esperando respuesta' : 'invitaciones esperando respuesta'}</div>
          <div class="staff-pending__sub">La próxima expira <strong>${Utils.escapeHtml(urgentTime)}</strong> · enviada a ${Utils.escapeHtml(urgentEmail)}</div>
        </div>
        <div class="staff-pending__avatars">${avatars}</div>
        <button class="btn btn--ghost btn--sm" data-pending="toggle">Ver invitaciones</button>
      </div>
      <div class="staff-pending-expanded ${Ctx.pendingExpanded ? 'is-open' : ''}" id="staff-pending-expanded">
        <div class="staff-pending-expanded__head">
          <h3>Invitaciones pendientes</h3>
          <span class="staff-pending-expanded__count">${pend.length}</span>
          <button type="button" class="staff-icon-btn staff-pending-expanded__close" data-pending="toggle" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        ${pend.map(inv => renderInvitationRow(inv)).join('')}
      </div>`;
  }

  function renderInvitationRow(inv) {
    const urgent = (new Date(inv.expiresAt).getTime() - Date.now()) < 12 * 3600_000;
    const invitedBy = inv.invitedByStaffId
      ? (memberById(inv.invitedByStaffId)?.fullName || '—')
      : 'sistema';
    return `
      <div class="staff-pi-row">
        <div class="staff-pi-row__av" style="background:${avatarColor(inv.email)}">
          ${Utils.escapeHtml(avatarInitials(inv.email))}
        </div>
        <div class="staff-pi-row__main">
          <div class="staff-pi-row__email">${Utils.escapeHtml(inv.email)}</div>
          <div class="staff-pi-row__meta">
            ${Utils.escapeHtml(roleShort(inv.role))} ·
            invitada por ${Utils.escapeHtml(invitedBy)} ·
            enviada ${Utils.escapeHtml(relTime(inv.createdAt))}
          </div>
        </div>
        <div class="staff-pi-row__time ${urgent ? 'is-urgent' : ''}">
          <i class="fa-regular fa-clock"></i> ${Utils.escapeHtml(relTime(inv.expiresAt))}
        </div>
        <div class="staff-pi-row__acts">
          <button class="staff-icon-btn" title="Reenviar" data-action="resend-invite" data-id="${inv.id}">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          <button class="staff-icon-btn" title="Revocar" data-action="revoke-invite" data-id="${inv.id}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>`;
  }

  function renderMemberCard(m, currentRole, currentId) {
    const isSelf = m.id === currentId;
    const isSuspended = m.status === 'suspended';
    const live = isLive(m.lastLoginAt) && !isSuspended;
    const canManage = !isSelf && (currentRole === 'owner' || (currentRole === 'admin' && m.role !== 'owner'));
    const canDelete = !isSelf && currentRole === 'owner' && m.status !== 'deleted';

    const lastLine = isSuspended
      ? `<span>sin acceso desde ${relTime(m.lastLoginAt)}</span>`
      : live
        ? `<span class="staff-live">activo ahora</span><span class="staff-sep">·</span><span>se unió ${relTime(m.createdAt)}</span>`
        : `<span>última sesión ${relTime(m.lastLoginAt)}</span><span class="staff-sep">·</span><span>se unió ${relTime(m.createdAt)}</span>`;

    const roleLabelInline = isSuspended
      ? `<span class="staff-role staff-role--suspended"><i class="fa-solid fa-ban"></i> Suspendido</span>`
      : `<span class="staff-role staff-role--${m.role}"><i class="${roleIcon(m.role)}"></i> ${Utils.escapeHtml(roleShort(m.role))}</span>`;

    const actions = canManage ? `
      <div class="staff-card__actions">
        ${isSuspended
          ? `<button class="staff-icon-btn" title="Reactivar" data-action="reactivate" data-id="${m.id}" data-name="${Utils.escapeHtml(m.fullName || m.email)}"><i class="fa-solid fa-rotate-left"></i></button>`
          : `<button class="staff-icon-btn" title="Cambiar rol" data-action="change-role" data-id="${m.id}" data-role="${m.role}" data-name="${Utils.escapeHtml(m.fullName || m.email)}"><i class="fa-solid fa-arrows-up-down"></i></button>
             <button class="staff-icon-btn" title="Suspender" data-action="suspend" data-id="${m.id}" data-name="${Utils.escapeHtml(m.fullName || m.email)}"><i class="fa-solid fa-ban"></i></button>`}
        ${canDelete
          ? `<button class="staff-icon-btn staff-icon-btn--danger" title="Eliminar" data-action="delete" data-id="${m.id}" data-name="${Utils.escapeHtml(m.fullName || m.email)}"><i class="fa-solid fa-trash"></i></button>`
          : ''}
      </div>` : '';

    return `
      <article class="staff-card ${m.role === 'owner' ? 'is-owner' : ''} ${isSuspended ? 'is-suspended' : ''}">
        <div class="staff-avatar ${live ? 'is-live' : ''}" style="background:${avatarColor(m.email)}">
          ${Utils.escapeHtml(avatarInitials(m.fullName || m.email))}
        </div>
        <div class="staff-card__main">
          <div class="staff-card__row">
            <span class="staff-card__name">${Utils.escapeHtml(m.fullName || '—')}${isSelf ? '<span class="staff-card__you">(tú)</span>' : ''}</span>
            ${roleLabelInline}
          </div>
          <div class="staff-card__email">${Utils.escapeHtml(m.email)}</div>
          <div class="staff-card__meta">${lastLine}</div>
        </div>
        ${actions}
      </article>`;
  }

  function renderGroups(currentRole, currentId) {
    const filter = Ctx.statusFilter;
    const groupsHtml = ROLE_GROUPS.map(g => {
      let list = Ctx.members.filter(m => m.role === g.role && m.status !== 'suspended');
      if (filter !== 'all' && filter !== 'suspended' && filter !== g.role) return '';
      if (filter === 'suspended') return '';
      if (!list.length) return '';
      return `
        <section class="staff-group">
          <header class="staff-group__head">
            <span class="staff-group__title">${Utils.escapeHtml(g.title)}</span>
            <span class="staff-group__count">${list.length}</span>
            <span class="staff-group__hint">${Utils.escapeHtml(g.hint)}</span>
          </header>
          ${list.map(m => renderMemberCard(m, currentRole, currentId)).join('')}
        </section>`;
    }).filter(Boolean).join('');

    // Suspendidos: solo se muestran en filtro "all" o "suspended"
    const suspended = Ctx.members.filter(m => m.status === 'suspended');
    const showSuspended = (filter === 'all' || filter === 'suspended') && suspended.length;
    const suspendedHtml = showSuspended ? `
      <section class="staff-group staff-group--muted">
        <header class="staff-group__head">
          <span class="staff-group__title">Suspendidos</span>
          <span class="staff-group__count">${suspended.length}</span>
          <span class="staff-group__hint">Sin acceso al panel · sus sesiones fueron cerradas</span>
        </header>
        ${suspended.map(m => renderMemberCard(m, currentRole, currentId)).join('')}
      </section>` : '';

    if (!groupsHtml && !suspendedHtml) {
      return `
        <div class="empty">
          <i class="fa-solid fa-filter-circle-xmark"></i>
          <h3>Ningún miembro con este filtro</h3>
          <p>Ajusta o limpia el filtro para ver más resultados.</p>
          <button class="btn btn--ghost btn--sm" data-pill="all">Ver todos</button>
        </div>`;
    }
    return groupsHtml + suspendedHtml;
  }

  // ============================================================
  // Modales
  // ============================================================
  function openInviteModal() {
    const isOwner = State.currentStaff?.role === 'owner';
    const html = `
      <form id="invite-form" class="staff-form" novalidate>
        <div class="form-group">
          <label for="inv-email">Correo</label>
          <input id="inv-email" type="email" name="email" required autocomplete="off" placeholder="nombre@ejemplo.com" />
        </div>
        <div class="form-group">
          <label for="inv-fullname">Nombre <span class="staff-form__opt">(opcional)</span></label>
          <input id="inv-fullname" type="text" name="fullName" maxlength="160" />
        </div>
        <div class="form-group">
          <label for="inv-role">Rol</label>
          <select id="inv-role" name="role" required>
            ${ROLES.filter(r => isOwner || r.value !== 'owner').map(r => `
              <option value="${r.value}" ${r.value === 'operator' ? 'selected' : ''}>
                ${r.label} — ${r.desc}
              </option>`).join('')}
          </select>
        </div>
        <p class="staff-form__hint">
          La persona recibirá un correo con un enlace para crear su contraseña.
          El enlace es válido por <strong>24 horas</strong>.
        </p>
        <div class="modal-footer">
          <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn--primary">Enviar invitación</button>
        </div>
      </form>`;
    Modal.open('Invitar a tu equipo', html);
    const form = document.getElementById('invite-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        email: form.email.value.trim(),
        fullName: form.fullName.value.trim() || undefined,
        role: form.role.value,
      };
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        await postJson('/api/staff/invitations', data);
        Toast.success('Invitación enviada');
        Modal.close();
        Ctx.pendingExpanded = true; // mostrar inmediatamente para feedback
        await reloadAndRender();
      } catch (err) {
        Toast.error(err.message || 'Error enviando la invitación');
        btn.disabled = false; btn.textContent = 'Enviar invitación';
      }
    });
  }

  function openRoleModal(memberId, currentRoleVal, memberName) {
    const isOwner = State.currentStaff?.role === 'owner';
    const html = `
      <form id="role-form" class="staff-form" novalidate>
        <p>Cambiar rol de <strong>${Utils.escapeHtml(memberName)}</strong>:</p>
        <div class="form-group">
          <select id="role-select" name="role" required>
            ${ROLES.filter(r => isOwner || r.value !== 'owner').map(r => `
              <option value="${r.value}" ${r.value === currentRoleVal ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn--primary">Guardar</button>
        </div>
      </form>`;
    Modal.open('Cambiar rol', html);
    const form = document.getElementById('role-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newRole = form.role.value;
      if (newRole === currentRoleVal) { Modal.close(); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await postJson(`/api/staff/members/${memberId}/role`, { role: newRole });
        Toast.success('Rol actualizado');
        Modal.close();
        await reloadAndRender();
      } catch (err) {
        Toast.error(err.message || 'No se pudo actualizar');
        btn.disabled = false; btn.textContent = 'Guardar';
      }
    });
  }

  async function confirmAndRun(message, fn) {
    const html = `
      <p>${Utils.escapeHtml(message)}</p>
      <div class="modal-footer">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn--danger" id="confirm-btn">Confirmar</button>
      </div>`;
    Modal.open('Confirmar acción', html);
    return new Promise((resolve) => {
      const btn = document.getElementById('confirm-btn');
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Procesando…';
        try {
          await fn();
          Modal.close();
          resolve(true);
        } catch (err) {
          Toast.error(err.message || 'Error');
          btn.disabled = false; btn.textContent = 'Confirmar';
          resolve(false);
        }
      });
    });
  }

  // ============================================================
  // Event delegation
  // ============================================================
  function attachHandlers() {
    const content = document.getElementById('content');
    if (!content) return;

    content.addEventListener('click', async (e) => {
      // Pills
      const pillBtn = e.target.closest('[data-pill]');
      if (pillBtn) {
        Ctx.statusFilter = pillBtn.dataset.pill;
        rerender();
        return;
      }

      // Toggle pending expanded
      const toggleBtn = e.target.closest('[data-pending="toggle"]');
      if (toggleBtn) {
        Ctx.pendingExpanded = !Ctx.pendingExpanded;
        rerender();
        return;
      }

      // Row actions
      const actBtn = e.target.closest('[data-action]');
      if (!actBtn) return;
      const action = actBtn.dataset.action;
      const id = actBtn.dataset.id;
      const name = actBtn.dataset.name || '';

      if (action === 'change-role') {
        openRoleModal(id, actBtn.dataset.role, name);
      }
      else if (action === 'suspend') {
        const ok = await confirmAndRun(
          `Suspender a ${name}. Sus sesiones se cerrarán inmediatamente.`,
          () => postJson(`/api/staff/members/${id}/suspend`));
        if (ok) await reloadAndRender();
      }
      else if (action === 'reactivate') {
        const ok = await confirmAndRun(
          `Reactivar la cuenta de ${name}.`,
          () => postJson(`/api/staff/members/${id}/reactivate`));
        if (ok) await reloadAndRender();
      }
      else if (action === 'delete') {
        const ok = await confirmAndRun(
          `Eliminar permanentemente a ${name}. Esta acción no se puede deshacer.`,
          () => deleteUrl(`/api/staff/members/${id}`));
        if (ok) await reloadAndRender();
      }
      else if (action === 'resend-invite') {
        const ok = await confirmAndRun(
          'Reenviar el correo de invitación con un enlace nuevo (válido 24 h).',
          () => postJson(`/api/staff/invitations/${id}/resend`));
        if (ok) await reloadAndRender();
      }
      else if (action === 'revoke-invite') {
        const ok = await confirmAndRun(
          'Revocar esta invitación. El enlace dejará de funcionar.',
          () => postJson(`/api/staff/invitations/${id}/revoke`));
        if (ok) await reloadAndRender();
      }
    });
  }

  // ============================================================
  // Render orchestration
  // ============================================================
  function rerender() {
    const content = document.getElementById('content');
    const currentStaff = State.currentStaff;
    const currentRole = currentStaff?.role;
    content.innerHTML = `
      <div class="staff-view">
        ${renderPills()}
        ${renderPendingBar()}
        <div class="staff-groups">
          ${renderGroups(currentRole, currentStaff?.id)}
        </div>
      </div>`;
    renderTopbar();
  }

  async function reloadAndRender() {
    try {
      const [members, invitations] = await Promise.all([fetchMembers(), fetchInvitations()]);
      Ctx.members = members;
      Ctx.invitations = invitations;
      rerender();
    } catch (err) {
      const content = document.getElementById('content');
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h3>No se pudo cargar el equipo</h3>
          <p>${Utils.escapeHtml(err.message)}</p>
        </div>`;
    }
  }

  // ============================================================
  // Entry point
  // ============================================================
  let _bound = false;
  async function renderStaff() {
    const content = document.getElementById('content');
    const currentStaff = State.currentStaff;
    const currentRole = currentStaff?.role;

    if (currentRole !== 'owner' && currentRole !== 'admin') {
      document.getElementById('topbar-actions').innerHTML = '';
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-lock"></i>
          <h3>No tienes permiso para esta sección</h3>
          <p>Pídele a un administrador o al propietario que te dé acceso.</p>
        </div>`;
      return;
    }

    content.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
    if (!_bound) { attachHandlers(); _bound = true; }
    await reloadAndRender();
  }

  window.renderStaff = renderStaff;
})();
