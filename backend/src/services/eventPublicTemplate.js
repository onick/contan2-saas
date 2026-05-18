import { buildBrandingStyle, generatePalette, pickOn } from '../utils/palette.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function fmtDate(iso, locale = 'es-DO', timezone = 'America/Santo_Domingo') {
  try {
    return new Date(iso).toLocaleString(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return iso;
  }
}

function shortDescription(text, max = 180) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…';
}

function absoluteUrl(baseUrl, path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Construye la pagina HTML publica de una actividad — con Open Graph para
 * que WhatsApp / X / Facebook generen preview rico, y un form de reserva
 * que crea user + RSVP + dispara credencial por email.
 */
export function buildEventPageHtml({ organization, activity, baseUrl }) {
  const orgName = organization?.name || 'Centro Cultural';
  const orgSlug = organization?.slug || '';
  const primary = organization?.primaryColor || '#1a237e';
  const accent = organization?.secondaryColor || '#ff6f00';
  const palette = generatePalette(primary) || {};
  const onPrimary = pickOn(palette['700'] || primary);
  const brandingStyle = buildBrandingStyle(organization) || '';

  const ogImage = activity.imageUrl
    ? absoluteUrl(baseUrl, activity.imageUrl)
    : (organization?.logoUrl ? absoluteUrl(baseUrl, organization.logoUrl) : null);
  const logoUrl = organization?.logoUrl ? absoluteUrl(baseUrl, organization.logoUrl) : null;

  const slug = activity.slug;
  const pageUrl = `${baseUrl.replace(/\/+$/, '')}/eventos/${slug}`;

  const title = `${activity.name} · ${orgName}`;
  const description = shortDescription(
    activity.description ||
    `${activity.name} — ${fmtDate(activity.date, organization?.locale, organization?.timezone)} en ${activity.location}.`,
  );

  const cupoDisponible = Math.max(0, (activity.capacity || 0) - (activity.enrolledCount || 0));
  const lleno = cupoDisponible === 0;

  const dataPayload = {
    slug,
    activityId: activity.id,
    name: activity.name,
    pageUrl,
    orgName,
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="${escapeAttr(primary)}" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}" />

  <!-- Open Graph (WhatsApp, Facebook, LinkedIn, iMessage) -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeAttr(orgName)}" />
  <meta property="og:title" content="${escapeAttr(activity.name)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${escapeAttr(pageUrl)}" />
  ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta property="og:image:alt" content="${escapeAttr(activity.name)}" />` : ''}
  <meta property="og:locale" content="es_DO" />

  <!-- Twitter Cards -->
  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapeAttr(activity.name)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  ${ogImage ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />` : ''}

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

  ${brandingStyle}

  <style>
    *,*::before,*::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
      color: #1f2937;
      background: linear-gradient(180deg, #f7f8fb 0%, #eef1f7 100%);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    a { color: inherit; }

    .ev-shell { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }

    .ev-topbar {
      display: flex; align-items: center; gap: 14px;
      padding: 0 4px 24px;
    }
    .ev-topbar img { max-height: 44px; width: auto; }
    .ev-topbar .org {
      font-size: 13px; font-weight: 700; letter-spacing: 1.5px;
      text-transform: uppercase; color: #6b7280;
    }

    .ev-card {
      background: #ffffff;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
    }

    .ev-cover {
      position: relative;
      width: 100%; aspect-ratio: 16 / 9;
      background: linear-gradient(135deg, var(--color-primary-600, ${primary}) 0%, var(--color-primary-900, ${primary}) 100%);
      overflow: hidden;
    }
    .ev-cover img {
      position: absolute; inset: 0;
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .ev-cover .overlay {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%);
    }
    .ev-cover .badge {
      position: absolute; top: 16px; left: 16px;
      background: rgba(255,255,255,0.92);
      color: var(--color-primary-700, ${primary});
      padding: 6px 12px; border-radius: 999px;
      font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    }
    .ev-cover h1 {
      position: absolute; left: 24px; right: 24px; bottom: 20px;
      color: #fff; margin: 0;
      font-size: clamp(22px, 4vw, 34px); line-height: 1.15; font-weight: 800;
      text-shadow: 0 2px 16px rgba(0,0,0,0.4);
    }

    .ev-body { padding: 28px 28px 8px; }

    .ev-meta {
      display: grid; grid-template-columns: 1fr; gap: 12px;
      margin: 0 0 20px;
    }
    @media (min-width: 640px) {
      .ev-meta { grid-template-columns: 1fr 1fr; }
    }
    .ev-meta .row {
      display: flex; align-items: center; gap: 12px;
      font-size: 14px;
    }
    .ev-meta .row .ico {
      width: 36px; height: 36px; flex: 0 0 36px;
      border-radius: 10px;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--color-primary-50, #f0f6fb);
      color: var(--color-primary-700, ${primary});
      font-size: 16px;
    }
    .ev-meta .row .lbl { color: #6b7280; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600; }
    .ev-meta .row .val { color: #1f2937; font-weight: 600; }

    .ev-desc {
      font-size: 15px; line-height: 1.65; color: #374151;
      white-space: pre-wrap;
      margin: 4px 0 24px;
    }

    .ev-share {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 4px 0 24px;
      border-bottom: 1px solid #eef0f4;
      margin-bottom: 24px;
    }
    .ev-share .lbl {
      font-size: 12px; color: #6b7280; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;
      align-self: center; margin-right: 6px;
    }
    .ev-share a, .ev-share button {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 999px;
      background: #f3f4f6; color: #1f2937;
      font: inherit; font-size: 13px; font-weight: 600;
      text-decoration: none; border: 0; cursor: pointer;
      transition: background 120ms;
    }
    .ev-share a:hover, .ev-share button:hover { background: #e5e7eb; }
    .ev-share .wa { background: #25d366; color: #fff; }
    .ev-share .wa:hover { background: #1ebe5b; }
    .ev-share .tw { background: #111; color: #fff; }
    .ev-share .tw:hover { background: #000; }

    .ev-form-card {
      background: linear-gradient(180deg, #fafbff 0%, #f4f6fc 100%);
      border: 1px solid #eef1f7;
      border-radius: 18px;
      padding: 24px;
    }
    .ev-form-card h2 {
      margin: 0 0 4px;
      font-size: 20px; font-weight: 800; color: #1f2937;
    }
    .ev-form-card .sub { margin: 0 0 18px; font-size: 14px; color: #6b7280; }

    .ev-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
    @media (min-width: 640px) {
      .ev-grid.two { grid-template-columns: 1fr 1fr; }
    }

    .ev-field { display: flex; flex-direction: column; gap: 6px; }
    .ev-field label {
      font-size: 12px; font-weight: 700; color: #4b5563;
      letter-spacing: 0.3px; text-transform: uppercase;
    }
    .ev-field input {
      font: inherit; font-size: 15px;
      padding: 12px 14px;
      border: 1.5px solid #e5e7eb; border-radius: 10px;
      background: #fff; color: #1f2937;
      outline: none;
      transition: border-color 120ms, box-shadow 120ms;
    }
    .ev-field input:focus {
      border-color: var(--color-primary-500, ${primary});
      box-shadow: 0 0 0 4px var(--color-primary-100, rgba(0,0,0,0.06));
    }
    .ev-field .opt { color: #9ca3af; text-transform: none; font-weight: 500; }

    .ev-submit {
      margin-top: 18px; width: 100%;
      padding: 16px 20px;
      background: var(--color-primary-700, ${primary}); color: ${onPrimary};
      border: 0; border-radius: 12px;
      font: inherit; font-size: 16px; font-weight: 700;
      cursor: pointer;
      transition: filter 120ms, transform 120ms;
    }
    .ev-submit:hover { filter: brightness(1.05); }
    .ev-submit:active { transform: translateY(1px); }
    .ev-submit:disabled { opacity: 0.6; cursor: not-allowed; }

    .ev-cupo-warning {
      margin-top: 16px;
      padding: 12px 14px;
      background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px;
      color: #9a3412; font-size: 13px;
    }
    .ev-cupo-full {
      margin-top: 16px;
      padding: 14px;
      background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;
      color: #991b1b; font-size: 14px; font-weight: 600; text-align: center;
    }

    .ev-msg { margin-top: 14px; font-size: 14px; padding: 12px 14px; border-radius: 10px; display: none; }
    .ev-msg.err { display: block; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .ev-msg.ok  { display: block; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

    .ev-success {
      display: none;
      padding: 28px 24px; text-align: center;
    }
    .ev-success.on { display: block; }
    .ev-success .check {
      width: 64px; height: 64px; margin: 0 auto 14px;
      border-radius: 999px;
      background: #10b981; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 32px; font-weight: 800;
    }
    .ev-success h3 { margin: 0 0 6px; font-size: 22px; }
    .ev-success p { margin: 0 0 8px; color: #4b5563; font-size: 15px; line-height: 1.55; }
    .ev-success .code {
      display: inline-block; margin-top: 12px;
      padding: 8px 14px; border-radius: 8px;
      background: var(--color-primary-700, ${primary}); color: ${onPrimary};
      font-family: Menlo, Monaco, monospace; font-size: 16px; font-weight: 700; letter-spacing: 2px;
    }

    .ev-foot {
      margin-top: 20px;
      text-align: center; font-size: 12px; color: #9ca3af;
    }
  </style>
</head>
<body>
  <main class="ev-shell">
    <div class="ev-topbar">
      ${logoUrl ? `<img src="${escapeAttr(logoUrl)}" alt="${escapeAttr(orgName)}" />` : ''}
      <div class="org">${escapeHtml(orgName)}</div>
    </div>

    <article class="ev-card" id="evCard">
      <header class="ev-cover">
        ${activity.imageUrl ? `<img src="${escapeAttr(absoluteUrl(baseUrl, activity.imageUrl))}" alt="${escapeAttr(activity.name)}" />` : ''}
        <div class="overlay"></div>
        <div class="badge">${escapeHtml(activity.type || 'Actividad')}</div>
        <h1>${escapeHtml(activity.name)}</h1>
      </header>

      <div class="ev-body">
        <div class="ev-meta">
          <div class="row">
            <span class="ico">📅</span>
            <div>
              <div class="lbl">Fecha</div>
              <div class="val">${escapeHtml(fmtDate(activity.date, organization?.locale, organization?.timezone))}</div>
            </div>
          </div>
          <div class="row">
            <span class="ico">📍</span>
            <div>
              <div class="lbl">Lugar</div>
              <div class="val">${escapeHtml(activity.location)}</div>
            </div>
          </div>
        </div>

        ${activity.description ? `<div class="ev-desc">${escapeHtml(activity.description)}</div>` : ''}

        <div class="ev-share">
          <span class="lbl">Compartir</span>
          <a class="wa" target="_blank" rel="noopener"
             href="https://wa.me/?text=${encodeURIComponent(`${activity.name} — ${pageUrl}`)}">
            WhatsApp
          </a>
          <a class="tw" target="_blank" rel="noopener"
             href="https://twitter.com/intent/tweet?text=${encodeURIComponent(activity.name)}&url=${encodeURIComponent(pageUrl)}">
            X / Twitter
          </a>
          <button type="button" id="evCopyBtn">Copiar enlace</button>
        </div>

        ${lleno ? `
          <div class="ev-cupo-full">
            Cupo agotado para esta actividad. Síguenos para próximas fechas.
          </div>
        ` : `
          <section class="ev-form-card" id="evFormCard">
            <h2>Reserva tu cupo</h2>
            <p class="sub">Te enviaremos tu credencial digital por correo. Muéstrala en la entrada.</p>

            <form id="evReserveForm" novalidate>
              <div class="ev-grid two">
                <div class="ev-field">
                  <label for="ev-firstName">Nombre</label>
                  <input id="ev-firstName" name="firstName" type="text" required autocomplete="given-name" maxlength="50" />
                </div>
                <div class="ev-field">
                  <label for="ev-lastName">Apellido</label>
                  <input id="ev-lastName" name="lastName" type="text" required autocomplete="family-name" maxlength="50" />
                </div>
              </div>
              <div class="ev-grid" style="margin-top:14px;">
                <div class="ev-field">
                  <label for="ev-email">Correo electrónico</label>
                  <input id="ev-email" name="email" type="email" required autocomplete="email" maxlength="120" />
                </div>
              </div>
              <div class="ev-grid" style="margin-top:14px;">
                <div class="ev-field">
                  <label for="ev-phone">Teléfono <span class="opt">(opcional)</span></label>
                  <input id="ev-phone" name="phone" type="tel" autocomplete="tel" maxlength="20" />
                </div>
              </div>

              <button class="ev-submit" type="submit" id="evSubmit">Confirmar reserva</button>
              <div class="ev-msg" id="evMsg" role="status" aria-live="polite"></div>

              ${cupoDisponible <= 10 && cupoDisponible > 0 ? `
                <div class="ev-cupo-warning">
                  Quedan pocos cupos: solo ${cupoDisponible} disponible${cupoDisponible === 1 ? '' : 's'}.
                </div>
              ` : ''}
            </form>
          </section>

          <section class="ev-success" id="evSuccess" aria-live="polite">
            <div class="check">✓</div>
            <h3 id="evSuccessTitle">¡Reserva confirmada!</h3>
            <p>Te enviamos tu credencial digital con código QR a tu correo.</p>
            <p>Muéstrala en la entrada el día de la actividad.</p>
            <div class="code" id="evSuccessCode"></div>
          </section>
        `}

        <div class="ev-foot">
          ${escapeHtml(orgName)} · <a href="/">Ver todas las actividades</a>
        </div>
      </div>
    </article>
  </main>

  <script id="ev-data" type="application/json">${escapeJson(dataPayload)}</script>
  <script>
    (function () {
      var DATA = JSON.parse(document.getElementById('ev-data').textContent);

      // Copiar link
      var copyBtn = document.getElementById('evCopyBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var url = DATA.pageUrl;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              var prev = copyBtn.textContent;
              copyBtn.textContent = 'Copiado ✓';
              setTimeout(function () { copyBtn.textContent = prev; }, 1500);
            });
          } else {
            var ta = document.createElement('textarea');
            ta.value = url; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(ta);
            copyBtn.textContent = 'Copiado ✓';
          }
        });
      }

      var form = document.getElementById('evReserveForm');
      if (!form) return;

      var msgEl = document.getElementById('evMsg');
      var submit = document.getElementById('evSubmit');
      var formCard = document.getElementById('evFormCard');
      var success = document.getElementById('evSuccess');
      var successTitle = document.getElementById('evSuccessTitle');
      var successCode = document.getElementById('evSuccessCode');

      function showMsg(kind, text) {
        msgEl.className = 'ev-msg ' + kind;
        msgEl.textContent = text;
      }
      function clearMsg() {
        msgEl.className = 'ev-msg';
        msgEl.textContent = '';
      }
      function showSuccess(payload) {
        formCard.style.display = 'none';
        if (payload && payload.alreadyReserved) {
          successTitle.textContent = 'Ya tenías tu cupo reservado';
        }
        if (payload && payload.user && payload.user.code) {
          successCode.textContent = payload.user.code;
        } else {
          successCode.style.display = 'none';
        }
        success.classList.add('on');
        success.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        clearMsg();

        var fd = new FormData(form);
        var body = {
          firstName: String(fd.get('firstName') || '').trim(),
          lastName: String(fd.get('lastName') || '').trim(),
          email: String(fd.get('email') || '').trim(),
          phone: String(fd.get('phone') || '').trim() || null,
        };
        if (body.firstName.length < 2) { showMsg('err', 'Escribe tu nombre.'); return; }
        if (body.lastName.length < 2) { showMsg('err', 'Escribe tu apellido.'); return; }
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(body.email)) { showMsg('err', 'Escribe un correo válido.'); return; }

        submit.disabled = true;
        submit.textContent = 'Procesando…';

        try {
          var resp = await fetch('/api/public/events/' + encodeURIComponent(DATA.slug) + '/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'same-origin',
          });
          var data = null;
          try { data = await resp.json(); } catch (e) {}
          if (!resp.ok) {
            var errText = (data && data.error) ? data.error :
                          resp.status === 409 ? 'No fue posible reservar (cupo o conflicto).' :
                          resp.status === 429 ? 'Demasiadas solicitudes. Intenta de nuevo en un momento.' :
                          'Ocurrió un error. Intenta de nuevo.';
            showMsg('err', errText);
            submit.disabled = false;
            submit.textContent = 'Confirmar reserva';
            return;
          }
          showSuccess(data);
        } catch (e) {
          showMsg('err', 'Sin conexión. Verifica tu internet e intenta de nuevo.');
          submit.disabled = false;
          submit.textContent = 'Confirmar reserva';
        }
      });
    })();
  </script>
</body>
</html>`;
}
