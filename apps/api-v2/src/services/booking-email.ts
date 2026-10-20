// apps/api-v2/src/services/booking-email.ts · email de CONFIRMACIÓN de una
// reserva de la Sala VR (agenda de colegios). Mismo contrato de entrega que
// invitation-email/credencial: sin RESEND_API_KEY → DRY-RUN honesto (skipped,
// notified_at queda null); con key → Resend real y el caller marca notified_at.
// No lleva links de acción (es una confirmación informativa al profesor).
// Tres plantillas con el mismo estilo: confirmación, cancelación y reprogramación
// (esta última muestra la fecha anterior tachada). Fechas en prosa en REPORT_TZ.

import type { DbClient } from '@contan2/db';
import type { OrgBranding } from './branding-tokens.js';
import { resolveBrandingTokens } from './branding-tokens.js';
import { escapeHtml, maskEmail, resendSend, type SendMessage } from './email.js';

const DEFAULT_FROM = 'contan2-saas <onboarding@resend.dev>';
import { REPORT_TZ as TZ } from './timezone.js';
const DAY_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const HOUR_FMT = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });

function fmtWhen(date: Date | string): string {
  const d = new Date(date);
  const day = DAY_FMT.format(d);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, a las ${HOUR_FMT.format(d)}`;
}

export interface BookingInfo {
  salaName: string;
  scheduledAt: Date | string;
  colegio: string;            // nombre del grupo (colegio u otro)
  kind?: string | null;       // tipo de grupo · null/ausente = colegio
  level: string | null;
  contactName: string;
  studentCount: number;
  previousAt?: Date | string | null; // solo reprogramación: la fecha anterior
}

export type BookingEmailKind = 'confirmed' | 'cancelled' | 'rescheduled';
const COPY: Record<BookingEmailKind, { eyebrow: string; subject: (sala: string) => string; body: (name: string) => string }> = {
  confirmed: {
    eyebrow: 'Visita confirmada',
    subject: (sala) => `Visita confirmada · ${sala}`,
    body: (name) => `${name}, quedó confirmada la visita de tu grupo. Te esperamos el día y la hora indicados. Si necesitas reprogramar o cancelar, responde este correo.`,
  },
  cancelled: {
    eyebrow: 'Visita cancelada',
    subject: (sala) => `Visita cancelada · ${sala}`,
    body: (name) => `${name}, te avisamos que la visita de tu grupo quedó cancelada. Si quieres agendar otra fecha, responde este correo y con gusto te ayudamos.`,
  },
  rescheduled: {
    eyebrow: 'Visita reprogramada',
    subject: (sala) => `Visita reprogramada · ${sala}`,
    body: (name) => `${name}, la visita de tu grupo cambió de fecha. Te esperamos en el nuevo día y hora indicados. Si no te sirve, responde este correo.`,
  },
};

export type BookingEmailResult =
  | { sent: true; id?: string }
  | { skipped: true; reason: string }
  | { sent: false; error: string };

export interface BookingEmailDeps {
  send?: (msg: SendMessage) => Promise<{ id?: string; error?: string }>;
  apiKey?: string;
  from?: string;
  replyTo?: string | null;
}

export function buildBookingHtml(_to: string, b: BookingInfo, branding: OrgBranding | null, kind: BookingEmailKind = 'confirmed'): string {
  const copy = COPY[kind];
  const t = resolveBrandingTokens(branding);
  const name = escapeHtml(b.contactName.trim() || 'Hola');
  const whenText = escapeHtml(fmtWhen(b.scheduledAt));
  const prev = kind === 'rescheduled' && b.previousAt
    ? `<p style="margin:0 0 4px;color:#9ca3af;font-size:14px;line-height:1.5;text-decoration:line-through;">${escapeHtml(fmtWhen(b.previousAt))}</p>` : '';
  // Cancelada: la fecha se muestra tachada (ya no aplica).
  const when = kind === 'cancelled' ? `<span style="text-decoration:line-through;color:#6b7280;">${whenText}</span>` : whenText;
  const sala = escapeHtml(b.salaName);
  const colegio = escapeHtml(b.colegio);
  const level = b.level ? ` · ${escapeHtml(b.level)}` : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td style="background:${t.primary};padding:24px 32px;">
        <span style="color:${t.onPrimary};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(t.orgName)}</span>
      </td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${copy.eyebrow}</p>
        <h1 style="margin:0 0 10px;font-size:23px;line-height:1.25;">${sala}</h1>
        ${prev}<p style="margin:0 0 2px;font-size:15px;line-height:1.6;"><strong>${when}</strong></p>
        <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">${colegio}${level} · ${b.studentCount} ${b.kind?.trim() ? `integrante${b.studentCount === 1 ? '' : 's'}` : `alumno${b.studentCount === 1 ? '' : 's'}`}</p>
      </td></tr>
      <tr><td style="padding:18px 32px 28px;">
        <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${copy.body(name)}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendBookingEmail(
  kind: BookingEmailKind,
  to: string,
  b: BookingInfo,
  branding: OrgBranding | null,
  deps: BookingEmailDeps = {},
): Promise<BookingEmailResult> {
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  if (!deps.send && !apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[email-dev] ${kind} de reserva "${b.salaName}" para ${maskEmail(to)} lista — falta RESEND_API_KEY`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }
  const msg: SendMessage = {
    from: deps.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to,
    ...(deps.replyTo ? { replyTo: deps.replyTo } : {}),
    subject: COPY[kind].subject(b.salaName),
    html: buildBookingHtml(to, b, branding, kind),
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

export function sendBookingConfirmEmail(to: string, b: BookingInfo, branding: OrgBranding | null, deps: BookingEmailDeps = {}): Promise<BookingEmailResult> {
  return sendBookingEmail('confirmed', to, b, branding, deps);
}

// Resuelve branding + remitente de la org (una vez) y envía el correo del tipo
// pedido. Devuelve el resultado; el caller marca notified_at sólo si sent === true
// y guarda email_error si sent === false. Llamar FUERA de la transacción.
export async function bookingEmail(
  kind: BookingEmailKind,
  db: DbClient,
  orgId: string,
  to: string,
  b: BookingInfo,
  deps: BookingEmailDeps = {},
): Promise<BookingEmailResult> {
  const org = await db.selectFrom('organizations')
    .select(['name', 'primary_color', 'secondary_color', 'email_from_addr', 'email_from_name', 'email_reply_to'])
    .where('id', '=', orgId).executeTakeFirst();
  const branding: OrgBranding | null = org
    ? { name: org.name, primaryColor: org.primary_color, secondaryColor: org.secondary_color }
    : null;
  const from = deps.from
    ?? (org?.email_from_addr ? `${org.email_from_name || org.name} <${org.email_from_addr}>` : undefined);
  const replyTo = deps.replyTo ?? org?.email_reply_to ?? null;
  return sendBookingEmail(kind, to, b, branding, { ...deps, from, replyTo });
}

export const confirmBookingEmail = (db: DbClient, orgId: string, to: string, b: BookingInfo, deps: BookingEmailDeps = {}) => bookingEmail('confirmed', db, orgId, to, b, deps);
export const cancelBookingEmail = (db: DbClient, orgId: string, to: string, b: BookingInfo, deps: BookingEmailDeps = {}) => bookingEmail('cancelled', db, orgId, to, b, deps);
export const rescheduleBookingEmail = (db: DbClient, orgId: string, to: string, b: BookingInfo, deps: BookingEmailDeps = {}) => bookingEmail('rescheduled', db, orgId, to, b, deps);
