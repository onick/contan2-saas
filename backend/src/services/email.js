import { Resend } from 'resend';
import { config } from '../config.js';
import { generateCredentialPng } from './credential.js';
import {
  resolveBrandingTokens,
  loadEmailLogoDataUri,
  resolveFromAddress,
  resolveReplyTo,
} from './emailBranding.js';
import { maskEmail } from '../utils/log.js';

let _resend = null;
function client() {
  if (!_resend && config.RESEND_API_KEY) {
    _resend = new Resend(config.RESEND_API_KEY);
  }
  return _resend;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtActivityDate(iso) {
  return new Date(iso).toLocaleString('es-DO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Header común a todos los emails: logo + nombre de org sobre fondo brand. */
function headerHtml({ tokens, logoData, eyebrow, title, gradientFrom, gradientTo }) {
  const from = gradientFrom || tokens.primary;
  const to = gradientTo || tokens.primaryLight;
  return `
    <tr>
      <td style="background:linear-gradient(135deg, ${from} 0%, ${to} 100%);padding:32px;text-align:center;">
        ${logoData ? `
          <img src="${logoData}" alt="" style="display:block;margin:0 auto 16px;max-height:80px;max-width:260px;height:auto;" />` : ''}
        ${eyebrow
          ? `<div style="font-size:11px;letter-spacing:2px;color:${tokens.onPrimary};opacity:0.8;font-weight:600;margin-bottom:6px;">${escapeHtml(eyebrow)}</div>`
          : ''}
        <div style="color:${tokens.onPrimary};font-size:22px;font-weight:700;">${escapeHtml(title)}</div>
      </td>
    </tr>`;
}

function footerHtml({ tokens }) {
  return `
    <tr>
      <td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="font-size:11px;color:#9ca3af;margin:0;letter-spacing:0.5px;">${escapeHtml(tokens.orgName.toUpperCase())}</p>
      </td>
    </tr>`;
}

function shell({ tokens, header, content }) {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f6fa;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
          ${header}
          ${content}
          ${footerHtml({ tokens })}
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// ============================================================================
// Templates
// ============================================================================
function credentialHtml({ user, tokens, logoData, credentialDataUri }) {
  const greeting = user.firstName ? `Hola ${user.firstName}` : 'Hola';
  const header = headerHtml({
    tokens, logoData,
    eyebrow: tokens.orgName.toUpperCase(),
    title: 'Tu credencial digital',
  });
  const content = `
    <tr><td style="padding:32px 36px 8px;">
      <p style="font-size:18px;font-weight:600;color:#1f2937;margin:0 0 8px;">${escapeHtml(greeting)},</p>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 16px;">
        ¡Bienvenido a ${escapeHtml(tokens.orgName)}! Te entregamos tu credencial personal con tu código único. Guárdala en tu teléfono y muéstrala cuando vengas a una actividad.
      </p>
    </td></tr>
    <tr><td style="padding:8px 36px;text-align:center;">
      <div style="display:inline-block;background:${tokens.primary};color:${tokens.onPrimary};padding:8px 18px;border-radius:8px;font-family:Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:2px;">${escapeHtml(user.code)}</div>
    </td></tr>
    ${credentialDataUri ? `
    <tr><td style="padding:16px 36px 0;text-align:center;">
      <img src="${credentialDataUri}" alt="" style="max-width:100%;height:auto;border-radius:14px;display:block;margin:0 auto;" />
    </td></tr>` : ''}
    <tr><td style="padding:24px 36px 8px;">
      <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 8px;"><strong>Cómo usarla:</strong></p>
      <ol style="font-size:14px;color:#4b5563;line-height:1.7;padding-left:20px;margin:0 0 8px;">
        <li>Guarda la imagen adjunta en tu teléfono (toca y mantén → "Guardar imagen").</li>
        <li>Cuando vengas a una actividad, abre la imagen.</li>
        <li>Muestra el código QR al staff en la entrada para hacer check-in.</li>
      </ol>
    </td></tr>
    <tr><td style="padding:8px 36px 32px;">
      <p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0;">Si no solicitaste este registro, puedes ignorar este correo.</p>
    </td></tr>`;
  return shell({ tokens, header, content });
}

function cancellationHtml({ user, activity, tokens, logoData }) {
  const greeting = user.firstName ? `Hola ${user.firstName}` : 'Hola';
  const header = headerHtml({
    tokens, logoData,
    eyebrow: tokens.orgName.toUpperCase(),
    title: 'Actividad cancelada',
    // El "cancelado" usa rojo/naranja independiente de marca por significado.
    gradientFrom: '#dc2626',
    gradientTo: '#f97316',
  });
  const content = `
    <tr><td style="padding:32px 36px 8px;">
      <p style="font-size:17px;font-weight:600;margin:0 0 8px;">${escapeHtml(greeting)},</p>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 16px;">
        Lamentamos informarte que la siguiente actividad ha sido <strong>cancelada</strong>:
      </p>
    </td></tr>
    <tr><td style="padding:0 36px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;">
        <tr><td style="padding:16px 20px;">
          <div style="font-size:18px;font-weight:700;color:#1f2937;margin-bottom:6px;">${escapeHtml(activity.name)}</div>
          <div style="font-size:14px;color:#6b7280;line-height:1.5;">
            📅 ${escapeHtml(fmtActivityDate(activity.date))}<br>
            📍 ${escapeHtml(activity.location)}
          </div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 36px 8px;">
      <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 12px;">
        Tu registro queda automáticamente cancelado. Si tienes alguna duda o quieres conocer próximas actividades similares, contáctanos.
      </p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">
        Disculpa los inconvenientes que esto pueda causar.
      </p>
    </td></tr>
    <tr><td style="padding:24px 36px 32px;"></td></tr>`;
  return shell({ tokens, header, content });
}

function invitationHtml({ user, activity, tokens, logoData, rsvpUrl }) {
  const greeting = user.firstName ? `Hola ${user.firstName}` : 'Hola';
  const yesUrl = `${rsvpUrl}?action=yes`;
  const noUrl = `${rsvpUrl}?action=no`;
  const header = headerHtml({
    tokens, logoData,
    eyebrow: tokens.orgName.toUpperCase(),
    title: 'Te invitamos a una actividad',
  });
  const content = `
    <tr><td style="padding:32px 36px 8px;">
      <p style="font-size:17px;font-weight:600;margin:0 0 8px;">${escapeHtml(greeting)},</p>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 12px;">Nos gustaría contar con tu presencia en:</p>
    </td></tr>
    <tr><td style="padding:0 36px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-left:4px solid ${tokens.accent};border-radius:8px;">
        <tr><td style="padding:18px 22px;">
          <div style="font-size:20px;font-weight:700;color:#1f2937;margin-bottom:8px;">${escapeHtml(activity.name)}</div>
          <div style="font-size:14px;color:#6b7280;line-height:1.7;">
            📅 ${escapeHtml(fmtActivityDate(activity.date))}<br>
            📍 ${escapeHtml(activity.location)}
          </div>
          ${activity.description ? `<div style="font-size:13px;color:#6b7280;line-height:1.5;margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;">${escapeHtml(activity.description)}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 36px 8px;">
      <p style="font-size:15px;color:#1f2937;margin:0 0 16px;text-align:center;font-weight:600;">¿Podrás asistir?</p>
    </td></tr>
    <tr><td style="padding:0 36px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding-right:8px;">
            <a href="${escapeHtml(yesUrl)}" style="display:block;background:#10b981;color:#ffffff;text-decoration:none;text-align:center;padding:16px 12px;border-radius:10px;font-weight:700;font-size:16px;">
              ✓ Sí, asistiré
            </a>
          </td>
          <td width="50%" style="padding-left:8px;">
            <a href="${escapeHtml(noUrl)}" style="display:block;background:#f3f4f6;color:#4b5563;text-decoration:none;text-align:center;padding:16px 12px;border-radius:10px;font-weight:700;font-size:16px;border:1px solid #e5e7eb;">
              ✗ No podré
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 36px 0;">
      <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0;text-align:center;">
        Tu respuesta nos ayuda a organizar mejor la actividad.<br>
        Si los botones no funcionan, copia este link en tu navegador:<br>
        <a href="${escapeHtml(rsvpUrl)}" style="color:${tokens.primary};word-break:break-all;">${escapeHtml(rsvpUrl)}</a>
      </p>
    </td></tr>
    <tr><td style="padding:24px 36px 32px;"></td></tr>`;
  return shell({ tokens, header, content });
}

// ============================================================================
// Senders
// ============================================================================

async function brandingContext(organization) {
  return {
    tokens: resolveBrandingTokens(organization),
    logoData: await loadEmailLogoDataUri(organization),
    from: resolveFromAddress(organization),
    replyTo: resolveReplyTo(organization),
  };
}

export async function sendCredentialEmail(user, organization = null) {
  if (!user.email) return { skipped: true, reason: 'sin email' };

  const { tokens, logoData, from, replyTo } = await brandingContext(organization);
  const pngBuffer = await generateCredentialPng(user, organization);
  // Embedemos la credencial como data-URI directo en el HTML. Más compatible
  // que cid: (que Resend no soporta inline; en Gmail aparecía como imagen rota).
  const credentialDataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  const html = credentialHtml({ user, tokens, logoData, credentialDataUri });
  const subject = `Tu credencial · ${user.code}`;
  const filename = `credencial-${user.code}.png`;

  const c = client();
  if (!c) {
    console.log(`[email-dev] credencial para ${maskEmail(user.email)} (${user.code}) lista, ${pngBuffer.length} bytes — falta RESEND_API_KEY`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }

  try {
    const result = await c.emails.send({
      from,
      to: user.email,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      attachments: [{ filename, content: pngBuffer }],
    });
    if (result.error) {
      console.error(`[email] error enviando a ${maskEmail(user.email)}:`, result.error.message || result.error);
      return { sent: false, error: result.error.message || String(result.error) };
    }
    console.log(`[email] credencial enviada a ${maskEmail(user.email)} (id=${result.data?.id || '?'})`);
    return { sent: true, id: result.data?.id };
  } catch (e) {
    console.error(`[email] excepción enviando a ${maskEmail(user.email)}:`, e.message);
    return { sent: false, error: e.message };
  }
}

export async function sendActivityCancellationEmail({ user, activity, organization }) {
  if (!user.email) return { skipped: true, reason: 'sin email' };

  const { tokens, logoData, from, replyTo } = await brandingContext(organization);
  const html = cancellationHtml({ user, activity, tokens, logoData });

  const c = client();
  if (!c) {
    console.log(`[email-dev] cancelación a ${maskEmail(user.email)} (actividad: ${activity.name})`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }
  try {
    const result = await c.emails.send({
      from,
      to: user.email,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `Actividad cancelada: ${activity.name}`,
      html,
    });
    if (result.error) {
      console.error(`[cancel-email] error a ${maskEmail(user.email)}:`, result.error.message);
      return { sent: false, error: result.error.message };
    }
    console.log(`[cancel-email] enviado a ${maskEmail(user.email)} (id=${result.data?.id})`);
    return { sent: true, id: result.data?.id };
  } catch (e) {
    console.error(`[cancel-email] excepción a ${maskEmail(user.email)}:`, e.message);
    return { sent: false, error: e.message };
  }
}

export async function sendInvitationEmail({ user, activity, organization, rsvpUrl }) {
  if (!user.email) return { skipped: true, reason: 'sin email' };

  const { tokens, logoData, from, replyTo } = await brandingContext(organization);
  const html = invitationHtml({ user, activity, tokens, logoData, rsvpUrl });

  const c = client();
  if (!c) {
    // Nunca loguear el rsvpUrl completo: contiene el token de invitación.
    console.log(`[email-dev] invitación a ${maskEmail(user.email)} (actividad: ${activity.name})`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }
  try {
    const result = await c.emails.send({
      from,
      to: user.email,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `Te invitamos: ${activity.name}`,
      html,
    });
    if (result.error) {
      console.error(`[invite-email] error a ${maskEmail(user.email)}:`, result.error.message);
      return { sent: false, error: result.error.message };
    }
    console.log(`[invite-email] enviado a ${maskEmail(user.email)} (id=${result.data?.id})`);
    return { sent: true, id: result.data?.id };
  } catch (e) {
    console.error(`[invite-email] excepción a ${maskEmail(user.email)}:`, e.message);
    return { sent: false, error: e.message };
  }
}
