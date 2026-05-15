// =============================================================================
// reports-admin.js · vista "Reportes" del admin.
// Form de período (preset o rango custom) + filtro por tipos + descarga
// Excel y PDF.
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

  function toYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
  function startOfYear(d) { return new Date(d.getFullYear(), 0, 1); }
  function endOfYear(d) { return new Date(d.getFullYear(), 11, 31); }

  function presetsFor(now = new Date()) {
    const thisMonthFrom = toYmd(startOfMonth(now));
    const thisMonthTo = toYmd(endOfMonth(now));
    const lastMonth = addMonths(now, -1);
    const lastMonthFrom = toYmd(startOfMonth(lastMonth));
    const lastMonthTo = toYmd(endOfMonth(lastMonth));
    const ytdFrom = toYmd(startOfYear(now));
    const ytdTo = toYmd(now);
    const yearFrom = toYmd(startOfYear(now));
    const yearTo = toYmd(endOfYear(now));
    const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const lastYearFrom = toYmd(startOfYear(lastYear));
    const lastYearTo = toYmd(endOfYear(lastYear));
    return [
      { id: 'this-month', label: 'Este mes', from: thisMonthFrom, to: thisMonthTo },
      { id: 'last-month', label: 'Mes anterior', from: lastMonthFrom, to: lastMonthTo },
      { id: 'ytd', label: 'Año en curso (YTD)', from: ytdFrom, to: ytdTo },
      { id: 'year', label: `${now.getFullYear()}`, from: yearFrom, to: yearTo },
      { id: 'last-year', label: `${lastYear.getFullYear()}`, from: lastYearFrom, to: lastYearTo },
    ];
  }

  async function renderReports() {
    const root = document.getElementById('content');
    const presets = presetsFor();
    const initial = presets[0];
    root.innerHTML = `
      <div class="reports-grid">
        <section class="card reports-card">
          <header class="card-head">
            <h2><i class="fa-solid fa-calendar-range"></i> Período</h2>
            <p>Define el rango y los tipos de actividad a incluir en el informe.</p>
          </header>
          <div class="reports-fields">
            <div class="reports-field">
              <label>Rangos rápidos</label>
              <div class="preset-pills" id="r-presets">
                ${presets.map((p, i) => `
                  <button type="button" class="preset-pill ${i === 0 ? 'is-active' : ''}" data-preset="${p.id}" data-from="${p.from}" data-to="${p.to}">
                    ${p.label}
                  </button>`).join('')}
                <button type="button" class="preset-pill" data-preset="custom">Personalizado</button>
              </div>
            </div>
            <div class="reports-row">
              <div class="reports-field">
                <label>Desde</label>
                <input type="date" id="r-from" value="${initial.from}" />
              </div>
              <div class="reports-field">
                <label>Hasta</label>
                <input type="date" id="r-to" value="${initial.to}" />
              </div>
            </div>
            <div class="reports-field">
              <label>Tipos (vacío = todos)</label>
              <div class="type-chips" id="r-types">
                ${TYPES.map(t => `
                  <label class="type-chip">
                    <input type="checkbox" value="${t.value}" />
                    <i class="fa-solid ${t.icon}"></i>
                    <span>${t.label}</span>
                  </label>`).join('')}
              </div>
            </div>
          </div>
          <footer class="reports-footer">
            <button type="button" class="btn btn--ghost" data-r-format="xlsx" id="r-download-xlsx">
              <i class="fa-solid fa-file-excel"></i> Descargar Excel
            </button>
            <button type="button" class="btn btn--primary" data-r-format="pdf" id="r-download-pdf">
              <i class="fa-solid fa-file-pdf"></i> Descargar PDF
            </button>
          </footer>
        </section>

        <aside class="card reports-card reports-preview" id="r-preview">
          <header class="card-head">
            <h2><i class="fa-solid fa-magnifying-glass-chart"></i> Vista previa</h2>
            <p>Resumen rápido del período seleccionado.</p>
          </header>
          <div class="preview-loader"><div class="spinner"></div></div>
        </aside>
      </div>
    `;
    bindReports(root);
    refreshPreview();
  }

  function buildQuery(root) {
    const from = root.querySelector('#r-from').value;
    const to = root.querySelector('#r-to').value;
    const types = [...root.querySelectorAll('#r-types input:checked')].map(i => i.value);
    const params = new URLSearchParams({ from, to });
    if (types.length) params.set('types', types.join(','));
    return { from, to, types, qs: params.toString() };
  }

  async function refreshPreview() {
    const root = document.getElementById('content');
    const previewEl = root.querySelector('#r-preview');
    previewEl.querySelector('.preview-loader, .preview-content')?.remove();
    const slot = document.createElement('div');
    slot.className = 'preview-loader';
    slot.innerHTML = '<div class="spinner"></div>';
    previewEl.appendChild(slot);
    try {
      const { qs } = buildQuery(root);
      const res = await fetch(`/api/reports/period/preview?${qs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      slot.remove();
      const cnt = document.createElement('div');
      cnt.className = 'preview-content';
      cnt.innerHTML = renderPreviewHtml(data);
      previewEl.appendChild(cnt);
    } catch (e) {
      slot.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Vista previa no disponible</h3><p>${e.message}</p></div>`;
    }
  }

  function renderPreviewHtml(data) {
    const s = data.summary;
    const top = (data.topActivities || []).slice(0, 5);
    const byType = (data.byType || []).slice(0, 6);
    return `
      <div class="preview-kpis">
        <div class="preview-kpi"><span>Actividades</span><strong>${s.activitiesCount}</strong></div>
        <div class="preview-kpi preview-kpi--accent"><span>Asistencias</span><strong>${s.attendancesCount}</strong></div>
        <div class="preview-kpi"><span>Únicos</span><strong>${s.uniqueAttendees}</strong></div>
        <div class="preview-kpi"><span>Ocup. prom.</span><strong>${s.avgOccupancy}%</strong></div>
      </div>
      ${top.length ? `
        <div class="preview-block">
          <h4>Top actividades</h4>
          <ul class="preview-list">
            ${top.map(t => `<li><span>${escape(t.name)}</span><strong>${t.attendances}</strong></li>`).join('')}
          </ul>
        </div>` : ''}
      ${byType.length ? `
        <div class="preview-block">
          <h4>Por tipo</h4>
          <ul class="preview-list">
            ${byType.map(t => `<li><span>${escape(t.label)}</span><strong>${t.attendances}</strong></li>`).join('')}
          </ul>
        </div>` : ''}
      ${s.activitiesCount === 0 ? `<div class="empty"><i class="fa-solid fa-folder-open"></i><h3>Sin actividades en este rango</h3><p>Ajusta las fechas o filtros.</p></div>` : ''}
    `;
  }
  function escape(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function bindReports(root) {
    // Presets
    root.querySelector('#r-presets').addEventListener('click', e => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b === btn));
      if (btn.dataset.preset !== 'custom') {
        root.querySelector('#r-from').value = btn.dataset.from;
        root.querySelector('#r-to').value = btn.dataset.to;
        refreshPreview();
      }
    });
    // Date inputs cambian a "custom" si user edita
    ['#r-from', '#r-to'].forEach(sel => {
      root.querySelector(sel).addEventListener('change', () => {
        root.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b.dataset.preset === 'custom'));
        refreshPreview();
      });
    });
    // Types
    root.querySelector('#r-types').addEventListener('change', refreshPreview);

    // Downloads
    root.querySelector('#r-download-xlsx').addEventListener('click', () => download(root, 'xlsx'));
    root.querySelector('#r-download-pdf').addEventListener('click', () => download(root, 'pdf'));
  }

  async function download(root, format) {
    const btn = root.querySelector(`#r-download-${format}`);
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando…';
    try {
      const { from, to, qs } = buildQuery(root);
      if (!from || !to) throw new Error('Selecciona fechas válidas');
      const res = await fetch(`/api/reports/period.${format}?${qs}`, { credentials: 'same-origin' });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const filename = m ? m[1] : `Informe_periodo.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      window.Toast?.success?.(`Informe ${format.toUpperCase()} generado`);
    } catch (e) {
      window.Toast?.error?.(e.message || 'No se pudo generar el informe');
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  window.renderReports = renderReports;
})();
