// =============================================================================
// landing.js · JS de la landing pública.
// Vanilla, sin dependencias. IIFE para no contaminar window.
// =============================================================================

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Year en el footer ----------
  const yearEl = $('#ln-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Header scroll state ----------
  const header = $('.ln-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- Burger / mobile nav ----------
  const burger = $('#ln-burger');
  if (burger) {
    burger.addEventListener('click', () => {
      const open = header.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    $$('.ln-nav a').forEach(a => {
      a.addEventListener('click', () => {
        header.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---------- Reveal on scroll ----------
  const reveals = $$('.ln-reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('is-visible'));
  }

  // ---------- Modal de login ----------
  const modal = $('#ln-login-modal');
  const openModal = () => {
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const last = safeGetItem('ln:lastSlug');
    const slugInput = $('#ln-slug');
    if (slugInput) {
      slugInput.value = last || '';
      // Focus diferido para que el modal se haya pintado primero.
      setTimeout(() => slugInput.focus(), 30);
    }
  };
  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  $$('#ln-open-login, [data-open-login]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Si es un enlace al ancla de contacto, dejarlo navegar.
      if (btn.getAttribute('href') === '#contacto') return;
      e.preventDefault();
      openModal();
    });
  });
  $$('[data-close-login]').forEach(el => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  const loginForm = $('#ln-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const slugInput = $('#ln-slug');
      let slug = (slugInput?.value || '').trim().toLowerCase();
      // Limpieza defensiva: si pegó la URL completa, extraemos el slug.
      slug = slug.replace(/^https?:\/\//, '').split('/')[0];
      if (slug.endsWith('.contan2.com')) slug = slug.slice(0, -'.contan2.com'.length);
      slug = slug.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
      if (!slug || slug.length < 2) {
        slugInput.focus();
        slugInput.setAttribute('aria-invalid', 'true');
        return;
      }
      slugInput.removeAttribute('aria-invalid');
      safeSetItem('ln:lastSlug', slug);
      // Redirect absoluto. En dev local, abre <slug>.localhost (require /etc/hosts
      // o wildcard DNS); en prod, <slug>.contan2.com.
      const root = (location.hostname === 'localhost' || location.hostname === 'landing.localhost')
        ? `${location.hostname}:${location.port || '3000'}`
        : 'contan2.com';
      const proto = (location.protocol === 'https:') ? 'https' : 'http';
      window.location.href = `${proto}://${slug}.${root}/login`;
    });
  }

  // ---------- Form de contacto ----------
  const form = $('#ln-contact-form');
  const msg = $('#ln-form-msg');
  const submit = $('#ln-submit');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: $('#ln-name').value.trim(),
        organization: $('#ln-org').value.trim(),
        email: $('#ln-email').value.trim(),
        message: $('#ln-message').value.trim(),
        fax: $('#ln-fax').value.trim(),
      };
      // Validación cliente (mínima — el backend revalida con zod).
      if (data.name.length < 2 || data.organization.length < 2 || !isEmail(data.email)) {
        setMsg('Revisa los campos requeridos.', 'is-error');
        return;
      }

      setMsg('Enviando…', '');
      submit.disabled = true;

      try {
        const res = await fetch('/api/landing/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.status === 429) {
          setMsg('Recibimos varias solicitudes desde tu ubicación. Espera una hora o escríbenos a hola@contan2.com.', 'is-error');
        } else if (!res.ok) {
          setMsg('No pudimos enviar tu mensaje. Vuelve a intentar en un momento.', 'is-error');
        } else {
          form.reset();
          setMsg('¡Recibido! Te respondemos en menos de 24h.', 'is-ok');
        }
      } catch {
        setMsg('Sin conexión. Vuelve a intentar.', 'is-error');
      } finally {
        submit.disabled = false;
      }
    });
  }

  function setMsg(text, cls) {
    if (!msg) return;
    msg.className = 'ln-form__msg ' + (cls || '');
    msg.textContent = text;
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function safeGetItem(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  function safeSetItem(k, v) {
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  }

  // ---------- Hash entry: #login abre el modal directamente ----------
  if (window.location.hash === '#login') {
    history.replaceState(null, '', window.location.pathname);
    openModal();
  }
})();
