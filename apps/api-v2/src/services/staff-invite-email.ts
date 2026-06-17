// apps/api-v2/src/services/staff-invite-email.ts · invitación de EQUIPO por correo.
// Mismo contrato de entrega que la credencial (email.ts) y la invitación de
// actividad (invitation-email.ts): sin RESEND_API_KEY → DRY-RUN honesto
// ({ skipped }); con key → Resend real. El token viaja SOLO en el link del correo,
// JAMÁS se loguea. Antes esta ruta era dry-run pura (no mandaba nada).

import { escapeHtml, maskEmail, resendSend, type SendMessage } from './email.js';
import type { OrgBranding } from './branding-tokens.js';

const DEFAULT_FROM = 'contan2-saas <onboarding@resend.dev>';
const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario', admin: 'Administrador', operator: 'Operador', protocolo: 'Protocolo',
};

export type StaffInviteEmailResult =
  | { sent: true; id?: string }
  | { skipped: true; reason: string }
  | { error: string };

export interface StaffInviteEmailDeps {
  // Inyectable en tests: si no se pasa y hay apiKey, usa Resend real.
  send?: (msg: SendMessage) => Promise<{ id?: string; error?: string }>;
  apiKey?: string;
  from?: string;
  replyTo?: string | null;
}

export interface StaffInviteEmailOpts {
  orgName: string;
  role: string;
  inviteUrl: string;
  branding: OrgBranding | null;
}

export function buildStaffInviteHtml(opts: StaffInviteEmailOpts): string {
  const brand = opts.branding?.primaryColor && /^#[0-9a-fA-F]{6}$/.test(opts.branding.primaryColor) ? opts.branding.primaryColor : '#e65100';
  const org = escapeHtml(opts.orgName);
  const roleLabel = escapeHtml(ROLE_LABEL[opts.role] ?? opts.role);
  const url = escapeHtml(opts.inviteUrl);
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${org}</p>
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827;">Te invitaron al equipo</h1>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">Te sumaron como <strong>${roleLabel}</strong> en <strong>${org}</strong>. Aceptá la invitación para crear tu cuenta y empezar.</p>
        <p style="margin:20px 0;"><a href="${url}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Aceptar invitación</a></p>
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">El enlace vence en 24 horas. Si no esperabas esta invitación, ignorá este correo.<br />Si el botón no funciona, abrí este enlace:<br /><a href="${url}" style="color:#6b7280;word-break:break-all;">${url}</a></p>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}

export async function sendStaffInviteEmail(
  to: string,
  opts: StaffInviteEmailOpts,
  deps: StaffInviteEmailDeps = {},
): Promise<StaffInviteEmailResult> {
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey && !deps.send) {
    console.log(`[email-dev] invitación de equipo para ${maskEmail(to)} (${opts.role}) lista — falta RESEND_API_KEY`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }
  const msg: SendMessage = {
    from: deps.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to,
    ...(deps.replyTo ? { replyTo: deps.replyTo } : {}),
    subject: `Te invitaron al equipo · ${opts.orgName}`,
    html: buildStaffInviteHtml(opts),
    attachments: [],
  };
  const send = deps.send ?? ((m: SendMessage) => resendSend(apiKey as string, m));
  try {
    const r = await send(msg);
    if (r.error) return { error: r.error };
    return r.id ? { sent: true, id: r.id } : { sent: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'send failed' };
  }
}
