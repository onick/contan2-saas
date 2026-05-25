// =============================================================================
// platform-login.js · análogo a login.js pero llama a /api/platform/auth/*
// =============================================================================

(function () {
  const path = window.location.pathname;
  let view = 'login';
  if (path.startsWith('/login/forgot')) view = 'forgot';
  else if (path.startsWith('/login/reset')) view = 'reset';

  document.querySelectorAll('.auth-view').forEach(el => {
    el.classList.toggle('is-active', el.dataset.view === view);
  });

  if (view === 'login') bindLogin();
  if (view === 'forgot') bindForgot();
  if (view === 'reset') bindReset();

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
      setBusy(submit, true);
      try {
        const res = await fetch('/api/platform/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password, rememberMe }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          const txt = res.status === 423 ? (data?.error || 'Cuenta bloqueada.')
            : res.status === 429 ? 'Demasiados intentos.'
            : (data?.error || 'Credenciales inválidas.');
          showMessage(msg, 'error', txt);
          setBusy(submit, false);
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const target = next && /^\/[^/]/.test(next) ? next : '/';
        window.location.href = data?.mustChangePassword ? '/?must_change=1' : target;
      } catch (e) {
        showMessage(msg, 'error', 'Sin conexión. Intenta de nuevo.');
        setBusy(submit, false);
      }
    });
  }

  function bindForgot() {
    const form = document.getElementById('forgot-form');
    const submit = document.getElementById('forgot-submit');
    const msg = document.getElementById('forgot-message');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearMessage(msg);
      const email = form.email.value.trim().toLowerCase();
      if (!email) { showMessage(msg, 'error', 'Escribe tu correo.'); return; }
      setBusy(submit, true);
      try {
        await fetch('/api/platform/auth/forgot-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', body: JSON.stringify({ email }),
        });
        showMessage(msg, 'success', 'Si el correo está registrado, te enviamos un enlace.');
        form.email.value = '';
        setBusy(submit, false);
      } catch (e) {
        showMessage(msg, 'error', 'Sin conexión.');
        setBusy(submit, false);
      }
    });
  }

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
      showMessage(msg, 'error', 'Enlace inválido.');
      submit.disabled = true;
      return;
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearMessage(msg);
      const newPassword = form.newPassword.value;
      const confirm = form.newPasswordConfirm.value;
      if (newPassword.length < 10) { showMessage(msg, 'error', 'Mínimo 10 caracteres.'); return; }
      if (newPassword !== confirm) { showMessage(msg, 'error', 'No coinciden.'); return; }
      setBusy(submit, true);
      try {
        const res = await fetch('/api/platform/auth/reset-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', body: JSON.stringify({ token, newPassword }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          showMessage(msg, 'error', data?.error || 'No pudimos restablecer.');
          setBusy(submit, false);
          return;
        }
        showMessage(msg, 'success', 'Contraseña restablecida. Redirigiendo…');
        setTimeout(() => { window.location.href = '/login'; }, 1800);
      } catch (e) {
        showMessage(msg, 'error', 'Sin conexión.');
        setBusy(submit, false);
      }
    });
  }

  function showMessage(el, kind, text) { el.textContent = text; el.className = 'auth-message is-' + kind; }
  function clearMessage(el) { el.textContent = ''; el.className = 'auth-message'; }
  function setBusy(btn, busy) { btn.disabled = busy; }
  function togglePasswordVisibility(input, btn) {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
  }
  async function safeJson(res) { try { return await res.json(); } catch { return null; } }
})();
