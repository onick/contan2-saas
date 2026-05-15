// =============================================================================
// branding.js · shared
// Carga /api/_tenant y aplica el branding de la organización al documento.
// - Genera paleta primaria (50..900) por HSL desde un único color primario.
// - Soporta sidebarStyle: 'brand' | 'dark' | 'light' (default: 'brand').
// - Cachea en sessionStorage para evitar FOUC en navegaciones.
// =============================================================================

(function () {
  const CACHE_KEY = '_c2_tenant_v2';
  const CACHE_TTL_MS = 5 * 60 * 1000;

  // ---- HSL utilities -------------------------------------------------------
  function hexToHsl(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return null;
    let r = parseInt(m[1], 16) / 255;
    let g = parseInt(m[2], 16) / 255;
    let b = parseInt(m[3], 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return Math.round(255 * v).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  // Curva de lightness por stop (50..900). Saturación clamp para evitar
  // tonos lavados o demasiado neón.
  const STOPS = [
    { name: '50',  l: 96 },
    { name: '100', l: 90 },
    { name: '200', l: 80 },
    { name: '300', l: 68 },
    { name: '400', l: 55 },
    { name: '500', l: 45 },
    { name: '600', l: 36 },
    { name: '700', l: 28 },
    { name: '800', l: 20 },
    { name: '900', l: 14 },
  ];

  function generatePalette(hex) {
    const hsl = hexToHsl(hex);
    if (!hsl) return null;
    const s = Math.max(35, Math.min(85, hsl.s));
    const palette = {};
    for (const stop of STOPS) {
      palette[stop.name] = hslToHex(hsl.h, s, stop.l);
    }
    return palette;
  }

  // Luminancia relativa (WCAG) para elegir color de texto sobre el fondo.
  function luminance(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return 0;
    const channel = c => {
      c = parseInt(c, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(m[1]) + 0.7152 * channel(m[2]) + 0.0722 * channel(m[3]);
  }
  function pickOn(hex) {
    return luminance(hex) > 0.5 ? '#1f2937' : '#ffffff';
  }

  // ---- Apply ---------------------------------------------------------------
  function applyBranding(t) {
    if (!t) return;
    const r = document.documentElement;

    const primary = t.primaryColor || null;
    const accent = t.secondaryColor || null;
    const sidebarStyle = t.sidebarStyle || 'brand';

    if (primary) {
      const palette = generatePalette(primary);
      if (palette) {
        // Admin (--color-*), Kiosko (--k-*) y Scanner (--s-*) comparten paleta.
        for (const [stop, hex] of Object.entries(palette)) {
          r.style.setProperty(`--color-primary-${stop}`, hex);
          r.style.setProperty(`--k-primary-${stop}`, hex);
          r.style.setProperty(`--s-primary-${stop}`, hex);
        }
        const onPrimary = pickOn(palette['700']);
        r.style.setProperty('--color-on-primary', onPrimary);
        r.style.setProperty('--k-on-primary', onPrimary);
        r.style.setProperty('--s-on-primary', onPrimary);
        // Scanner legacy: bg y dark referencian el tono profundo de marca.
        r.style.setProperty('--s-primary-dark', palette['900']);
        r.style.setProperty('--s-bg', palette['900']);
      }
      // Legacy aliases.
      r.style.setProperty('--color-primary', primary);
      r.style.setProperty('--k-primary', primary);
      r.style.setProperty('--s-primary', primary);
    }

    if (accent) {
      r.style.setProperty('--color-accent', accent);
      r.style.setProperty('--k-accent', accent);
      r.style.setProperty('--s-accent', accent);
      const onAcc = pickOn(accent);
      r.style.setProperty('--color-on-accent', onAcc);
      r.style.setProperty('--k-on-accent', onAcc);
      r.style.setProperty('--s-on-accent', onAcc);
    }

    applySidebarStyle(r, sidebarStyle);

    if (t.name) {
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

  // Sidebar presets: 'brand' = gradiente del primario; 'dark' = neutros oscuros;
  // 'light' = panel claro sobre superficie blanca.
  function applySidebarStyle(r, style) {
    const set = (k, v) => r.style.setProperty(k, v);
    if (style === 'light') {
      set('--color-sidebar-bg-from', '#ffffff');
      set('--color-sidebar-bg-to', '#f4f6fa');
      set('--color-sidebar-text', '#1f2937');
      set('--color-sidebar-text-muted', '#6b7280');
      set('--color-sidebar-hover-bg', 'rgba(15, 23, 42, 0.06)');
      set('--color-sidebar-active-bg', 'var(--color-accent)');
      set('--color-sidebar-active-text', 'var(--color-on-accent)');
      set('--color-sidebar-border', 'rgba(15, 23, 42, 0.08)');
    } else if (style === 'dark') {
      set('--color-sidebar-bg-from', '#111827');
      set('--color-sidebar-bg-to', '#0b1220');
      set('--color-sidebar-text', '#ffffff');
      set('--color-sidebar-text-muted', 'rgba(255, 255, 255, 0.6)');
      set('--color-sidebar-hover-bg', 'rgba(255, 255, 255, 0.08)');
      set('--color-sidebar-active-bg', 'var(--color-accent)');
      set('--color-sidebar-active-text', 'var(--color-on-accent)');
      set('--color-sidebar-border', 'rgba(255, 255, 255, 0.08)');
    } else {
      // brand (default)
      set('--color-sidebar-bg-from', 'var(--color-primary-700)');
      set('--color-sidebar-bg-to', 'var(--color-primary-900)');
      set('--color-sidebar-text', 'var(--color-on-primary)');
      set('--color-sidebar-text-muted', 'rgba(255, 255, 255, 0.6)');
      set('--color-sidebar-hover-bg', 'rgba(255, 255, 255, 0.08)');
      set('--color-sidebar-active-bg', 'var(--color-accent)');
      set('--color-sidebar-active-text', 'var(--color-on-accent)');
      set('--color-sidebar-border', 'rgba(255, 255, 255, 0.1)');
    }
  }

  // ---- Cache ---------------------------------------------------------------
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

  // ---- Boot ----------------------------------------------------------------
  // Si el SSR ya inyectó los tokens en <style data-branding-ssr>, no hay FOUC.
  // Igualmente revalidamos contra /api/_tenant para cubrir cambios en runtime.
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
