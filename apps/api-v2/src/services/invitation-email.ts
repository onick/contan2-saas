// apps/api-v2/src/services/invitation-email.ts · S3 RSVP PR-3: email branded de
// invitación a una actividad. Mismo contrato de entrega que la credencial
// (email.ts): sin RESEND_API_KEY → DRY-RUN honesto ({ skipped }, sent_at queda
// null); con key → Resend real y deliverInvitations marca invitations.sent_at.
//
// Los botones del correo llevan a la página pública /rsvp/<token> (?intent=
// yes|no sólo PRE-ENFOCA el botón en la página): el GET es libre de efectos —
// los prefetchers de los clientes de correo NO pueden confirmar ni declinar
// por el visitante. El token JAMÁS se loguea (sólo viaja en el correo).

import type { DbClient } from '@contan2/db';
import type { OrgBranding } from './branding-tokens.js';
import { resolveBrandingTokens } from './branding-tokens.js';
import { escapeHtml, maskEmail, resendSend, type SendMessage } from './email.js';

export interface InviteeUser {
  email: string;
  firstName: string;
  lastName: string;
}

export interface InvitationActivityInfo {
  name: string;
  date: Date | string;
  location: string;
  imageUrl: string | null;
}

export type InvitationEmailResult =
  | { sent: true; id?: string }
  | { skipped: true; reason: string }
  | { sent: false; error: string };

export interface InvitationEmailDeps {
  send?: (msg: SendMessage) => Promise<{ id?: string; error?: string }>;
  apiKey?: string;
  from?: string;
  replyTo?: string | null;
}

const DEFAULT_FROM = 'contan2-saas <onboarding@resend.dev>';
const TZ = 'America/Santo_Domingo';
const DAY_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const HOUR_FMT = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });

function fmtWhen(date: Date | string): string {
  const d = new Date(date);
  const day = DAY_FMT.format(d);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, a las ${HOUR_FMT.format(d)}`;
}

// HTML del correo (tablas + estilos inline: compatibilidad de clientes de
// correo; mismo enfoque del correo de credencial). Portada por URL absoluta.
export function buildInvitationHtml(
  user: InviteeUser,
  act: InvitationActivityInfo,
  branding: OrgBranding | null,
  rsvpUrl: string,
  coverUrl: string | null,
): string {
  const t = resolveBrandingTokens(branding);
  const name = escapeHtml(user.firstName.trim() || 'Hola');
  const actName = escapeHtml(act.name);
  const when = escapeHtml(fmtWhen(act.date));
  const where = escapeHtml(act.location);
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td style="background:${t.primary};padding:24px 32px;">
        <span style="color:${t.onPrimary};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(t.orgName)}</span>
      </td></tr>
      ${coverUrl ? `<tr><td><img src="${escapeHtml(coverUrl)}" alt="" width="520" style="display:block;width:100%;height:auto;" /></td></tr>` : ''}
      <tr><td style="padding:28px 32px 8px;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Estás invitado/a</p>
        <h1 style="margin:0 0 10px;font-size:23px;line-height:1.25;">${actName}</h1>
        <p style="margin:0 0 2px;font-size:15px;line-height:1.6;"><strong>${when}</strong></p>
        <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">${where}</p>
      </td></tr>
      <tr><td style="padding:20px 32px 6px;">
        <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${name}, nos encantaría contar contigo. Confirma tu asistencia y tu lugar queda apartado.</p>
      </td></tr>
      <tr><td style="padding:18px 32px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="border-radius:10px;background:${t.accent};">
            <a href="${escapeHtml(rsvpUrl)}?intent=yes" style="display:inline-block;padding:12px 26px;color:${t.onAccent};font-size:15px;font-weight:700;text-decoration:none;">Sí, voy</a>
          </td>
          <td style="width:12px;"></td>
          <td style="border-radius:10px;border:1px solid #d1d5db;">
            <a href="${escapeHtml(rsvpUrl)}?intent=no" style="display:inline-block;padding:12px 26px;color:#374151;font-size:15px;font-weight:600;text-decoration:none;">No puedo</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:10px 32px 28px;">
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">Si los botones no funcionan, abre este enlace:<br /><a href="${escapeHtml(rsvpUrl)}" style="color:#6b7280;word-break:break-all;">${escapeHtml(rsvpUrl)}</a></p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendInvitationEmail(
  user: InviteeUser,
  act: InvitationActivityInfo,
  branding: OrgBranding | null,
  rsvpUrl: string,
  coverUrl: string | null,
  deps: InvitationEmailDeps = {},
): Promise<InvitationEmailResult> {
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  if (!deps.send && !apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[email-dev] invitación a "${act.name}" para ${maskEmail(user.email)} lista — falta RESEND_API_KEY`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }

  const msg: SendMessage = {
    from: deps.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to: user.email,
    ...(deps.replyTo ? { replyTo: deps.replyTo } : {}),
    subject: `Te invitamos · ${act.name}`,
    html: buildInvitationHtml(user, act, branding, rsvpUrl, coverUrl),
    attachments: [],
  };

  const send = deps.send ?? ((m: SendMessage) => resendSend(apiKey as string, m));
  try {
    const r = await send(msg);
    if (r.error) return { sent: false, error: r.error };
    return { sent: true, id: r.id };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface DeliverableInvitation {
  invitationId: string;
  token: string;
  user: InviteeUser;
}

export interface DeliverInvitationsResult {
  sent: number;
  skipped: number;
  failed: number;
}

// Orquesta la entrega del lote: branding + remitente de la org UNA vez,
// envíos secuenciales (rate-limit amable con Resend) y sent_at marcado SOLO
// en envío real, por invitación. Best-effort: nunca lanza.
export async function deliverInvitations(
  db: DbClient,
  orgId: string,
  host: string,
  act: InvitationActivityInfo,
  items: DeliverableInvitation[],
  deps: InvitationEmailDeps = {},
): Promise<DeliverInvitationsResult> {
  const out: DeliverInvitationsResult = { sent: 0, skipped: 0, failed: 0 };
  if (items.length === 0) return out;

  const org = await db
    .selectFrom('organizations')
    .select(['name', 'primary_color', 'secondary_color', 'email_from_addr', 'email_from_name', 'email_reply_to'])
    .where('id', '=', orgId)
    .executeTakeFirst();
  const branding: OrgBranding | null = org
    ? { name: org.name, primaryColor: org.primary_color, secondaryColor: org.secondary_color }
    : null;
  const from = deps.from
    ?? (org?.email_from_addr ? `${org.email_from_name || org.name} <${org.email_from_addr}>` : undefined);
  const replyTo = deps.replyTo ?? org?.email_reply_to ?? null;

  const coverUrl = act.imageUrl
    ? (act.imageUrl.startsWith('http') ? act.imageUrl : `https://${host}${act.imageUrl}`)
    : null;

  for (const it of items) {
    const rsvpUrl = `https://${host}/rsvp/${it.token}`;
    const r = await sendInvitationEmail(it.user, act, branding, rsvpUrl, coverUrl, { ...deps, from, replyTo });
    if ('sent' in r && r.sent === true) {
      out.sent += 1;
      await db.updateTable('invitations')
        .set({ sent_at: new Date().toISOString() })
        .where('id', '=', it.invitationId)
        .execute()
        .catch(() => {});
    } else if ('skipped' in r) {
      out.skipped += 1;
    } else {
      out.failed += 1;
    }
  }
  return out;
}
