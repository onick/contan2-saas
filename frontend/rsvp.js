'use strict';

function $(s) { return document.querySelector(s); }
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getToken() {
  // URL path: /rsvp/<token>
  const parts = location.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function getActionFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get('action'); // 'yes' | 'no' | null
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function fetchInvitation(token) {
  const res = await fetch(`/api/public/rsvp/${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function postRsvp(token, action) {
  const res = await fetch(`/api/public/rsvp/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function renderError(title, msg, icon = 'error') {
  $('#r-root').innerHTML = `
    <div class="r-card">
      <div class="r-state">
        <div class="r-state-icon r-state-icon--${icon}">
          <i>${icon === 'error' ? '✕' : icon === 'success' ? '✓' : icon === 'info' ? 'i' : '!'}</i>
        </div>
        <div class="r-state-title">${escapeHtml(title)}</div>
        <div class="r-state-msg">${escapeHtml(msg)}</div>
      </div>
    </div>`;
}

function renderInvitation(data) {
  const { invitation, activity, user, organization } = data;
  const greeting = user?.firstName ? `Hola <strong>${escapeHtml(user.firstName)}</strong>,` : 'Hola,';
  const orgName = organization?.name || 'Centro Cultural';

  if (invitation.status === 'expired') {
    return renderError(
      'Invitación expirada',
      'Esta invitación ya no es válida. La actividad puede haber pasado o el plazo de respuesta venció.',
      'info',
    );
  }
  if (invitation.status === 'canceled') {
    return renderError(
      'Invitación cancelada',
      'Esta invitación fue cancelada por el administrador.',
      'info',
    );
  }
  if (invitation.status === 'confirmed') {
    return renderError(
      '¡Ya confirmaste tu asistencia!',
      `Te esperamos en ${activity?.name || 'la actividad'}.`,
      'success',
    );
  }
  if (invitation.status === 'declined') {
    return renderError(
      'Respuesta registrada',
      `Indicaste que no podrás asistir a ${activity?.name || 'esta actividad'}. Gracias por avisarnos.`,
      'declined',
    );
  }
  if (activity?.status === 'cancelada') {
    return renderError(
      'Actividad cancelada',
      `${activity.name} fue cancelada. Disculpa los inconvenientes.`,
      'info',
    );
  }
  if (activity?.status === 'finalizada') {
    return renderError(
      'Actividad finalizada',
      `${activity.name} ya tuvo lugar.`,
      'info',
    );
  }

  $('#r-root').innerHTML = `
    <div class="r-card">
      <div class="r-header">
        ${organization?.logoUrl ? `<img src="${escapeHtml(organization.logoUrl)}" alt="${escapeHtml(orgName)}" class="r-org-logo" data-org-logo />` : ''}
        <div class="r-org-name" data-org-name>${escapeHtml(orgName)}</div>
        <div class="r-title">Te invitamos a una actividad</div>
        <div class="r-greeting">${greeting}</div>
      </div>
      <div class="r-activity">
        <div class="r-activity-name">${escapeHtml(activity.name)}</div>
        <div class="r-activity-meta">
          <div><span class="r-icon">📅</span>${escapeHtml(formatDate(activity.date))}</div>
          <div><span class="r-icon">📍</span>${escapeHtml(activity.location)}</div>
        </div>
        ${activity.description ? `<div class="r-activity-desc">${escapeHtml(activity.description)}</div>` : ''}
      </div>
      <div class="r-prompt">¿Podrás asistir?</div>
      <div class="r-actions">
        <button class="r-btn r-btn--yes" data-action="yes">✓ Sí, asistiré</button>
        <button class="r-btn r-btn--no" data-action="no">✗ No podré</button>
      </div>
      <div class="r-footer">${escapeHtml(orgName.toUpperCase())}</div>
    </div>`;

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => respond(btn.dataset.action, data));
  });
}

async function respond(action, currentData) {
  const token = getToken();
  // Disable buttons
  document.querySelectorAll('[data-action]').forEach(b => { b.disabled = true; });
  const clickedBtn = document.querySelector(`[data-action="${action}"]`);
  if (clickedBtn) clickedBtn.textContent = 'Enviando…';

  try {
    const result = await postRsvp(token, action);
    if (action === 'yes') {
      renderError(
        '¡Confirmación recibida!',
        `Genial. Te esperamos en ${currentData.activity?.name}. Nos vemos pronto.`,
        'success',
      );
    } else {
      renderError(
        'Respuesta registrada',
        `Gracias por avisarnos que no podrás asistir a ${currentData.activity?.name}.`,
        'declined',
      );
    }
  } catch (e) {
    if (e.status === 409 && /cupo/i.test(e.message)) {
      renderError(
        'Cupo agotado',
        'Lamentablemente la actividad llegó al cupo máximo. Contacta al centro si necesitas ayuda.',
        'error',
      );
    } else if (e.status === 410) {
      renderError('Invitación expirada', e.message, 'info');
    } else {
      renderError('Error al registrar tu respuesta', e.message || 'Intenta de nuevo en unos momentos.', 'error');
    }
  }
}

async function init() {
  const token = getToken();
  if (!token) {
    renderError('Link inválido', 'El link de invitación no tiene un token válido.', 'error');
    return;
  }

  try {
    const data = await fetchInvitation(token);
    // Si la URL tiene ?action=yes o ?action=no, auto-responder
    const urlAction = getActionFromUrl();
    if (urlAction === 'yes' || urlAction === 'no' && data.invitation.status === 'pending') {
      // Mostrar la invitación primero, luego dejar que respond() haga su cosa
      renderInvitation(data);
      setTimeout(() => respond(urlAction, data), 100);
      return;
    }
    renderInvitation(data);
  } catch (e) {
    if (e.status === 404) {
      renderError(
        'Invitación no encontrada',
        'El link puede estar mal copiado o la invitación fue eliminada.',
        'error',
      );
    } else {
      renderError('Error al cargar', e.message || 'Intenta de nuevo en unos momentos.', 'error');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
