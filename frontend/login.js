// =============================================================================
// login.js · cliente de las páginas /login, /login/forgot, /login/reset.
// Misma página HTML, distintas vistas mostradas según el path.
// =============================================================================

(function () {
  // Detecta qué vista mostrar a partir del path
  const path = window.location.pathname;
  let view = 'login';
  if (path.startsWith('/login/forgot')) view = 'forgot';
  else if (path.startsWith('/login/reset')) view = 'reset';

  // Activa la vista correcta
  document.querySelectorAll('.auth-view').forEach(el => {
    el.classList.toggle('is-active', el.dataset.view === view);
  });

  // Hidrata brand/org desde /api/_tenant
  hydrateBrand();

  if (view === 'login') bindLogin();
  if (view === 'forgot') bindForgot();
  if (view === 'reset') bindReset();

  async function hydrateBrand() {
    try {
      const res = await fetch('/api/_tenant', { credentials: 'same-origin' });
      if (!res.ok) return;
      const t = await res.json();
      const logoEl = document.getElementById('auth-logo');
      const orgEl = document.getElementById('auth-org-name');
      const footerEl = document.getElementById('auth-footer-org');
      if (t.logoUrl) {
        logoEl.innerHTML = `<img src="${escapeHtml(t.logoUrl)}" alt="${escapeHtml(t.name || '')}" />`;
      } else if (t.name) {
        logoEl.innerHTML = `<span style="color:var(--color-on-primary);font-weight:800;font-size:24px;">${escapeHtml(t.name.charAt(0).toUpperCase())}</span>`;
      }
      if (t.name) {
        orgEl.textContent = t.name;
        if (footerEl) footerEl.textContent = `© ${new Date().getFullYear()} · ${t.name}`;
      }
    } catch {}
  }

  // -------------------- LOGIN --------------------
  function bindLogin() {
    const form = document.getElementById('login-form');
    const submit = document.getElementById('login-submit');
    const msg = document.getElementById('login-message');
    const toggle = document.getElementById('toggle-password');
    const pass = document.getElementById('password');

    toggle?.addEventListener('click', () => togglePasswordVisibility(pass, toggle));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearMessage(msg);
      const email = form.email.value.trim().toLowerCase();
      const password = form.password.value;
      const rememberMe = form.rememberMe.checked;
      if (!email || !password) {
        showMessage(msg, 'error', 'Completa correo y contraseña.');
        return;
      }
      setBusy(submit, true, 'Iniciando…');
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password, rememberMe }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          const txt = res.status === 423
            ? (data?.error || 'Cuenta bloqueada temporalmente.')
            : res.status === 429
              ? 'Demasiados intentos. Espera unos minutos.'
              : (data?.error || 'Credenciales inválidas.');
          showMessage(msg, 'error', txt);
          setBusy(submit, false, 'Iniciar sesión');
          return;
        }
        // Redirect: si hay ?next= en la URL, ahí; si no, al SPA admin /
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const target = next && /^\/[^/]/.test(next) ? next : '/';
        // Si mustChangePassword, podemos hacer un disclaimer pero no bloqueamos
        // (el modal del admin lo manejará). Por ahora redirect normal.
        window.location.href = data?.mustChangePassword ? '/?must_change=1' : target;
      } catch (e) {
        showMessage(msg, 'error', 'Sin conexión. Intenta de nuevo.');
        setBusy(submit, false, 'Iniciar sesión');
      }
    });
  }

  // -------------------- FORGOT --------------------
  function bindForgot() {
    const form = document.getElementById('forgot-form');
    const submit = document.getElementById('forgot-submit');
    const msg = document.getElementById('forgot-message');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearMessage(msg);
      const email = form.email.value.trim().toLowerCase();
      if (!email) {
        showMessage(msg, 'error', 'Escribe tu correo.');
        return;
      }
      setBusy(submit, true, 'Enviando…');
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email }),
        });
        // Siempre OK (no leak)
        showMessage(msg, 'success', 'Si el correo está registrado, te enviamos un enlace. Revisa tu bandeja (y spam).');
        form.email.value = '';
        setBusy(submit, false, 'Enviar enlace');
      } catch (e) {
        showMessage(msg, 'error', 'Sin conexión. Intenta de nuevo.');
        setBusy(submit, false, 'Enviar enlace');
      }
    });
  }

  // -------------------- RESET --------------------
  function bindReset() {
    const form = document.getElementById('reset-form');
    const submit = document.getElementById('reset-submit');
    const msg = document.getElementById('reset-message');
    const toggle = document.getElementById('toggle-reset-password');
    const pass = document.getElementById('reset-password');

    toggle?.addEventListener('click', () => togglePasswordVisibility(pass, toggle));

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      showMessage(msg, 'error', 'Enlace inválido. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".');
      submit.disabled = true;
      return;
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearMessage(msg);
      const newPassword = form.newPassword.value;
      const confirm = form.newPasswordConfirm.value;
      if (newPassword.length < 10) {
        showMessage(msg, 'error', 'La contraseña debe tener al menos 10 caracteres.');
        return;
      }
      if (newPassword !== confirm) {
        showMessage(msg, 'error', 'Las contraseñas no coinciden.');
        return;
      }
      setBusy(submit, true, 'Guardando…');
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ token, newPassword }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          showMessage(msg, 'error', data?.error || 'No pudimos restablecer la contraseña.');
          setBusy(submit, false, 'Guardar nueva contraseña');
          return;
        }
        showMessage(msg, 'success', 'Contraseña restablecida. Redirigiendo al login…');
        setTimeout(() => { window.location.href = '/login'; }, 1800);
      } catch (e) {
        showMessage(msg, 'error', 'Sin conexión. Intenta de nuevo.');
        setBusy(submit, false, 'Guardar nueva contraseña');
      }
    });
  }

  // -------------------- helpers --------------------
  function showMessage(el, kind, text) {
    el.textContent = text;
    el.className = 'auth-message is-' + kind;
  }
  function clearMessage(el) {
    el.textContent = '';
    el.className = 'auth-message';
  }
  function setBusy(btn, busy, idleLabel) {
    const lbl = btn.querySelector('.auth-btn-label');
    btn.disabled = busy;
    if (lbl) lbl.textContent = busy ? idleLabel : idleLabel;
  }
  function togglePasswordVisibility(input, btn) {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
  }
  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
