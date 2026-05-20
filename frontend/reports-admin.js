// =============================================================================
// reports-admin.js · vista "Reportes" del admin · diseño pro
// Hero con quick reports + reporte personalizado colapsable + live preview
// con KPIs, sparkline diaria, distribución por tipo, comparativo vs periodo
// anterior, top actividades, e historial de descargas (localStorage).
// =============================================================================

(function () {
  const TYPES = [
    { value: 'exposicion', label: 'Exposición', icon: 'fa-image' },
    { value: 'concierto', label: 'Concierto', icon: 'fa-music' },
    { value: 'cine', label: 'Cine', icon: 'fa-film' },
    { value: 'taller', label: 'Taller', icon: 'fa-screwdriver-wrench' },
    { value: 'teatro', label: 'Teatro', icon: 'fa-masks-theater' },
    { value: 'conferencia', label: 'Conferencia', icon: 'fa-microphone' },
    { value: 'otro', label: 'Otro', icon: 'fa-calendar-day' },
  ];

  const HISTORY_KEY = 'contan2.reports.history';
  const HISTORY_MAX = 8;

  // ---------- date helpers ----------
  function toYmd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
  function startOfYear(d) { return new Date(d.getFullYear(), 0, 1); }
  function endOfYear(d) { return new Date(d.getFullYear(), 11, 31); }

  function quickReports(now = new Date()) {
    const thisMonth = { label: 'Este mes', sub: monthYear(now), from: toYmd(startOfMonth(now)), to: toYmd(endOfMonth(now)), icon: 'fa-calendar-days' };
    const last = addMonths(now, -1);
    const lastMonth = { label: 'Mes anterior', sub: monthYear(last), from: toYmd(startOfMonth(last)), to: toYmd(endOfMonth(last)), icon: 'fa-clock-rotate-left' };
    const ytd = { label: 'Año en curso', sub: `${now.getFullYear()} · YTD`, from: toYmd(startOfYear(now)), to: toYmd(now), icon: 'fa-chart-line' };
    return [thisMonth, lastMonth, ytd];
  }
  function monthYear(d) {
    return d.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  }

  function allPresets(now = new Date()) {
    const q = quickReports(now);
    const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    return [
      ...q,
      { label: `${now.getFullYear()} completo`, from: toYmd(startOfYear(now)), to: toYmd(endOfYear(now)) },
      { label: `${lastYear.getFullYear()}`, from: toYmd(startOfYear(lastYear)), to: toYmd(endOfYear(lastYear)) },
    ];
  }

  // ---------- format helpers ----------
  function nf(n) {
    return Number(n || 0).toLocaleString('es-DO');
  }
  function escape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rangeLabel(from, to) {
    if (!from || !to) return '';
    const f = new Date(from + 'T00:00:00');
    const t = new Date(to + 'T00:00:00');
    const sameYear = f.getFullYear() === t.getFullYear();
    const sameMonth = sameYear && f.getMonth() === t.getMonth();
    if (sameMonth && f.getDate() === 1 && t.getDate() === endOfMonth(f).getDate()) {
      return monthYear(f);
    }
    const fStr = f.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
    const tStr = t.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fStr} – ${tStr}`;
  }

  // ---------- history (localStorage) ----------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  }
  function pushHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    const trimmed = list.slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch {}
    paintHistory();
  }

  // ---------- main render ----------
  async function renderReports() {
    const root = document.getElementById('content');
    const quick = quickReports();
    root.innerHTML = `
      <div class="rp">
        <section class="rp-hero">
          <header class="rp-hero-head">
            <div>
              <h2>Informes rápidos</h2>
              <p>Un click para descargar los más comunes. La data se calcula en vivo desde tu base.</p>
            </div>
          </header>
          <div class="rp-quick-grid">
            ${quick.map((q, i) => `
              <article class="rp-quick" data-from="${q.from}" data-to="${q.to}">
                <div class="rp-quick-head">
                  <i class="fa-solid ${q.icon}"></i>
                  <div>
                    <div class="rp-quick-label">${escape(q.label)}</div>
                    <div class="rp-quick-sub">${escape(q.sub)}</div>
                  </div>
                </div>
                <div class="rp-quick-kpi" data-quick-kpi="${i}">
                  <div class="skeleton-block" style="height:36px;width:80px"></div>
                </div>
                <div class="rp-quick-actions">
                  <button class="btn btn--ghost btn--sm" data-quick-action="xlsx" data-from="${q.from}" data-to="${q.to}">
                    <i class="fa-solid fa-file-excel"></i> Excel
                  </button>
                  <button class="btn btn--primary btn--sm" data-quick-action="pdf" data-from="${q.from}" data-to="${q.to}">
                    <i class="fa-solid fa-file-pdf"></i> PDF
                  </button>
                </div>
              </article>`).join('')}
          </div>
        </section>

        <section class="rp-custom-card">
          <header class="rp-section-head">
            <div>
              <h2><i class="fa-solid fa-sliders"></i> Reporte personalizado</h2>
              <p>Afina el período, filtra por tipo de actividad y previsualiza antes de descargar.</p>
            </div>
            <button class="btn btn--ghost btn--sm" id="rp-toggle"><i class="fa-solid fa-chevron-down"></i> Mostrar</button>
          </header>
          <div class="rp-custom-body" id="rp-custom-body" hidden>
            <div class="rp-custom-grid">
              <div class="rp-custom-controls">
                <div class="rp-field">
                  <label>Rango rápido</label>
                  <div class="preset-pills" id="rp-presets">
                    ${allPresets().map((p, i) => `
                      <button type="button" class="preset-pill ${i === 0 ? 'is-active' : ''}" data-preset="${i}" data-from="${p.from}" data-to="${p.to}">
                        ${escape(p.label)}
                      </button>`).join('')}
                    <button type="button" class="preset-pill" data-preset="custom">Personalizado</button>
                  </div>
                </div>
                <div class="rp-row">
                  <div class="rp-field">
                    <label>Desde</label>
                    <input type="date" id="rp-from" value="${allPresets()[0].from}" />
                  </div>
                  <div class="rp-field">
                    <label>Hasta</label>
                    <input type="date" id="rp-to" value="${allPresets()[0].to}" />
                  </div>
                </div>
                <div class="rp-field">
                  <label>Tipos <span class="rp-field-hint">(vacío = todos)</span></label>
                  <div class="type-chips" id="rp-types">
                    ${TYPES.map(t => `
                      <label class="type-chip">
                        <input type="checkbox" value="${t.value}" />
                        <i class="fa-solid ${t.icon}"></i>
                        <span>${t.label}</span>
                      </label>`).join('')}
                  </div>
                </div>
                <div class="rp-download-bar">
                  <button class="btn btn--ghost" id="rp-dl-xlsx"><i class="fa-solid fa-file-excel"></i> Descargar Excel</button>
                  <button class="btn btn--primary" id="rp-dl-pdf"><i class="fa-solid fa-file-pdf"></i> Descargar PDF</button>
                </div>
              </div>

              <aside class="rp-preview" id="rp-preview">
                <div class="rp-preview-loader"><div class="spinner"></div><span>Calculando vista previa…</span></div>
              </aside>
            </div>
          </div>
        </section>

        <section class="rp-history-card" id="rp-history-card" hidden>
          <header class="rp-section-head">
            <div>
              <h2><i class="fa-solid fa-clock-rotate-left"></i> Descargas recientes</h2>
              <p>Acceso rápido a los últimos informes que generaste desde este navegador.</p>
            </div>
            <button class="btn btn--ghost btn--sm" id="rp-history-clear"><i class="fa-solid fa-trash"></i> Limpiar</button>
          </header>
          <div class="rp-history-list" id="rp-history-list"></div>
        </section>
      </div>
    `;
    bindAll(root);
    paintHistory();
    // Carga los KPIs de cada quick report
    quick.forEach((q, i) => loadQuickKpi(i, q));
  }

  // ---------- quick reports kpi ----------
  async function loadQuickKpi(i, q) {
    const slot = document.querySelector(`[data-quick-kpi="${i}"]`);
    if (!slot) return;
    try {
      const params = new URLSearchParams({ from: q.from, to: q.to });
      const res = await fetch(`/api/reports/period/preview?${params}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const s = data.summary;
      const delta = data.comparison?.deltas?.attendancesCount;
      slot.innerHTML = `
        <div class="rp-quick-main">${nf(s.attendancesCount)}</div>
        <div class="rp-quick-meta">
          <span>asistencias</span>
          ${renderDelta(delta)}
        </div>
        <div class="rp-quick-meta-sub">${nf(s.activitiesCount)} actividad${s.activitiesCount === 1 ? '' : 'es'} · ${nf(s.uniqueAttendees)} únicos</div>`;
    } catch (e) {
      slot.innerHTML = `<div class="rp-quick-meta" style="color:var(--color-danger,#991b1b)">No disponible</div>`;
    }
  }

  function renderDelta(pct) {
    if (pct == null) return '';
    if (pct === 0) return '<span class="rp-delta rp-delta--flat">= 0%</span>';
    const cls = pct > 0 ? 'rp-delta--up' : 'rp-delta--down';
    const arrow = pct > 0 ? '↑' : '↓';
    return `<span class="rp-delta ${cls}">${arrow} ${Math.abs(pct)}%</span>`;
  }

  // ---------- bind ----------
  function bindAll(root) {
    // Quick reports: click en card abre custom con ese rango; click en botón Excel/PDF descarga directo
    root.querySelectorAll('[data-quick-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const fmt = btn.dataset.quickAction;
        const from = btn.dataset.from;
        const to = btn.dataset.to;
        downloadDirect({ from, to, types: [] }, fmt);
      });
    });
    root.querySelectorAll('.rp-quick').forEach(card => {
      card.addEventListener('click', () => {
        const { from, to } = card.dataset;
        openCustom();
        root.querySelector('#rp-from').value = from;
        root.querySelector('#rp-to').value = to;
        // Match preset si coincide
        const match = root.querySelector(`[data-preset][data-from="${from}"][data-to="${to}"]`);
        root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b === match));
        refreshPreview();
      });
    });

    // Toggle de custom
    root.querySelector('#rp-toggle').addEventListener('click', () => {
      const isOpen = !root.querySelector('#rp-custom-body').hidden;
      if (isOpen) closeCustom(); else openCustom();
    });

    // Presets
    root.querySelector('#rp-presets').addEventListener('click', e => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b === btn));
      if (btn.dataset.preset !== 'custom') {
        root.querySelector('#rp-from').value = btn.dataset.from;
        root.querySelector('#rp-to').value = btn.dataset.to;
        refreshPreview();
      }
    });

    ['#rp-from', '#rp-to'].forEach(sel => {
      root.querySelector(sel).addEventListener('change', () => {
        root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b.dataset.preset === 'custom'));
        refreshPreview();
      });
    });

    root.querySelector('#rp-types').addEventListener('change', refreshPreview);

    root.querySelector('#rp-dl-xlsx').addEventListener('click', () => downloadFromForm('xlsx'));
    root.querySelector('#rp-dl-pdf').addEventListener('click', () => downloadFromForm('pdf'));

    // Historial
    root.querySelector('#rp-history-clear').addEventListener('click', () => {
      try { localStorage.removeItem(HISTORY_KEY); } catch {}
      paintHistory();
    });
  }

  function openCustom() {
    const body = document.querySelector('#rp-custom-body');
    const toggle = document.querySelector('#rp-toggle');
    if (!body) return;
    body.hidden = false;
    if (toggle) toggle.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Ocultar';
    if (!body.dataset.loaded) {
      body.dataset.loaded = '1';
      refreshPreview();
    }
  }
  function closeCustom() {
    const body = document.querySelector('#rp-custom-body');
    const toggle = document.querySelector('#rp-toggle');
    if (!body) return;
    body.hidden = true;
    if (toggle) toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Mostrar';
  }

  function buildQuery() {
    const root = document.getElementById('content');
    const from = root.querySelector('#rp-from').value;
    const to = root.querySelector('#rp-to').value;
    const types = [...root.querySelectorAll('#rp-types input:checked')].map(i => i.value);
    const params = new URLSearchParams({ from, to });
    if (types.length) params.set('types', types.join(','));
    return { from, to, types, qs: params.toString() };
  }

  // ---------- preview ----------
  let _previewToken = 0;
  async function refreshPreview() {
    const previewEl = document.querySelector('#rp-preview');
    if (!previewEl) return;
    const myToken = ++_previewToken;
    previewEl.innerHTML = `<div class="rp-preview-loader"><div class="spinner"></div><span>Calculando…</span></div>`;
    try {
      const { qs } = buildQuery();
      const res = await fetch(`/api/reports/period/preview?${qs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (myToken !== _previewToken) return; // respuesta tardía: ignorar
      previewEl.innerHTML = renderPreview(data);
    } catch (e) {
      if (myToken !== _previewToken) return;
      previewEl.innerHTML = `<div class="rp-preview-error"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>No pudimos calcular la vista previa</strong><div>${escape(e.message)}</div></div></div>`;
    }
  }

  function renderPreview(data) {
    const s = data.summary;
    const cmp = data.comparison;
    const empty = s.activitiesCount === 0;
    return `
      <div class="rp-preview-content">
        <div class="rp-preview-range">
          <i class="fa-solid fa-calendar-range"></i>
          ${escape(rangeLabel(data.range.from?.slice?.(0,10) || data.range.from, data.range.to?.slice?.(0,10) || data.range.to))}
        </div>
        <div class="rp-kpis">
          ${kpiCard('Asistencias', s.attendancesCount, cmp?.deltas?.attendancesCount, 'fa-users', 'primary')}
          ${kpiCard('Actividades', s.activitiesCount, cmp?.deltas?.activitiesCount, 'fa-calendar-days')}
          ${kpiCard('Únicos', s.uniqueAttendees, cmp?.deltas?.uniqueAttendees, 'fa-user-check')}
          ${kpiCard('Ocup. prom.', s.avgOccupancy, cmp?.deltas?.avgOccupancy, 'fa-chart-pie', null, '%')}
        </div>
        ${empty ? renderEmpty(cmp) : ''}
        ${!empty && data.byDay && data.byDay.length > 1 ? `
          <div class="rp-block">
            <div class="rp-block-head"><h4>Asistencias por día</h4><span class="rp-block-sub">${data.byDay.length} día${data.byDay.length===1?'':'s'}</span></div>
            ${renderSparkline(data.byDay)}
          </div>` : ''}
        ${!empty && data.byType && data.byType.length ? `
          <div class="rp-block">
            <div class="rp-block-head"><h4>Distribución por tipo</h4></div>
            ${renderTypeDist(data.byType, s.attendancesCount)}
          </div>` : ''}
        ${!empty && data.topActivities && data.topActivities.length ? `
          <div class="rp-block">
            <div class="rp-block-head"><h4>Top actividades</h4></div>
            <ul class="rp-top-list">
              ${data.topActivities.slice(0, 5).map((t, i) => `
                <li>
                  <span class="rp-top-rank">${i + 1}</span>
                  <span class="rp-top-name">${escape(t.name)}</span>
                  <span class="rp-top-meta">${nf(t.attendances)}</span>
                </li>`).join('')}
            </ul>
          </div>` : ''}
      </div>`;
  }

  function kpiCard(label, value, delta, icon, variant, suffix) {
    return `
      <div class="rp-kpi ${variant === 'primary' ? 'rp-kpi--primary' : ''}">
        <div class="rp-kpi-head">
          <i class="fa-solid ${icon}"></i>
          <span>${escape(label)}</span>
        </div>
        <div class="rp-kpi-value">${nf(value)}${suffix || ''}</div>
        ${delta != null ? `<div class="rp-kpi-delta">${renderDelta(delta)} vs anterior</div>` : ''}
      </div>`;
  }

  function renderEmpty(cmp) {
    const suggestion = cmp && cmp.previous && cmp.previous.attendancesCount > 0
      ? `<div class="rp-empty-hint">El período anterior (${escape(rangeLabel(cmp.previousRange.from, cmp.previousRange.to))}) tuvo <strong>${nf(cmp.previous.attendancesCount)}</strong> asistencias. ¿Probar ese rango?</div>`
      : '';
    return `
      <div class="rp-empty">
        <i class="fa-solid fa-folder-open"></i>
        <h3>Sin actividades en este rango</h3>
        <p>Ajusta las fechas o filtros para ver datos.</p>
        ${suggestion}
      </div>`;
  }

  // ---------- sparkline ----------
  function renderSparkline(byDay) {
    const w = 480, h = 80, pad = 4;
    const values = byDay.map(d => d.attendances);
    const max = Math.max(1, ...values);
    const stepX = (w - pad * 2) / Math.max(1, byDay.length - 1);
    const points = byDay.map((d, i) => {
      const x = pad + i * stepX;
      const y = h - pad - (d.attendances / max) * (h - pad * 2);
      return [x, y];
    });
    const linePath = points.map((p, i) => (i === 0 ? `M ${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)).join(' ');
    const areaPath = `${linePath} L ${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad.toFixed(1)} ${(h - pad).toFixed(1)} Z`;
    const peak = byDay.reduce((best, cur, i) => cur.attendances > best.v ? { v: cur.attendances, i } : best, { v: -1, i: -1 });
    const peakDate = peak.i >= 0 ? byDay[peak.i].date : null;
    return `
      <div class="rp-sparkline">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="rp-sparkline-svg">
          <defs>
            <linearGradient id="rp-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#rp-spark-fill)" />
          <path d="${linePath}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          ${peak.i >= 0 && peak.v > 0 ? `<circle cx="${points[peak.i][0].toFixed(1)}" cy="${points[peak.i][1].toFixed(1)}" r="3.5" fill="var(--color-primary)" stroke="white" stroke-width="2"/>` : ''}
        </svg>
        <div class="rp-sparkline-meta">
          <span>${escape(byDay[0]?.date.slice(5) || '')}</span>
          ${peakDate && peak.v > 0 ? `<span class="rp-sparkline-peak">Pico: ${nf(peak.v)} · ${escape(peakDate.slice(5))}</span>` : ''}
          <span>${escape(byDay[byDay.length - 1]?.date.slice(5) || '')}</span>
        </div>
      </div>`;
  }

  // ---------- type distribution (horizontal bars) ----------
  function renderTypeDist(byType, total) {
    const max = Math.max(1, ...byType.map(t => t.attendances));
    return `
      <ul class="rp-type-list">
        ${byType.slice(0, 6).map(t => {
          const pct = total > 0 ? Math.round((t.attendances / total) * 100) : 0;
          const w = Math.max(2, Math.round((t.attendances / max) * 100));
          return `
            <li class="rp-type-row">
              <span class="rp-type-name">${escape(t.label)}</span>
              <div class="rp-type-bar"><div class="rp-type-bar-fill" style="width:${w}%"></div></div>
              <span class="rp-type-val">${nf(t.attendances)} <small>· ${pct}%</small></span>
            </li>`;
        }).join('')}
      </ul>`;
  }

  // ---------- downloads ----------
  async function downloadFromForm(format) {
    const { from, to, types, qs } = buildQuery();
    if (!from || !to) {
      window.Toast?.error?.('Selecciona fechas válidas');
      return;
    }
    const btn = document.querySelector(`#rp-dl-${format}`);
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando…';
    try {
      const filename = await fetchAndSaveBlob(`/api/reports/period.${format}?${qs}`, format);
      pushHistory({ from, to, types, format, filename, generatedAt: new Date().toISOString() });
      window.Toast?.success?.(`Informe ${format.toUpperCase()} listo`);
    } catch (e) {
      window.Toast?.error?.(e.message || 'No se pudo generar el informe');
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  async function downloadDirect({ from, to, types }, format) {
    const params = new URLSearchParams({ from, to });
    if (types && types.length) params.set('types', types.join(','));
    try {
      const filename = await fetchAndSaveBlob(`/api/reports/period.${format}?${params}`, format);
      pushHistory({ from, to, types: types || [], format, filename, generatedAt: new Date().toISOString() });
      window.Toast?.success?.(`Informe ${format.toUpperCase()} listo`);
    } catch (e) {
      window.Toast?.error?.(e.message || 'No se pudo generar el informe');
    }
  }

  async function fetchAndSaveBlob(url, format) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename="?([^"]+)"?/i.exec(cd);
    const filename = m ? m[1] : `Informe_periodo.${format}`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(objUrl);
    return filename;
  }

  // ---------- history paint ----------
  function paintHistory() {
    const list = loadHistory();
    const card = document.querySelector('#rp-history-card');
    const listEl = document.querySelector('#rp-history-list');
    if (!card || !listEl) return;
    if (list.length === 0) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    listEl.innerHTML = list.map((h, i) => `
      <div class="rp-history-item">
        <i class="fa-solid ${h.format === 'pdf' ? 'fa-file-pdf' : 'fa-file-excel'} rp-history-icon"></i>
        <div class="rp-history-info">
          <div class="rp-history-name">${escape(h.filename || '—')}</div>
          <div class="rp-history-meta">${escape(rangeLabel(h.from, h.to))} · ${escape(new Date(h.generatedAt).toLocaleString('es-DO'))}</div>
        </div>
        <button class="btn btn--ghost btn--sm" data-history-redo="${i}"><i class="fa-solid fa-rotate"></i> Regenerar</button>
      </div>`).join('');
    listEl.querySelectorAll('[data-history-redo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.historyRedo);
        const item = list[idx];
        if (!item) return;
        downloadDirect({ from: item.from, to: item.to, types: item.types || [] }, item.format);
      });
    });
  }

  window.renderReports = renderReports;
})();
