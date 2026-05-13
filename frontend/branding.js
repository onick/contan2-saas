// =============================================================================
// branding.js · shared
// Carga /api/_tenant y aplica el branding de la organización al documento.
// Se incluye antes del JS principal de cada vista (admin, kiosko, scanner).
// Cacheado en sessionStorage para evitar FOUC en navegaciones.
// =============================================================================

(function () {
  const CACHE_KEY = '_c2_tenant_v1';
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function applyBranding(t) {
    if (!t) return;
    const r = document.documentElement;
    if (t.primaryColor) {
      r.style.setProperty('--color-primary', t.primaryColor);
      r.style.setProperty('--k-primary', t.primaryColor);
      r.style.setProperty('--s-primary', t.primaryColor);
    }
    if (t.secondaryColor) {
      r.style.setProperty('--color-accent', t.secondaryColor);
      r.style.setProperty('--k-accent', t.secondaryColor);
      r.style.setProperty('--s-accent', t.secondaryColor);
    }
    if (t.name) {
      const titleSuffix = t.name;
      if (!document.title.endsWith(titleSuffix)) {
        document.title = `${document.title} · ${titleSuffix}`;
      }
      document.querySelectorAll('[data-org-name]').forEach(el => {
        el.textContent = t.name;
      });
    }
    if (t.logoUrl) {
      document.querySelectorAll('[data-org-logo]').forEach(el => {
        el.src = t.logoUrl;
      });
    }
    window.__tenant__ = t;
    window.dispatchEvent(new CustomEvent('tenant:ready', { detail: t }));
  }

  function fromCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { t, savedAt } = JSON.parse(raw);
      if (Date.now() - savedAt > CACHE_TTL_MS) return null;
      return t;
    } catch {
      return null;
    }
  }

  function toCache(t) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t, savedAt: Date.now() }));
    } catch {}
  }

  const cached = fromCache();
  if (cached) applyBranding(cached);

  fetch('/api/_tenant', { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .then(t => {
      if (t) {
        toCache(t);
        applyBranding(t);
      }
    })
    .catch(() => {});
})();
