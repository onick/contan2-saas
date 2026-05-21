// =============================================================================
// public-apps-admin.js · vista "Modo público" del admin.
// Hub que centraliza las apps de lobby (kiosko, scanner): URLs, QR para
// configurar en tablet, stats vivos del día, guía de setup.
// =============================================================================

(function () {
  const APPS = [
    {
      id: 'kiosko',
      label: 'Kiosko de auto-registro',
      tagline: 'El visitante se registra solo desde la tablet del lobby.',
      icon: 'fa-tablet-screen-button',
      color: 'primary',
      path: '/kiosko',
      flow: [
        'El visitante ingresa nombre, correo y teléfono',
        'El sistema le asigna su código CCB-XXXXXX',
        'Se le envía su credencial digital por correo',
        'Selecciona la actividad a la que viene',
      ],
      statsKey: 'newUsersToday',
      statsLabel: 'nuevos registros hoy',
    },
    {
      id: 'scanner',
      label: 'Scanner de check-in',
      tagline: 'El staff escanea el QR del visitante en la entrada.',
      icon: 'fa-qrcode',
      color: 'accent',
      path: '/scanner',
      flow: [
        'Staff abre la cámara desde la tablet',
        'Escanea el QR del correo del visitante',
        'El sistema confirma el check-in en la actividad activa',
        'Cuenta de asistencias se actualiza en vivo',
      ],
      statsKey: 'checkinsToday',
      statsLabel: 'check-ins hoy',
    },
  ];

  function escape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function nf(n) {
    return Number(n || 0).toLocaleString('es-DO');
  }

  function buildAppUrl(path) {
    return `${window.location.origin}${path}`;
  }

  function qrSrc(text, size = 220) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&qzone=1`;
  }

  async function renderPublicApps() {
    const root = document.getElementById('content');
    root.innerHTML = `
      <div class="pa">
        <header class="pa-intro">
          <div>
            <h2>Apps para el lobby</h2>
            <p>Estas son las pantallas que el público y el staff usan en la entrada del centro. Configúralas una vez en cada tablet y déjalas corriendo.</p>
          </div>
        </header>

        <div class="pa-grid">
          ${APPS.map(renderAppCard).join('')}
        </div>

        <section class="pa-guide">
          <header class="pa-guide-head">
            <h3><i class="fa-solid fa-circle-question"></i> ¿Cómo dejo una tablet lista para el lobby?</h3>
            <p>Pasos para que la tablet entre a la app y no permita salir.</p>
          </header>
          <div class="pa-guide-grid">
            ${renderGuideStep(1, 'fa-link', 'Abre la URL en la tablet', 'Usa la opción "Copiar enlace" de la card y pégalo en el navegador de la tablet. Más fácil: escanea el QR de la card desde la cámara del móvil del staff y enviáselo a la tablet, o ábrelo directo.')}
            ${renderGuideStep(2, 'fa-expand', 'Pantalla completa', 'En Chrome: pulsa <kbd>F11</kbd> o usa "Instalar app" desde el menú. En Safari iPad: "Compartir → Añadir a pantalla de inicio" — abre como app nativa.')}
            ${renderGuideStep(3, 'fa-lock', 'Bloqueo de salida (opcional)', 'iPad: "Acceso guiado" (Ajustes → Accesibilidad → Acceso guiado). Android: "Anclado de pantalla" en Seguridad. Evita que un visitante se navegue fuera de la app.')}
            ${renderGuideStep(4, 'fa-wifi', 'Wi-Fi estable y energía', 'Conecta la tablet al cargador (modo lobby es uso continuo) y asegúrate de que la Wi-Fi del centro tenga buena señal en la entrada.')}
          </div>
        </section>
      </div>
    `;

    bindCopyButtons(root);
    bindQrToggles(root);

    // Cargar stats vivos
    try {
      const ctx = await API.dashboard.checkinContext();
      const stats = ctx.stats || {};
      APPS.forEach(app => {
        const el = root.querySelector(`[data-app-stat="${app.id}"]`);
        if (!el) return;
        const value = stats[app.statsKey] ?? 0;
        el.innerHTML = `<strong>${nf(value)}</strong><span>${escape(app.statsLabel)}</span>`;
      });
    } catch (e) {
      // Silencioso: si falla el fetch, las stats simplemente no aparecen
      APPS.forEach(app => {
        const el = root.querySelector(`[data-app-stat="${app.id}"]`);
        if (el) el.innerHTML = '<span class="cell-muted">stats no disponibles</span>';
      });
    }
  }

  function renderAppCard(app) {
    const url = buildAppUrl(app.path);
    return `
      <article class="pa-card pa-card--${escape(app.color)}">
        <header class="pa-card-head">
          <div class="pa-card-icon"><i class="fa-solid ${escape(app.icon)}"></i></div>
          <div class="pa-card-info">
            <h3>${escape(app.label)}</h3>
            <p>${escape(app.tagline)}</p>
          </div>
        </header>

        <div class="pa-card-body">
          <div class="pa-url-row">
            <code class="pa-url" data-url="${escape(url)}">${escape(url)}</code>
            <button class="pa-icon-btn pa-copy" data-copy="${escape(url)}" title="Copiar URL"><i class="fa-regular fa-copy"></i></button>
          </div>

          <div class="pa-card-actions">
            <a class="btn btn--primary btn--sm" href="${escape(url)}" target="_blank" rel="noopener">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir en nueva pestaña
            </a>
            <button class="btn btn--ghost btn--sm pa-qr-toggle" data-qr-toggle="${escape(app.id)}">
              <i class="fa-solid fa-qrcode"></i> Mostrar QR
            </button>
          </div>

          <div class="pa-qr" id="pa-qr-${escape(app.id)}" hidden>
            <img alt="QR para ${escape(app.label)}" data-qr-src="${escape(qrSrc(url))}" />
            <p>Escanea desde tu móvil para abrir la URL al instante en la tablet de destino.</p>
          </div>

          <div class="pa-stat" data-app-stat="${escape(app.id)}">
            <div class="pa-stat-skel"></div>
          </div>

          <details class="pa-flow">
            <summary>¿Cómo funciona?</summary>
            <ol>
              ${app.flow.map(step => `<li>${escape(step)}</li>`).join('')}
            </ol>
          </details>
        </div>
      </article>
    `;
  }

  function renderGuideStep(n, icon, title, body) {
    return `
      <div class="pa-guide-step">
        <div class="pa-guide-num">${n}</div>
        <div class="pa-guide-content">
          <div class="pa-guide-title"><i class="fa-solid ${icon}"></i> ${escape(title)}</div>
          <div class="pa-guide-body">${body}</div>
        </div>
      </div>`;
  }

  function bindCopyButtons(root) {
    root.querySelectorAll('.pa-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(val);
          const prev = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-check"></i>';
          btn.classList.add('is-copied');
          setTimeout(() => {
            btn.innerHTML = prev;
            btn.classList.remove('is-copied');
          }, 1400);
          window.Toast?.success?.('URL copiada');
        } catch {
          window.Toast?.error?.('No fue posible copiar');
        }
      });
    });
  }

  function bindQrToggles(root) {
    root.querySelectorAll('.pa-qr-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.qrToggle;
        const wrap = document.getElementById(`pa-qr-${id}`);
        if (!wrap) return;
        const wasHidden = wrap.hidden;
        wrap.hidden = !wasHidden;
        btn.innerHTML = wasHidden
          ? '<i class="fa-solid fa-xmark"></i> Ocultar QR'
          : '<i class="fa-solid fa-qrcode"></i> Mostrar QR';
        if (wasHidden) {
          // Lazy-load del QR sólo cuando se abre
          const img = wrap.querySelector('img[data-qr-src]');
          if (img && !img.src) img.src = img.dataset.qrSrc;
        }
      });
    });
  }

  window.renderPublicApps = renderPublicApps;
})();
