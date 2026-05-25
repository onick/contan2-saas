// =============================================================================
// authEmails.js · templates de emails para auth (welcome, reset, changed,
//                 new-login). Reusan el shell visual de email.js.
//
// Convención: cada función recibe `staffMember` + `organization` y aplica
// el branding del tenant. Para platform admin (que no tiene tenant), pasamos
// `organization: null` y se usa el branding por defecto de contan2.
// =============================================================================

import { Resend } from 'resend';
import { config } from '../../config.js';
import {
  resolveBrandingTokens,
  loadEmailLogoDataUri,
  resolveFromAddress,
  resolveReplyTo,
} from '../emailBranding.js';
import { maskEmail } from '../../utils/log.js';

let _resend = null;
function client() {
  if (!_resend && config.RESEND_API_KEY) _resend = new Resend(config.RESEND_API_KEY);
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

function headerHtml({ tokens, logoData, eyebrow, title }) {
  return `
    <tr><td style="background:linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.primaryLight} 100%);padding:32px;text-align:center;">
      ${logoData ? `<img src="${logoData}" alt="" style="display:block;margin:0 auto 16px;max-height:80px;max-width:260px;height:auto;" />` : ''}
      ${eyebrow ? `<div style="font-size:11px;letter-spacing:2px;color:${tokens.onPrimary};opacity:0.8;font-weight:600;margin-bottom:6px;">${escapeHtml(eyebrow)}</div>` : ''}
      <div style="color:${tokens.onPrimary};font-size:22px;font-weight:700;">${escapeHtml(title)}</div>
    </td></tr>`;
}

function footerHtml({ tokens }) {
  return `
    <tr><td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="font-size:11px;color:#9ca3af;margin:0;letter-spacing:0.5px;">${escapeHtml(tokens.orgName.toUpperCase())}</p>
    </td></tr>`;
}

function shell({ tokens, header, content }) {
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f6fa;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
${header}${content}${footerHtml({ tokens })}
</table></td></tr></table></body></html>`;
}

async function brandingContext(organization) {
  return {
    tokens: resolveBrandingTokens(organization),
    logoData: await loadEmailLogoDataUri(organization),
    from: resolveFromAddress(organization),
    replyTo: resolveReplyTo(organization),
  };
}

// ============================================================================
// Templates
// ============================================================================

function welcomeStaffHtml({ staffMember, tokens, logoData, tempPassword, loginUrl }) {
  const greeting = staffMember.fullName ? `Hola ${staffMember.fullName.split(' ')[0]}` : 'Hola';
  const header = headerHtml({ tokens, logoData, eyebrow: tokens.orgName.toUpperCase(), title: 'Tu cuenta está lista' });
  const content = `
    <tr><td style="padding:32px 36px 12px;">
      <p style="font-size:17px;font-weight:600;margin:0 0 8px;">${escapeHtml(greeting)},</p>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 16px;">
        Te creamos una cuenta en el panel administrativo de <strong>${escapeHtml(tokens.orgName)}</strong>.
        Inicia sesión con tu correo y la contraseña temporal de abajo. Por seguridad,
        te pediremos cambiarla la primera vez que entres.
      </p>
    </td></tr>
    <tr><td style="padding:0 36px 12px;">
      <div style="background:#f3f4f6;border-radius:10px;padding:16px 18px;font-family:Menlo,Monaco,monospace;font-size:14px;">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Correo</div>
        <div style="color:#1f2937;font-weight:700;">${escapeHtml(staffMember.email)}</div>
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:14px 0 4px;">Contraseña temporal</div>
        <div style="color:#1f2937;font-weight:700;letter-spacing:1px;">${escapeHtml(tempPassword)}</div>
      </div>
    </td></tr>
    <tr><td style="padding:20px 36px;">
      <a href="${escapeHtml(loginUrl)}" style="display:block;background:${tokens.primary};color:${tokens.onPrimary};text-decoration:none;text-align:center;padding:14px 18px;border-radius:10px;font-weight:700;font-size:15px;">Iniciar sesión</a>
    </td></tr>
    <tr><td style="padding:0 36px 32px;">
      <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0;">Si no esperabas este correo, ignóralo.</p>
    </td></tr>`;
  return shell({ tokens, header, content });
}

function passwordResetHtml({ staffMember, tokens, logoData, resetUrl }) {
  const greeting = staffMember.fullName ? `Hola ${staffMember.fullName.split(' ')[0]}` : 'Hola';
  const header = headerHtml({ tokens, logoData, eyebrow: tokens.orgName.toUpperCase(), title: 'Restablece tu contraseña' });
  const content = `
    <tr><td style="padding:32px 36px 12px;">
      <p style="font-size:17px;font-weight:600;margin:0 0 8px;">${escapeHtml(greeting)},</p>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 16px;">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta en
        <strong>${escapeHtml(tokens.orgName)}</strong>. Si fuiste tú, usa el botón:
      </p>
    </td></tr>
    <tr><td style="padding:0 36px 20px;">
      <a href="${escapeHtml(resetUrl)}" style="display:block;background:${tokens.primary};color:${tokens.onPrimary};text-decoration:none;text-align:center;padding:14px 18px;border-radius:10px;font-weight:700;font-size:15px;">Restablecer mi contraseña</a>
    </td></tr>
    <tr><td style="padding:0 36px 12px;">
      <p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0 0 8px;">El enlace es válido por <strong>1 hora</strong> y solo se puede usar una vez.</p>
      <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0;">Si no fuiste tú, ignora este correo — tu contraseña actual sigue siendo válida. Si los intentos persisten, contacta al administrador.</p>
    </td></tr>
    <tr><td style="padding:14px 36px 32px;">
      <p style="font-size:11px;color:#9ca3af;line-height:1.5;margin:0;">Si el botón no funciona, copia este enlace en tu navegador:<br>
        <a href="${escapeHtml(resetUrl)}" style="color:${tokens.primary};word-break:break-all;">${escapeHtml(resetUrl)}</a>
      </p>
    </td></tr>`;
  return shell({ tokens, header, content });
}

function passwordChangedHtml({ staffMember, tokens, logoData, via }) {
  const greeting = staffMember.fullName ? `Hola ${staffMember.fullName.split(' ')[0]}` : 'Hola';
  const explanation = via === 'reset'
    ? 'Tu contraseña fue restablecida usando el enlace de recuperación.'
    : 'Tu contraseña fue actualizada desde el panel.';
  const header = headerHtml({ tokens, logoData, eyebrow: tokens.orgName.toUpperCase(), title: 'Contraseña actualizada' });
  const content = `
    <tr><td style="padding:32px 36px 12px;">
      <p style="font-size:17px;font-weight:600;margin:0 0 8px;">${escapeHtml(greeting)},</p>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 16px;">${escapeHtml(explanation)}</p>
      <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 8px;">Tus otras sesiones fueron cerradas por seguridad. Vuelve a iniciar sesión donde lo necesites.</p>
      <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:14px 0 0;">Si NO fuiste tú, contacta al administrador inmediatamente — tu cuenta podría haber sido comprometida.</p>
    </td></tr>
    <tr><td style="padding:24px 36px 32px;"></td></tr>`;
  return shell({ tokens, header, content });
}

function newLoginNotificationHtml({ staffMember, tokens, logoData, ip, userAgent, at }) {
  const greeting = staffMember.fullName ? `Hola ${staffMember.fullName.split(' ')[0]}` : 'Hola';
  const when = at instanceof Date ? at.toLocaleString('es-DO') : String(at);
  const header = headerHtml({ tokens, logoData, eyebrow: tokens.orgName.toUpperCase(), title: 'Nuevo inicio de sesión' });
  const content = `
    <tr><td style="padding:32px 36px 12px;">
      <p style="font-size:17px;font-weight:600;margin:0 0 8px;">${escapeHtml(greeting)},</p>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 16px;">
        Detectamos un inicio de sesión en tu cuenta desde un dispositivo o ubicación que no habíamos visto antes:
      </p>
    </td></tr>
    <tr><td style="padding:0 36px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;">
        <tr><td style="padding:14px 18px;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Fecha y hora</div>
          <div style="font-size:14px;font-weight:600;color:#1f2937;">${escapeHtml(when)}</div>
          <div style="font-size:12px;color:#6b7280;margin:12px 0 4px;">IP aproximada</div>
          <div style="font-size:13px;color:#1f2937;font-family:Menlo,monospace;">${escapeHtml(ip || '—')}</div>
          <div style="font-size:12px;color:#6b7280;margin:12px 0 4px;">Dispositivo</div>
          <div style="font-size:13px;color:#1f2937;">${escapeHtml((userAgent || '—').slice(0, 120))}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:18px 36px 32px;">
      <p style="font-size:13px;color:#4b5563;line-height:1.5;margin:0;">Si fuiste tú, ignora este correo. Si <strong>no fuiste tú</strong>, cambia tu contraseña inmediatamente desde el panel.</p>
    </td></tr>`;
  return shell({ tokens, header, content });
}

// ============================================================================
// Senders
// ============================================================================

async function sendBranded({ to, subject, html, organization }) {
  const c = client();
  const { from, replyTo } = await brandingContext(organization);
  if (!c) {
    console.log(`[auth-email-dev] ${subject} → ${maskEmail(to)} (sin RESEND_API_KEY)`);
    return { skipped: true };
  }
  try {
    const result = await c.emails.send({ from, to, ...(replyTo ? { reply_to: replyTo } : {}), subject, html });
    if (result.error) {
      console.error(`[auth-email] ${subject}: ${result.error.message || result.error}`);
      return { sent: false, error: result.error.message };
    }
    return { sent: true, id: result.data?.id };
  } catch (e) {
    console.error(`[auth-email] ${subject} exception: ${e.message}`);
    return { sent: false, error: e.message };
  }
}

export async function sendWelcomeStaffEmail({ staffMember, organization, tempPassword, loginUrl }) {
  const { tokens, logoData } = await brandingContext(organization);
  const html = welcomeStaffHtml({ staffMember, tokens, logoData, tempPassword, loginUrl });
  return sendBranded({
    to: staffMember.email,
    subject: `Tu cuenta en ${tokens.orgName}`,
    html,
    organization,
  });
}

export async function sendPasswordResetEmail({ staffMember, organization, resetUrl }) {
  const { tokens, logoData } = await brandingContext(organization);
  const html = passwordResetHtml({ staffMember, tokens, logoData, resetUrl });
  return sendBranded({
    to: staffMember.email,
    subject: `Restablece tu contraseña · ${tokens.orgName}`,
    html,
    organization,
  });
}

export async function sendPasswordChangedEmail({ staffMember, organization, via }) {
  const { tokens, logoData } = await brandingContext(organization);
  const html = passwordChangedHtml({ staffMember, tokens, logoData, via });
  return sendBranded({
    to: staffMember.email,
    subject: `Tu contraseña fue actualizada · ${tokens.orgName}`,
    html,
    organization,
  });
}

export async function sendNewLoginNotificationEmail({ staffMember, organization, ip, userAgent, at }) {
  const { tokens, logoData } = await brandingContext(organization);
  const html = newLoginNotificationHtml({ staffMember, tokens, logoData, ip, userAgent, at });
  return sendBranded({
    to: staffMember.email,
    subject: `Nuevo inicio de sesión · ${tokens.orgName}`,
    html,
    organization,
  });
}
