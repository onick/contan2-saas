// =============================================================================
// platform-app.js · core de la SPA del super admin (admin.contan2.com)
// Provee: estado, router (hash), fetch helper, Modal, Toast, utils.
// Las vistas viven en platform-views.js y consumen estas primitives.
// =============================================================================

const PF = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const State = {
    admin: null,
    sessionId: null,
    route: 'operacion',
    params: null,
  };

  // ----- API helper -----
  async function api(method, path, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    let data = null;
    const txt = await res.text();
    if (txt) {
      try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    }
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('401');
    }
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ----- Utils -----
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtNum(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('es-DO');
  }
  function relTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso).getTime();
    if (!Number.isFinite(d)) return '—';
    const diff = Date.now() - d;
    if (diff < 0) return 'pronto';
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'recién';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `hace ${days} d`;
    const months = Math.round(days / 30);
    return `hace ${months} m`;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-DO', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }
  function initials(name) {
    if (!name) return '··';
    const parts = String(name).trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]).join('').toUpperCase();
  }

  // ----- Toast -----
  const Toast = {
    show(msg, variant = '') {
      const host = $('#pf-toasts');
      if (!host) return;
      const el = document.createElement('div');
      el.className = 'pf-toast' + (variant ? ' pf-toast--' + variant : '');
      el.textContent = msg;
      host.appendChild(el);
      setTimeout(() => {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(12px)';
        setTimeout(() => el.remove(), 320);
      }, 3200);
    },
    ok(m)   { this.show(m, 'ok'); },
    error(m) { this.show(m, 'error'); },
  };

  // ----- Modal -----
  const Modal = {
    open(title, bodyHtml) {
      $('#pf-modal-title').textContent = title;
      $('#pf-modal-body').innerHTML = bodyHtml;
      const m = $('#pf-modal');
      m.hidden = false;
      m.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const firstInput = m.querySelector('input, select, textarea, button:not([data-close])');
      if (firstInput) setTimeout(() => firstInput.focus(), 40);
    },
    close() {
      const m = $('#pf-modal');
      m.hidden = true;
      m.setAttribute('aria-hidden', 'true');
      $('#pf-modal-body').innerHTML = '';
      document.body.style.overflow = '';
    },
    confirm({ title = 'Confirmar', message, danger = false }) {
      return new Promise((resolve) => {
        const html = `
          <p style="margin:0 0 6px;color:var(--pf-text);font-size:.92rem;">${escapeHtml(message)}</p>
          <div class="pf-modal__foot">
            <button class="pf-btn pf-btn--ghost" data-close>Cancelar</button>
            <button class="pf-btn ${danger ? 'pf-btn--danger' : 'pf-btn--primary'}" id="pf-confirm-go">Confirmar</button>
          </div>`;
        this.open(title, html);
        $('#pf-confirm-go').addEventListener('click', () => { this.close(); resolve(true); });
        // any close → false
        const obs = new MutationObserver(() => {
          if ($('#pf-modal').hidden) { obs.disconnect(); resolve(false); }
        });
        obs.observe($('#pf-modal'), { attributes: true, attributeFilter: ['hidden'] });
      });
    },
  };

  // ----- Router -----
  function parseHash() {
    const h = (window.location.hash || '#/operacion').replace(/^#\/?/, '');
    const [route, ...rest] = h.split('/').filter(Boolean);
    return { route: route || 'operacion', params: rest };
  }

  async function navigate() {
    const { route, params } = parseHash();
    State.route = route;
    State.params = params;

    $$('.pf-nav-link').forEach(a => {
      a.classList.toggle('is-active', a.dataset.route === route);
    });
    document.querySelector('.pf-sidebar')?.classList.remove('is-open');

    // Despacho delegado a window.PFRouter (cargado por platform-router.js
    // antes que este archivo en platform-dashboard.html). Sub-rutas como
    // tenants/<uuid> tienen prioridad sobre el dispatch por route plano —
    // antes este código llamaba a PFViews.tenants (lista) ignorando el id,
    // por eso /#/tenants/<id> nunca cargaba el detalle.
    const handler = window.PFRouter.pickHandler(window.PFViews, route, params);
    await window.PFRouter.runHandlerSafely(handler, Toast, console.error);
  }

  function setPageTitle(title, subtitle) {
    $('#pf-page-title').textContent = title;
    $('#pf-page-subtitle').textContent = subtitle || '';
  }
  function setTopbarActions(html) {
    $('#pf-topbar-actions').innerHTML = html || '';
  }

  // ----- Init -----
  async function init() {
    // 1. Validar sesión + paint user
    try {
      const me = await api('GET', '/api/platform/auth/me');
      State.admin = me.admin;
      State.sessionId = me.sessionId;
      $('#pf-user-name').textContent = me.admin.fullName || me.admin.email;
      $('#pf-avatar').textContent = initials(me.admin.fullName || me.admin.email);
      if (me.admin.mustChangePassword) {
        $('#pf-must-change-banner').hidden = false;
      }
    } catch {
      window.location.href = '/login';
      return;
    }

    // 2. Bind global UI
    $('#pf-logout-btn').addEventListener('click', async () => {
      try { await api('POST', '/api/platform/auth/logout'); } catch {}
      window.location.href = '/login';
    });
    $('#pf-banner-go').addEventListener('click', () => {
      window.location.hash = '#/account';
    });
    $('#pf-burger').addEventListener('click', () => {
      document.querySelector('.pf-sidebar')?.classList.toggle('is-open');
    });
    $('#pf-sidebar-backdrop').addEventListener('click', () => {
      document.querySelector('.pf-sidebar')?.classList.remove('is-open');
    });
    $('#pf-modal').addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) Modal.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#pf-modal').hidden) Modal.close();
    });

    // 3. Route inicial
    if (!window.location.hash) window.location.hash = '#/operacion';
    window.addEventListener('hashchange', navigate);
    navigate();
  }

  // Expose
  return {
    State, api, Toast, Modal,
    escapeHtml, fmtNum, relTime, fmtDate, initials,
    setPageTitle, setTopbarActions,
    init,
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PF.init());
} else {
  PF.init();
}
