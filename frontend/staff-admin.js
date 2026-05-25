// =============================================================================
// staff-admin.js · vista "Mi equipo" (#/staff)
// Requiere `app.js` ya cargado (depende de State, Modal, Toast, Utils, API_BASE).
// =============================================================================

(function () {
  const ROLES = [
    { value: 'owner', label: 'Propietario(a)', desc: 'Permisos totales + eliminar staff.' },
    { value: 'admin', label: 'Administrador(a)', desc: 'Gestiona equipo y configuración.' },
    { value: 'operator', label: 'Operador(a)', desc: 'Operación cotidiana (check-in, registro).' },
  ];

  function roleLabel(r) {
    const m = ROLES.find(x => x.value === r);
    return m ? m.label : r;
  }

  function statusBadge(status) {
    if (status === 'suspended') return `<span class="staff-badge staff-badge--warn">Suspendido</span>`;
    if (status === 'deleted') return `<span class="staff-badge staff-badge--mute">Eliminado</span>`;
    return `<span class="staff-badge staff-badge--ok">Activo</span>`;
  }

  function inviteStatusBadge(status) {
    if (status === 'accepted') return `<span class="staff-badge staff-badge--ok">Aceptada</span>`;
    if (status === 'revoked')  return `<span class="staff-badge staff-badge--mute">Revocada</span>`;
    if (status === 'expired')  return `<span class="staff-badge staff-badge--mute">Expirada</span>`;
    return `<span class="staff-badge staff-badge--warn">Pendiente</span>`;
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

  function renderMembersTable(members, currentRole, currentId) {
    if (!members.length) {
      return `<div class="empty"><i class="fa-solid fa-users-slash"></i><h3>Sin miembros aún</h3><p>Invita a tu primera persona del equipo.</p></div>`;
    }
    return `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último login</th>
              <th style="width:1%"></th>
            </tr>
          </thead>
          <tbody>
            ${members.map(m => {
              const isSelf = m.id === currentId;
              const canManage = currentRole === 'owner' || (currentRole === 'admin' && m.role !== 'owner');
              return `
              <tr>
                <td><strong>${Utils.escapeHtml(m.fullName || '—')}</strong>${isSelf ? ' <span class="staff-tag-self">(tú)</span>' : ''}</td>
                <td>${Utils.escapeHtml(m.email)}</td>
                <td><span class="staff-role staff-role--${m.role}">${roleLabel(m.role)}</span></td>
                <td>${statusBadge(m.status)}</td>
                <td title="${m.lastLoginAt || ''}">${relTime(m.lastLoginAt)}</td>
                <td style="text-align:right;white-space:nowrap;">
                  ${!isSelf && canManage ? `
                    <button class="btn btn--ghost btn--sm" data-action="change-role" data-id="${m.id}" data-role="${m.role}" data-name="${Utils.escapeHtml(m.fullName || m.email)}">Cambiar rol</button>
                    ${m.status === 'active'
                      ? `<button class="btn btn--ghost btn--sm" data-action="suspend" data-id="${m.id}" data-name="${Utils.escapeHtml(m.fullName || m.email)}">Suspender</button>`
                      : m.status === 'suspended'
                        ? `<button class="btn btn--ghost btn--sm" data-action="reactivate" data-id="${m.id}" data-name="${Utils.escapeHtml(m.fullName || m.email)}">Reactivar</button>`
                        : ''}
                    ${currentRole === 'owner' && m.status !== 'deleted'
                      ? `<button class="btn btn--danger btn--sm" data-action="delete" data-id="${m.id}" data-name="${Utils.escapeHtml(m.fullName || m.email)}">Eliminar</button>`
                      : ''}
                  ` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderInvitationsTable(invitations) {
    const pending = invitations.filter(i => i.status === 'pending');
    const rest = invitations.filter(i => i.status !== 'pending').slice(0, 25);

    const tablize = (list, isPending) => `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>${isPending ? 'Expira' : 'Cuándo'}</th>
              ${isPending ? '<th style="width:1%"></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${list.map(inv => `
              <tr>
                <td>${Utils.escapeHtml(inv.email)}</td>
                <td><span class="staff-role staff-role--${inv.role}">${roleLabel(inv.role)}</span></td>
                <td>${inviteStatusBadge(inv.status)}</td>
                <td title="${inv.expiresAt || ''}">${isPending ? relTime(inv.expiresAt) : relTime(inv.acceptedAt || inv.createdAt)}</td>
                ${isPending ? `
                <td style="text-align:right;white-space:nowrap;">
                  <button class="btn btn--ghost btn--sm" data-action="resend-invite" data-id="${inv.id}">Reenviar</button>
                  <button class="btn btn--ghost btn--sm" data-action="revoke-invite" data-id="${inv.id}">Revocar</button>
                </td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    return `
      <h3 class="staff-section-title">Invitaciones pendientes${pending.length ? ` <span class="staff-section-count">${pending.length}</span>` : ''}</h3>
      ${pending.length ? tablize(pending, true) : `<div class="empty empty--sm"><i class="fa-solid fa-envelope-open-text"></i><p>Sin invitaciones pendientes.</p></div>`}
      ${rest.length ? `
        <details class="staff-history">
          <summary>Historial reciente (${rest.length})</summary>
          ${tablize(rest, false)}
        </details>` : ''}
    `;
  }

  function openInviteModal(reload) {
    const isOwner = State.currentStaff?.role === 'owner';
    const html = `
      <form id="invite-form" class="staff-form" novalidate>
        <div class="form-group">
          <label for="inv-email">Correo</label>
          <input id="inv-email" type="email" name="email" required autocomplete="off" />
        </div>
        <div class="form-group">
          <label for="inv-fullname">Nombre (opcional)</label>
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
        <p class="staff-form__hint">La persona recibirá un correo con un enlace para crear su contraseña. El enlace es válido por 24 horas.</p>
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
        await reload();
      } catch (err) {
        Toast.error(err.message || 'Error enviando la invitación');
        btn.disabled = false; btn.textContent = 'Enviar invitación';
      }
    });
  }

  function openRoleModal(memberId, currentRole, memberName, reload) {
    const isOwner = State.currentStaff?.role === 'owner';
    const html = `
      <form id="role-form" class="staff-form" novalidate>
        <p>Cambiar rol de <strong>${Utils.escapeHtml(memberName)}</strong>:</p>
        <div class="form-group">
          <select id="role-select" name="role" required>
            ${ROLES.filter(r => isOwner || r.value !== 'owner').map(r => `
              <option value="${r.value}" ${r.value === currentRole ? 'selected' : ''}>
                ${r.label}
              </option>`).join('')}
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
      if (newRole === currentRole) { Modal.close(); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await postJson(`/api/staff/members/${memberId}/role`, { role: newRole });
        Toast.success('Rol actualizado');
        Modal.close();
        await reload();
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

  async function renderStaff() {
    const content = document.getElementById('content');
    const currentStaff = State.currentStaff;
    const currentRole = currentStaff?.role;

    if (currentRole !== 'owner' && currentRole !== 'admin') {
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-lock"></i>
          <h3>No tienes permiso para esta sección</h3>
          <p>Pídele a un administrador o al propietario que te dé acceso.</p>
        </div>`;
      return;
    }

    document.getElementById('topbar-actions').innerHTML = `
      <button class="btn btn--primary" id="open-invite-btn">
        <i class="fa-solid fa-user-plus"></i>
        Invitar persona
      </button>`;

    content.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
    try {
      const [members, invitations] = await Promise.all([fetchMembers(), fetchInvitations()]);
      const reload = renderStaff;
      content.innerHTML = `
        <section class="staff-section">
          <h3 class="staff-section-title">Miembros del equipo <span class="staff-section-count">${members.length}</span></h3>
          ${renderMembersTable(members, currentRole, currentStaff?.id)}
        </section>
        <section class="staff-section">
          ${renderInvitationsTable(invitations)}
        </section>`;

      document.getElementById('open-invite-btn').addEventListener('click', () => openInviteModal(reload));

      content.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const name = btn.dataset.name || '';

        if (action === 'change-role') openRoleModal(id, btn.dataset.role, name, reload);
        else if (action === 'suspend') {
          await confirmAndRun(`Suspender a ${name}. Sus sesiones se cerrarán inmediatamente.`,
            () => postJson(`/api/staff/members/${id}/suspend`));
          await reload();
        }
        else if (action === 'reactivate') {
          await confirmAndRun(`Reactivar la cuenta de ${name}.`,
            () => postJson(`/api/staff/members/${id}/reactivate`));
          await reload();
        }
        else if (action === 'delete') {
          await confirmAndRun(`Eliminar permanentemente a ${name}. Esta acción no se puede deshacer.`,
            () => deleteUrl(`/api/staff/members/${id}`));
          await reload();
        }
        else if (action === 'resend-invite') {
          await confirmAndRun('Reenviar el correo de invitación con un enlace nuevo.',
            () => postJson(`/api/staff/invitations/${id}/resend`));
          await reload();
        }
        else if (action === 'revoke-invite') {
          await confirmAndRun('Revocar esta invitación. El enlace dejará de funcionar.',
            () => postJson(`/api/staff/invitations/${id}/revoke`));
          await reload();
        }
      }, { once: true });
    } catch (err) {
      content.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h3>No se pudo cargar el equipo</h3>
          <p>${Utils.escapeHtml(err.message)}</p>
        </div>`;
    }
  }

  window.renderStaff = renderStaff;
})();
