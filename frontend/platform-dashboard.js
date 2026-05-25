// =============================================================================
// platform-dashboard.js · dashboard mínimo del super admin
// =============================================================================

(async function () {
  // 1. Verificar sesión
  let admin;
  try {
    const res = await fetch('/api/platform/auth/me', { credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.href = '/login?next=' + encodeURIComponent('/');
      return;
    }
    const data = await res.json();
    admin = data.admin;
  } catch (e) {
    window.location.href = '/login';
    return;
  }

  document.getElementById('pf-user-name').textContent = admin.fullName || admin.email;

  // 2. Botón logout
  document.getElementById('pf-logout-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/platform/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    window.location.href = '/login';
  });

  // 3. Cargar lista de tenants
  try {
    const res = await fetch('/api/platform/tenants', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      paintKpis(data.kpis || {});
      paintTenants(data.tenants || []);
    } else {
      // Endpoint /api/platform/tenants no existe aún (es para Sprint 2)
      paintKpis({});
      document.getElementById('pf-tenants-host').innerHTML = `
        <div class="pf-empty">
          La gestión completa de tenants llega en el Sprint 2.<br>
          Tu sesión está activa correctamente.
        </div>`;
    }
  } catch (e) {
    paintKpis({});
    document.getElementById('pf-tenants-host').innerHTML = `
      <div class="pf-empty">No pudimos cargar tenants ahora mismo.</div>`;
  }

  function paintKpis(k) {
    const fmt = n => Number(n || 0).toLocaleString('es-DO');
    document.getElementById('kpi-tenants').textContent = fmt(k.tenants);
    document.getElementById('kpi-users').textContent = fmt(k.users);
    document.getElementById('kpi-attendances').textContent = fmt(k.attendances);
    document.getElementById('kpi-activities').textContent = fmt(k.activeActivities);
  }

  function paintTenants(tenants) {
    const host = document.getElementById('pf-tenants-host');
    if (!tenants.length) {
      host.innerHTML = `<div class="pf-empty">Aún no hay tenants.</div>`;
      return;
    }
    host.innerHTML = `
      <table class="pf-table">
        <thead>
          <tr>
            <th>Tenant</th><th>Slug</th><th>Plan</th><th>Estado</th><th>Usuarios</th><th>Asist.</th>
          </tr>
        </thead>
        <tbody>
          ${tenants.map(t => `
            <tr>
              <td><strong>${escape(t.name || '—')}</strong></td>
              <td><code style="color:#94a3b8">${escape(t.slug || '')}</code></td>
              <td>${escape(t.plan || '—')}</td>
              <td><span class="pf-tag pf-tag--${t.status === 'active' ? 'active' : 'suspended'}">${escape(t.status || '—')}</span></td>
              <td>${Number(t.usersCount || 0).toLocaleString('es-DO')}</td>
              <td>${Number(t.attendancesCount || 0).toLocaleString('es-DO')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function escape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
