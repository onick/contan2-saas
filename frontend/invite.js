// =============================================================================
// invite.js · página pública de aceptación de invitación (/invite/:token)
// =============================================================================

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  const ROLE_LABEL = {
    owner: 'Propietario(a)',
    admin: 'Administrador(a)',
    operator: 'Operador(a)',
  };

  function getToken() {
    // /invite/<token>  o  /invite/<token>?... — solo lo primero
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const parts = path.split('/');
    if (parts[0] === 'invite' && parts[1]) return parts[1];
    return null;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return iso; }
  }

  function renderError(message) {
    $('#invite-host').innerHTML = `
      <div class="invite-error">
        <h2>No podemos aceptar esta invitación</h2>
        <p>${escapeHtml(message)}</p>
      </div>
      <a href="/" class="auth-btn auth-btn--primary" style="display:block;text-align:center;text-decoration:none;">Volver al inicio</a>`;
  }

  function renderSuccess(loginUrl) {
    $('#invite-host').innerHTML = `
      <h1>¡Listo!</h1>
      <p class="auth-lead">Ya puedes iniciar sesión con tu correo y la contraseña que acabas de crear.</p>
      <a href="${escapeHtml(loginUrl || '/login')}" class="auth-btn auth-btn--primary" style="display:block;text-align:center;text-decoration:none;">Iniciar sesión</a>`;
  }

  function renderForm(inv) {
    const orgName = inv.organization?.name || 'la organización';
    $('#auth-org-name').textContent = orgName;
    $('#invite-host').innerHTML = `
      <span class="invite-pill">Invitación a ${escapeHtml(ROLE_LABEL[inv.role] || inv.role)}</span>
      <h1>Crea tu acceso</h1>
      <p class="auth-lead">Te invitaron a unirte al equipo de <strong>${escapeHtml(orgName)}</strong>.</p>
      <div class="invite-meta">
        <div><strong>Correo:</strong> ${escapeHtml(inv.email)}</div>
        <div><strong>Rol:</strong> ${escapeHtml(ROLE_LABEL[inv.role] || inv.role)}</div>
        <div style="margin-top:6px;font-size:0.82rem;">Válida hasta ${escapeHtml(fmtDate(inv.expiresAt))}</div>
      </div>

      <form id="accept-form" novalidate>
        <div class="auth-field">
          <label for="fullName">Tu nombre completo</label>
          <input id="fullName" name="fullName" type="text" autocomplete="name" required
                 value="${escapeHtml(inv.fullName || '')}" maxlength="160" />
        </div>
        <div class="auth-field">
          <label for="password">Crea una contraseña</label>
          <div class="auth-input-with-action">
            <input id="password" name="password" type="password" autocomplete="new-password"
                   required minlength="10" />
            <button type="button" class="auth-toggle-eye" id="toggle-password" aria-label="Mostrar contraseña">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <small style="color:var(--color-text-muted);font-size:0.8rem;">Mínimo 10 caracteres. Mezcla letras, números y símbolos.</small>
        </div>
        <div class="auth-field">
          <label for="passwordConfirm">Confirma la contraseña</label>
          <input id="passwordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="10" />
        </div>

        <div class="auth-message" id="invite-message"></div>

        <button type="submit" class="auth-btn auth-btn--primary" id="invite-submit">
          <span class="auth-btn-label">Aceptar invitación</span>
        </button>
      </form>`;
    bindForm(inv);
  }

  function bindForm(inv) {
    const form = $('#accept-form');
    const msg = $('#invite-message');
    const submit = $('#invite-submit');
    const pw = $('#password');
    const toggle = $('#toggle-password');

    toggle.addEventListener('click', () => {
      const t = pw.type === 'password' ? 'text' : 'password';
      pw.type = t;
      toggle.querySelector('i').className = t === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'auth-message';
      msg.textContent = '';
      const fullName = form.fullName.value.trim();
      const password = form.password.value;
      const passwordConfirm = form.passwordConfirm.value;

      if (password.length < 10) {
        msg.className = 'auth-message is-error';
        msg.textContent = 'La contraseña debe tener al menos 10 caracteres.';
        return;
      }
      if (password !== passwordConfirm) {
        msg.className = 'auth-message is-error';
        msg.textContent = 'Las contraseñas no coinciden.';
        return;
      }

      submit.disabled = true;
      submit.querySelector('.auth-btn-label').textContent = 'Aceptando…';

      try {
        const token = getToken();
        const res = await fetch('/api/auth/accept-invitation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ token, password, fullName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          msg.className = 'auth-message is-error';
          msg.textContent = data.error || 'No se pudo aceptar la invitación.';
          submit.disabled = false;
          submit.querySelector('.auth-btn-label').textContent = 'Aceptar invitación';
          return;
        }
        renderSuccess('/login');
      } catch (err) {
        msg.className = 'auth-message is-error';
        msg.textContent = 'Sin conexión. Vuelve a intentar.';
        submit.disabled = false;
        submit.querySelector('.auth-btn-label').textContent = 'Aceptar invitación';
      }
    });
  }

  async function init() {
    const token = getToken();
    if (!token) return renderError('Enlace inválido. Pide a tu administrador uno nuevo.');

    try {
      const res = await fetch(`/api/auth/invitation/${encodeURIComponent(token)}`, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) return renderError('Esta invitación no existe.');
      if (res.status === 410) return renderError(data.error || 'Esta invitación expiró o ya no es válida.');
      if (!res.ok) return renderError(data.error || 'No se pudo cargar la invitación.');
      renderForm(data.invitation);
    } catch (err) {
      renderError('Sin conexión. Intenta de nuevo en un momento.');
    }
  }

  init();
})();
