// =============================================================================
// branding-admin.js · vista "Identidad de marca" del admin
// Form para configurar logo, color primario, accent y estilo de sidebar.
// Live preview aplica los tokens al :root al instante; al guardar persiste
// en /api/org/branding y reaplica vía branding.js para consolidar.
// =============================================================================

(function () {
  // Acceso a utilidades de branding.js (paleta HSL + sidebar presets).
  // Reimplementamos aquí lo mínimo para evitar exponer todo el módulo.
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
  function hexToHsl(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return null;
    const r = parseInt(m[1], 16) / 255;
    const g = parseInt(m[2], 16) / 255;
    const b = parseInt(m[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
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
  function luminance(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return 0;
    const ch = c => {
      c = parseInt(c, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(m[1]) + 0.7152 * ch(m[2]) + 0.0722 * ch(m[3]);
  }
  function pickOn(hex) { return luminance(hex) > 0.5 ? '#1f2937' : '#ffffff'; }
  function contrastRatio(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function generatePalette(hex) {
    const hsl = hexToHsl(hex);
    if (!hsl) return null;
    const s = Math.max(35, Math.min(85, hsl.s));
    const out = {};
    for (const stop of STOPS) out[stop.name] = hslToHex(hsl.h, s, stop.l);
    return out;
  }

  // ---- Sidebar presets ---------------------------------------------------
  function sidebarVarsFor(style) {
    if (style === 'light') return {
      '--color-sidebar-bg-from': '#ffffff',
      '--color-sidebar-bg-to': '#f4f6fa',
      '--color-sidebar-text': '#1f2937',
      '--color-sidebar-text-muted': '#6b7280',
      '--color-sidebar-hover-bg': 'rgba(15,23,42,0.06)',
      '--color-sidebar-border': 'rgba(15,23,42,0.08)',
    };
    if (style === 'dark') return {
      '--color-sidebar-bg-from': '#111827',
      '--color-sidebar-bg-to': '#0b1220',
      '--color-sidebar-text': '#ffffff',
      '--color-sidebar-text-muted': 'rgba(255,255,255,0.6)',
      '--color-sidebar-hover-bg': 'rgba(255,255,255,0.08)',
      '--color-sidebar-border': 'rgba(255,255,255,0.08)',
    };
    return {
      '--color-sidebar-bg-from': 'var(--color-primary-700)',
      '--color-sidebar-bg-to': 'var(--color-primary-900)',
      '--color-sidebar-text': 'var(--color-on-primary)',
      '--color-sidebar-text-muted': 'rgba(255,255,255,0.6)',
      '--color-sidebar-hover-bg': 'rgba(255,255,255,0.08)',
      '--color-sidebar-border': 'rgba(255,255,255,0.1)',
    };
  }

  function applyPreview({ primary, accent, sidebarStyle }) {
    const r = document.documentElement;
    if (primary) {
      const pal = generatePalette(primary);
      if (pal) {
        for (const [stop, hex] of Object.entries(pal)) {
          r.style.setProperty(`--color-primary-${stop}`, hex);
          r.style.setProperty(`--k-primary-${stop}`, hex);
        }
        const onP = pickOn(pal['700']);
        r.style.setProperty('--color-on-primary', onP);
        r.style.setProperty('--k-on-primary', onP);
      }
      r.style.setProperty('--color-primary', primary);
      r.style.setProperty('--k-primary', primary);
    }
    if (accent) {
      r.style.setProperty('--color-accent', accent);
      r.style.setProperty('--k-accent', accent);
      r.style.setProperty('--color-on-accent', pickOn(accent));
      r.style.setProperty('--k-on-accent', pickOn(accent));
    }
    if (sidebarStyle) {
      const vars = sidebarVarsFor(sidebarStyle);
      for (const [k, v] of Object.entries(vars)) r.style.setProperty(k, v);
    }
  }

  // ---- API ---------------------------------------------------------------
  async function fetchBranding() {
    const res = await fetch('/api/org/branding', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async function saveBranding(payload) {
    const res = await fetch('/api/org/branding', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let body = null; try { body = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error((body && body.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.details = body && body.details;
      throw err;
    }
    return body;
  }
  async function uploadLogo(file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/uploads/image', { method: 'POST', body: fd });
    let body = null; try { body = await res.json(); } catch {}
    if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
    return body.url;
  }

  // ---- View --------------------------------------------------------------
  const PRESETS = [
    { id: 'brand', label: 'Marca', desc: 'Gradiente del color primario', swatchVar: 'var(--color-primary-700)' },
    { id: 'dark',  label: 'Oscuro', desc: 'Neutros oscuros, accent destacado', swatchVar: '#111827' },
    { id: 'light', label: 'Claro',  desc: 'Panel claro, sobrio para marcas pastel', swatchVar: '#f4f6fa' },
  ];

  async function renderBranding() {
    const root = document.getElementById('content');
    root.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    let current;
    try {
      current = await fetchBranding();
    } catch (e) {
      window.Toast?.error?.('No se pudo cargar la configuración');
      root.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Error al cargar</h3></div>`;
      return;
    }

    const initial = {
      primary: current.primaryColor || '#1a237e',
      accent: current.secondaryColor || '#ff6f00',
      sidebarStyle: current.sidebarStyle || 'brand',
      logoUrl: current.logoUrl || '',
      emailLogoUrl: current.emailLogoUrl || '',
    };
    const state = {
      ...initial,
      pendingLogoFile: null, pendingLogoPreview: null,
      pendingEmailLogoFile: null, pendingEmailLogoPreview: null,
    };

    root.innerHTML = renderForm(state);
    bindForm(root, state);
    bindTabs(root);
    // El dominio tab se monta cuando se activa (lazy, ahorra una API call si no se visita)
    if (getActiveTab() === 'dominio') mountDomainSection();
  }

  function bindTabs(root) {
    const tabs = root.querySelectorAll('.ba-tab');
    const panels = root.querySelectorAll('.ba-tab-panel');
    const footer = root.querySelector('#ba-footer');

    function activate(id) {
      tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === id));
      panels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === id));
      if (footer) {
        const showIn = (footer.dataset.showIn || '').split(',').map(s => s.trim());
        footer.style.display = showIn.includes(id) ? '' : 'none';
      }
      setActiveTab(id);
      // Lazy-load del dominio (sólo cuando se entra a esa tab)
      if (id === 'dominio' && !root.querySelector('#domain-section-body')?.dataset.loaded) {
        mountDomainSection();
      }
    }

    tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));

    // Aplicar visibilidad inicial del footer según tab activo persistido
    const active = getActiveTab();
    if (footer) {
      const showIn = (footer.dataset.showIn || '').split(',').map(s => s.trim());
      footer.style.display = showIn.includes(active) ? '' : 'none';
    }
  }

  // ============================================================
  // Custom domain — sección self-service
  // ============================================================
  async function mountDomainSection() {
    const host = document.getElementById('domain-section-body');
    if (!host) return;
    host.dataset.loaded = '1';
    try {
      const state = await fetch('/api/org/domain', { credentials: 'include' }).then(r => {
        if (r.status === 401) throw new Error('Necesitas iniciar sesión como staff para gestionar el dominio.');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      paintDomainSection(host, state);
    } catch (e) {
      host.innerHTML = `<div class="dom-banner dom-banner--error">${escapeHtml(e.message)}</div>`;
    }
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function paintDomainSection(host, state) {
    const has = !!state.customDomain;
    const verified = !!state.verifiedAt;

    if (!has) {
      // Estado inicial: sin dominio configurado
      host.innerHTML = `
        <div class="dom-empty">
          <div class="dom-empty-row">
            <div class="dom-empty-form">
              <label class="dom-input-label" for="dom-input">Dominio o subdominio</label>
              <input id="dom-input" type="text" class="dom-input" placeholder="eventos.tu-organizacion.com" autocomplete="off" />
            </div>
            <button class="btn btn--primary dom-empty-submit" id="dom-submit">
              <i class="fa-solid fa-arrow-right"></i> Solicitar dominio
            </button>
          </div>
          <div class="form-hint dom-empty-hint">Sin <code>http://</code> ni <code>/</code>. Ejemplo: <code>eventos.centroculturalbanreservas.com</code></div>
        </div>`;
      document.getElementById('dom-submit').onclick = submitDomain;
      document.getElementById('dom-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') submitDomain();
      });
      return;
    }

    if (!verified) {
      // Estado pendiente: tiene dominio pero no verificado
      const inst = state.instructions || {};
      host.innerHTML = `
        <div class="dom-banner dom-banner--pending">
          <i class="fa-solid fa-clock dom-banner-icon"></i>
          <div class="dom-banner-body">
            <div class="dom-banner-title">Pendiente de verificación DNS</div>
            <div class="dom-banner-meta">Dominio solicitado: <code class="dom-code-inline">${escapeHtml(state.customDomain)}</code></div>
          </div>
        </div>

        <p class="dom-steps-title"><i class="fa-solid fa-list-ol"></i> Crea estos 2 registros DNS</p>

        <div class="dom-record">
          <div class="dom-record-step">PASO 1 · TXT DE VERIFICACIÓN</div>
          <div class="dom-record-rows">
            <div class="dom-record-label">Tipo</div>
            <div class="dom-record-value"><strong>TXT</strong></div>
            <div class="dom-record-label">Host / Nombre</div>
            <div class="dom-record-value"><code class="dom-code">${escapeHtml(inst.txt?.host || '')}</code><button type="button" class="dom-copy" data-copy="${escapeHtml(inst.txt?.host || '')}" title="Copiar"><i class="fa-regular fa-copy"></i></button></div>
            <div class="dom-record-label">Valor</div>
            <div class="dom-record-value"><code class="dom-code">${escapeHtml(inst.txt?.value || '')}</code><button type="button" class="dom-copy" data-copy="${escapeHtml(inst.txt?.value || '')}" title="Copiar"><i class="fa-regular fa-copy"></i></button></div>
          </div>
        </div>

        <div class="dom-record">
          <div class="dom-record-step">PASO 2 · CNAME PARA RUTEO</div>
          <div class="dom-record-rows">
            <div class="dom-record-label">Tipo</div>
            <div class="dom-record-value"><strong>CNAME</strong></div>
            <div class="dom-record-label">Host / Nombre</div>
            <div class="dom-record-value"><code class="dom-code">${escapeHtml(inst.cname?.host || '')}</code><button type="button" class="dom-copy" data-copy="${escapeHtml(inst.cname?.host || '')}" title="Copiar"><i class="fa-regular fa-copy"></i></button></div>
            <div class="dom-record-label">Apunta a</div>
            <div class="dom-record-value"><code class="dom-code">${escapeHtml(inst.cname?.value || '')}</code><button type="button" class="dom-copy" data-copy="${escapeHtml(inst.cname?.value || '')}" title="Copiar"><i class="fa-regular fa-copy"></i></button></div>
          </div>
        </div>

        <div class="dom-hint">
          <i class="fa-solid fa-circle-info"></i> La propagación DNS puede tardar entre 1 y 30 minutos.
          Cuando ambos registros estén creados, pulsa <strong>Verificar ahora</strong>.
        </div>

        <div id="dom-verify-result"></div>

        <div class="dom-actions">
          <button class="btn btn--primary" id="dom-verify"><i class="fa-solid fa-circle-check"></i> Verificar ahora</button>
          <button class="btn btn--ghost" id="dom-delete"><i class="fa-solid fa-trash"></i> Cancelar solicitud</button>
        </div>`;

      document.getElementById('dom-verify').onclick = verifyDomain;
      document.getElementById('dom-delete').onclick = deleteDomain;
      bindCopyButtons(host);
      return;
    }

    // Estado verificado
    host.innerHTML = `
      <div class="dom-banner dom-banner--success">
        <i class="fa-solid fa-circle-check dom-banner-icon"></i>
        <div class="dom-banner-body">
          <div class="dom-banner-title">Dominio verificado</div>
          <div class="dom-banner-meta">
            <code class="dom-code-inline">${escapeHtml(state.customDomain)}</code>
            <span class="dom-banner-when">· verificado el ${new Date(state.verifiedAt).toLocaleString('es-DO')}</span>
          </div>
        </div>
      </div>

      <div class="dom-hint">
        <i class="fa-solid fa-circle-info"></i> Si todavía no responde, nuestro equipo está activando el routing. Suele tardar pocos minutos. Una vez activo, podrás acceder a tu plataforma desde <strong>https://${escapeHtml(state.customDomain)}</strong>.
      </div>

      <div class="dom-actions">
        <button class="btn btn--ghost btn--sm" id="dom-delete"><i class="fa-solid fa-trash"></i> Remover dominio personalizado</button>
      </div>`;
    document.getElementById('dom-delete').onclick = deleteDomain;
  }

  function bindCopyButtons(host) {
    host.querySelectorAll('.dom-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(val);
          const prev = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-check"></i>';
          setTimeout(() => { btn.innerHTML = prev; }, 1200);
        } catch { /* ignore */ }
      });
    });
  }

  async function submitDomain() {
    const input = document.getElementById('dom-input');
    const domain = (input?.value || '').trim();
    if (!domain) {
      window.Toast?.error?.('Escribe un dominio');
      return;
    }
    const btn = document.getElementById('dom-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando…'; }
    try {
      const r = await fetch('/api/org/domain', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.Toast?.error?.(data.error || `Error ${r.status}`);
        return;
      }
      window.Toast?.success?.('Dominio registrado. Sigue las instrucciones para verificarlo.');
      mountDomainSection();
    } catch (e) {
      window.Toast?.error?.(e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Solicitar dominio'; }
    }
  }

  async function verifyDomain() {
    const btn = document.getElementById('dom-verify');
    const result = document.getElementById('dom-verify-result');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando DNS…'; }
    if (result) result.innerHTML = '';
    try {
      const r = await fetch('/api/org/domain/verify', { method: 'POST', credentials: 'include' });
      const data = await r.json().catch(() => ({}));
      if (data.verified) {
        window.Toast?.success?.('Dominio verificado');
        mountDomainSection();
      } else {
        if (result) {
          result.innerHTML = `<div class="dom-banner dom-banner--warning">
            <i class="fa-solid fa-triangle-exclamation dom-banner-icon"></i>
            <div class="dom-banner-body">
              <div class="dom-banner-title">Aún no podemos verificar</div>
              <div class="dom-banner-meta">${escapeHtml(data.reason || 'Sin razón clara')}</div>
            </div>
          </div>`;
        }
      }
    } catch (e) {
      window.Toast?.error?.(e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Verificar ahora'; }
    }
  }

  async function deleteDomain() {
    if (!confirm('¿Eliminar el dominio personalizado? Esta acción no es reversible — tendrás que volver a configurarlo si lo quieres usar después.')) return;
    try {
      const r = await fetch('/api/org/domain', { method: 'DELETE', credentials: 'include' });
      if (!r.ok && r.status !== 204) {
        const data = await r.json().catch(() => ({}));
        window.Toast?.error?.(data.error || `Error ${r.status}`);
        return;
      }
      window.Toast?.success?.('Dominio removido');
      mountDomainSection();
    } catch (e) {
      window.Toast?.error?.(e.message);
    }
  }

  const TABS = [
    { id: 'apariencia', label: 'Apariencia', icon: 'fa-palette', desc: 'Colores, sidebar y logo del panel' },
    { id: 'email',      label: 'Email',      icon: 'fa-envelope', desc: 'Logo en correos transaccionales' },
    { id: 'dominio',    label: 'Dominio',    icon: 'fa-globe', desc: 'Tu propio dominio personalizado' },
  ];
  const STORAGE_KEY_TAB = 'contan2.branding.tab';

  function getActiveTab() {
    const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY_TAB) : null;
    if (stored && TABS.some(t => t.id === stored)) return stored;
    return 'apariencia';
  }
  function setActiveTab(id) {
    try { localStorage.setItem(STORAGE_KEY_TAB, id); } catch { /* ignore */ }
  }

  function renderForm(s) {
    const active = getActiveTab();
    return `
      <div class="ba-page">
        <nav class="ba-tabs" role="tablist">
          ${TABS.map(t => `
            <button type="button" role="tab" class="ba-tab ${active === t.id ? 'is-active' : ''}" data-tab="${t.id}">
              <i class="fa-solid ${t.icon}"></i>
              <span>${t.label}</span>
            </button>`).join('')}
        </nav>

        <section class="ba-tab-panel ${active === 'apariencia' ? 'is-active' : ''}" data-panel="apariencia" role="tabpanel">
          <div class="branding-grid">
            <section class="card branding-card">
              <header class="card-head">
                <h2><i class="fa-solid fa-palette"></i> Colores</h2>
            <p>Selecciona tu color primario; el sistema deriva 10 tonos automáticamente.</p>
          </header>
          <div class="branding-fields">
            <div class="branding-field">
              <label>Color primario</label>
              <div class="color-input-row">
                <input type="color" id="b-primary" value="${s.primary}" />
                <input type="text" id="b-primary-hex" value="${s.primary}" maxlength="7" />
                <div class="palette-strip" id="b-primary-strip"></div>
              </div>
            </div>
            <div class="branding-field">
              <label>Color de acento</label>
              <div class="color-input-row">
                <input type="color" id="b-accent" value="${s.accent}" />
                <input type="text" id="b-accent-hex" value="${s.accent}" maxlength="7" />
              </div>
              <div class="form-hint">Se usa en botones de acción, indicadores activos y enlaces destacados.</div>
            </div>
            <div class="branding-contrast" id="b-contrast"></div>
          </div>
        </section>

        <section class="card branding-card">
          <header class="card-head">
            <h2><i class="fa-solid fa-sidebar"></i> Estilo del sidebar</h2>
            <p>Define cómo se ve el menú lateral del panel administrativo.</p>
          </header>
          <div class="preset-grid" id="b-presets">
            ${PRESETS.map(p => `
              <button type="button" class="preset-card ${p.id === s.sidebarStyle ? 'is-active' : ''}" data-preset="${p.id}">
                <div class="preset-swatch" style="background:${p.swatchVar}"></div>
                <div class="preset-info">
                  <div class="preset-label">${p.label}</div>
                  <div class="preset-desc">${p.desc}</div>
                </div>
                <i class="fa-solid fa-check preset-check"></i>
              </button>`).join('')}
          </div>
        </section>

        <section class="card branding-card">
          <header class="card-head">
            <h2><i class="fa-solid fa-image"></i> Logo principal</h2>
            <p>Para sidebar, kiosko, scanner, credenciales y reportes PDF. Suele aplicarse sobre fondo de marca, así que un PNG con transparencia y elementos claros funciona mejor.</p>
          </header>
          <div class="branding-logo-picker">
            <div class="branding-logo-preview branding-logo-preview--dark" id="b-logo-preview">
              ${(s.pendingLogoPreview || s.logoUrl)
                ? `<img src="${s.pendingLogoPreview || s.logoUrl}" alt="" />`
                : `<div class="branding-logo-empty"><i class="fa-solid fa-image"></i><span>Sin logo</span></div>`}
            </div>
            <div class="branding-logo-actions">
              <label class="btn btn--ghost btn--sm">
                <i class="fa-solid fa-arrow-up-from-bracket"></i>
                <span>${(s.pendingLogoPreview || s.logoUrl) ? 'Cambiar logo' : 'Subir logo'}</span>
                <input type="file" id="b-logo-input" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden />
              </label>
              ${(s.pendingLogoPreview || s.logoUrl)
                ? `<button type="button" class="btn btn--ghost btn--sm" id="b-logo-remove"><i class="fa-solid fa-xmark"></i> Quitar</button>`
                : ''}
              <div class="form-hint">PNG con fondo transparente recomendado. Máx 5 MB.</div>
            </div>
          </div>
        </section>

        <aside class="card branding-card branding-preview">
          <header class="card-head">
            <h2><i class="fa-solid fa-eye"></i> Vista previa</h2>
            <p>Cómo se vería el panel con esta configuración.</p>
          </header>
          <div class="mock-shell">
            <div class="mock-sidebar">
              <div class="mock-brand" id="b-mock-logo">
                ${(s.pendingLogoPreview || s.logoUrl)
                  ? `<img src="${s.pendingLogoPreview || s.logoUrl}" alt="" />`
                  : `<div class="mock-logo-placeholder">LOGO</div>`}
              </div>
              <div class="mock-link"><i class="fa-solid fa-gauge-high"></i> Dashboard</div>
              <div class="mock-link is-active"><i class="fa-solid fa-users"></i> Usuarios</div>
              <div class="mock-link"><i class="fa-solid fa-calendar-days"></i> Actividades</div>
              <div class="mock-link"><i class="fa-solid fa-layer-group"></i> Segmentos</div>
            </div>
            <div class="mock-content">
              <div class="mock-stat">
                <div class="mock-stat-icon" style="background:linear-gradient(135deg,var(--color-primary-700),var(--color-primary-400))"><i class="fa-solid fa-users"></i></div>
                <div><div class="mock-stat-label">Usuarios</div><div class="mock-stat-value">1.284</div></div>
              </div>
              <button class="mock-btn">Acción primaria</button>
            </div>
          </div>
        </aside>

          </div>
        </section>

        <section class="ba-tab-panel ${active === 'email' ? 'is-active' : ''}" data-panel="email" role="tabpanel">
          <div class="ba-stack">
            <section class="card branding-card">
              <header class="card-head">
                <h2><i class="fa-solid fa-envelope"></i> Logo para emails</h2>
                <p>Aparece en credencial digital y notificaciones (cancelaciones, invitaciones). Los clientes de email usan fondos claros, así que conviene una versión del logo en colores oscuros. Si lo dejas vacío, se usa el logo principal.</p>
              </header>
              <div class="branding-logo-picker">
                <div class="branding-logo-preview" id="b-email-logo-preview">
                  ${(s.pendingEmailLogoPreview || s.emailLogoUrl)
                    ? `<img src="${s.pendingEmailLogoPreview || s.emailLogoUrl}" alt="" />`
                    : `<div class="branding-logo-empty"><i class="fa-solid fa-image"></i><span>Sin logo de email</span></div>`}
                </div>
                <div class="branding-logo-actions">
                  <label class="btn btn--ghost btn--sm">
                    <i class="fa-solid fa-arrow-up-from-bracket"></i>
                    <span>${(s.pendingEmailLogoPreview || s.emailLogoUrl) ? 'Cambiar logo de email' : 'Subir logo de email'}</span>
                    <input type="file" id="b-email-logo-input" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden />
                  </label>
                  ${(s.pendingEmailLogoPreview || s.emailLogoUrl)
                    ? `<button type="button" class="btn btn--ghost btn--sm" id="b-email-logo-remove"><i class="fa-solid fa-xmark"></i> Quitar</button>`
                    : ''}
                  <div class="form-hint">PNG o JPG. Versión legible sobre fondo blanco. Máx 5 MB.</div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section class="ba-tab-panel ${active === 'dominio' ? 'is-active' : ''}" data-panel="dominio" role="tabpanel">
          <div class="ba-stack">
            <section class="card branding-card">
              <header class="card-head">
                <h2><i class="fa-solid fa-globe"></i> Dominio personalizado</h2>
                <p>Usa tu propio dominio (ej. <code>eventos.tu-organizacion.com</code>) en vez del subdominio que te asignamos. Requiere acceso al DNS de tu dominio.</p>
              </header>
              <div class="branding-fields">
                <div id="domain-section-body">
                  <div class="loader"><div class="spinner"></div></div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <footer class="branding-footer" id="ba-footer" data-show-in="apariencia,email">
          <button type="button" class="btn btn--ghost" id="b-reset"><i class="fa-solid fa-rotate-left"></i> Descartar cambios</button>
          <button type="button" class="btn btn--primary" id="b-save"><i class="fa-solid fa-floppy-disk"></i> Guardar identidad</button>
        </footer>
      </div>
    `;
  }

  function bindForm(root, state) {
    const $ = sel => root.querySelector(sel);
    const initialSnapshot = { ...state };

    const updatePreview = () => applyPreview({
      primary: state.primary,
      accent: state.accent,
      sidebarStyle: state.sidebarStyle,
    });

    const refreshStrip = () => {
      const pal = generatePalette(state.primary);
      const strip = $('#b-primary-strip');
      if (!pal || !strip) return;
      strip.innerHTML = STOPS.map(s => `<div class="palette-swatch" style="background:${pal[s.name]}" title="${s.name} · ${pal[s.name]}"></div>`).join('');
    };

    const refreshContrast = () => {
      const el = $('#b-contrast');
      if (!el) return;
      const onP = pickOn(state.primary);
      const ratio = contrastRatio(state.primary, onP);
      const accentOn = pickOn(state.accent);
      const accentRatio = contrastRatio(state.accent, accentOn);
      const fmt = r => r.toFixed(2);
      const tagFor = r => r >= 7 ? ['Excelente', 'ok'] : r >= 4.5 ? ['AA', 'ok'] : r >= 3 ? ['Bajo', 'warn'] : ['Insuficiente', 'bad'];
      const [pTag, pCls] = tagFor(ratio);
      const [aTag, aCls] = tagFor(accentRatio);
      el.innerHTML = `
        <div class="contrast-row">
          <span class="contrast-label">Texto sobre primario</span>
          <span class="contrast-value ${pCls}">${fmt(ratio)}:1 · ${pTag}</span>
        </div>
        <div class="contrast-row">
          <span class="contrast-label">Texto sobre acento</span>
          <span class="contrast-value ${aCls}">${fmt(accentRatio)}:1 · ${aTag}</span>
        </div>
        <div class="form-hint">Se ajusta automáticamente el color de texto (blanco o gris-900) según luminancia para mantener legibilidad.</div>
      `;
    };

    refreshStrip();
    refreshContrast();

    // Color primary
    const pColor = $('#b-primary'), pHex = $('#b-primary-hex');
    const onPrimaryChange = v => {
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
      state.primary = v.toLowerCase();
      pColor.value = state.primary; pHex.value = state.primary;
      refreshStrip(); refreshContrast(); updatePreview();
    };
    pColor.addEventListener('input', e => onPrimaryChange(e.target.value));
    pHex.addEventListener('change', e => onPrimaryChange(e.target.value.trim()));

    // Color accent
    const aColor = $('#b-accent'), aHex = $('#b-accent-hex');
    const onAccentChange = v => {
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
      state.accent = v.toLowerCase();
      aColor.value = state.accent; aHex.value = state.accent;
      refreshContrast(); updatePreview();
    };
    aColor.addEventListener('input', e => onAccentChange(e.target.value));
    aHex.addEventListener('change', e => onAccentChange(e.target.value.trim()));

    // Sidebar preset
    $('#b-presets').addEventListener('click', e => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      state.sidebarStyle = btn.dataset.preset;
      root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b === btn));
      updatePreview();
    });

    // Logo upload
    const logoInput = $('#b-logo-input');
    logoInput?.addEventListener('change', () => {
      const file = logoInput.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        window.Toast?.error?.('El logo excede 5 MB');
        logoInput.value = '';
        return;
      }
      state.pendingLogoFile = file;
      state.pendingLogoPreview = URL.createObjectURL(file);
      // Repinta previews
      $('#b-logo-preview').innerHTML = `<img src="${state.pendingLogoPreview}" alt="" />`;
      $('#b-mock-logo').innerHTML = `<img src="${state.pendingLogoPreview}" alt="" />`;
    });

    $('#b-logo-remove')?.addEventListener('click', () => {
      state.pendingLogoFile = null;
      state.pendingLogoPreview = null;
      state.logoUrl = '';
      $('#b-logo-preview').innerHTML = `<div class="branding-logo-empty"><i class="fa-solid fa-image"></i><span>Sin logo</span></div>`;
      $('#b-mock-logo').innerHTML = `<div class="mock-logo-placeholder">LOGO</div>`;
    });

    // Email logo upload (versión para clientes de correo)
    const emailLogoInput = $('#b-email-logo-input');
    emailLogoInput?.addEventListener('change', () => {
      const file = emailLogoInput.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        window.Toast?.error?.('El logo de email excede 5 MB');
        emailLogoInput.value = '';
        return;
      }
      state.pendingEmailLogoFile = file;
      state.pendingEmailLogoPreview = URL.createObjectURL(file);
      $('#b-email-logo-preview').innerHTML = `<img src="${state.pendingEmailLogoPreview}" alt="" />`;
    });

    $('#b-email-logo-remove')?.addEventListener('click', () => {
      state.pendingEmailLogoFile = null;
      state.pendingEmailLogoPreview = null;
      state.emailLogoUrl = '';
      $('#b-email-logo-preview').innerHTML = `<div class="branding-logo-empty"><i class="fa-solid fa-image"></i><span>Sin logo de email</span></div>`;
    });

    // Reset
    $('#b-reset').addEventListener('click', () => {
      Object.assign(state, initialSnapshot, {
        pendingLogoFile: null, pendingLogoPreview: null,
        pendingEmailLogoFile: null, pendingEmailLogoPreview: null,
      });
      // Limpia overrides para que branding.js / SSR vuelvan a aplicar lo guardado.
      const r = document.documentElement;
      ['--color-primary', '--k-primary', '--color-accent', '--k-accent',
       '--color-on-primary', '--k-on-primary', '--color-on-accent', '--k-on-accent',
       '--color-sidebar-bg-from', '--color-sidebar-bg-to', '--color-sidebar-text',
       '--color-sidebar-text-muted', '--color-sidebar-hover-bg', '--color-sidebar-border',
      ].forEach(k => r.style.removeProperty(k));
      for (const stop of STOPS) {
        r.style.removeProperty(`--color-primary-${stop.name}`);
        r.style.removeProperty(`--k-primary-${stop.name}`);
      }
      // Reaplicar lo cacheado del tenant para volver al estado guardado.
      try { sessionStorage.removeItem('_c2_tenant_v2'); } catch {}
      renderBranding();
    });

    // Save
    $('#b-save').addEventListener('click', async () => {
      const btn = $('#b-save');
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';
      try {
        let logoUrl = state.logoUrl || null;
        if (state.pendingLogoFile) {
          logoUrl = await uploadLogo(state.pendingLogoFile);
        }
        let emailLogoUrl = state.emailLogoUrl || null;
        if (state.pendingEmailLogoFile) {
          emailLogoUrl = await uploadLogo(state.pendingEmailLogoFile);
        }
        const payload = {
          primaryColor: state.primary,
          secondaryColor: state.accent,
          sidebarStyle: state.sidebarStyle,
          // Enviar siempre (null borra, string actualiza).
          logoUrl,
          emailLogoUrl,
        };

        await saveBranding(payload);
        try { sessionStorage.removeItem('_c2_tenant_v2'); } catch {}
        window.Toast?.success?.('Identidad de marca guardada');
        // Actualiza el logo del sidebar real del admin sin recarga.
        document.querySelectorAll('.brand-logo-img').forEach(img => {
          if (logoUrl) img.src = logoUrl;
        });
      } catch (e) {
        window.Toast?.error?.(e.message || 'Error al guardar');
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  }

  // Expose renderer for the router in app.js
  window.renderBranding = renderBranding;
})();
