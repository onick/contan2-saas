// apps/api-v2/src/services/contact.ts · formulario público de la landing.
// Port de backend/src/routes/landing.js (v1), separado en service testeable:
//   - inboxHtml / ackHtml: plantillas con la paleta contan2 (tinta + naranja),
//     no el indigo legacy de v1.
//   - sendContactEmails: envía lead al inbox + ack al prospecto. Best-effort,
//     NUNCA lanza. Dry-run sin RESEND_API_KEY. `deps.send` inyectable para tests.
import { resendSend, escapeHtml, maskEmail, type SendMessage } from './email.js';

export interface ContactInput {
  name: string;
  organization: string;
  email: string;
  message: string;
  fax: string;
}

export interface ContactMeta {
  ip: string;
  ua: string;
}

export interface ContactEmailDeps {
  send?: (msg: SendMessage) => Promise<{ id?: string; error?: string }>;
  apiKey?: string;
  from?: string;
  replyTo?: string | null;
  inbox?: string;
}

export type ContactEmailResult =
  | { ok: true; inboxId?: string; ackId?: string; skipped?: false }
  | { ok: true; skipped: true; reason: string };

const DEFAULT_FROM = 'contan2-saas <onboarding@resend.dev>';
const DEFAULT_INBOX = 'onickgrafica@gmail.com';

export function inboxHtml(input: ContactInput & ContactMeta): string {
  const { name, organization, email, message, ip, ua } = input;
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#faf9f7;padding:24px;color:#16181d;margin:0;">
  <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e3dd;">
    <tr><td style="background:#16181d;padding:24px 28px;color:#fff;">
      <div style="font-size:11px;letter-spacing:2px;opacity:.7;font-weight:600;">NUEVO LEAD · CONTAN2.COM</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(name)} · ${escapeHtml(organization)}</div>
    </td></tr>
    <tr><td style="padding:24px 28px;">
      <table style="width:100%;font-size:14px;line-height:1.6;">
        <tr><td style="color:#6b7077;width:120px;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="color:#6b7077;">Organización</td><td>${escapeHtml(organization)}</td></tr>
        <tr><td style="color:#6b7077;vertical-align:top;padding-top:8px;">Mensaje</td>
            <td style="padding-top:8px;white-space:pre-wrap;">${escapeHtml(message || '(sin mensaje)')}</td></tr>
      </table>
    </td></tr>
    <tr><td style="background:#faf9f7;padding:14px 28px;font-size:11px;color:#94a3b8;border-top:1px solid #e6e3dd;">
      IP: ${escapeHtml(ip || '')} · UA: ${escapeHtml((ua || '').slice(0, 160))}
    </td></tr>
  </table></body></html>`;
}

export function ackHtml({ name }: { name: string }): string {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#faf9f7;padding:24px;color:#16181d;margin:0;">
  <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e3dd;">
    <tr><td style="background:#e65100;padding:32px 28px;color:#fff;text-align:center;">
      <div style="font-size:11px;letter-spacing:2px;opacity:.85;font-weight:600;">CONTAN2</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px;">Recibimos tu solicitud</div>
    </td></tr>
    <tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#16181d;">
      <p>Hola ${escapeHtml(name)},</p>
      <p>Gracias por escribirnos. Vimos tu interés en <strong>contan2</strong> y te
      responderemos en menos de 24 horas hábiles con una propuesta concreta y un enlace
      para agendar una demo.</p>
      <p style="margin-top:24px;color:#6b7077;">— Equipo contan2</p>
    </td></tr>
    <tr><td style="background:#faf9f7;padding:14px 28px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e6e3dd;">
      Este correo lo enviamos porque llenaste el formulario en contan2.com.
    </td></tr>
  </table></body></html>`;
}

export async function sendContactEmails(
  input: ContactInput,
  meta: ContactMeta,
  deps: ContactEmailDeps = {},
): Promise<ContactEmailResult> {
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  if (!deps.send && !apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[contact-dev] lead de ${maskEmail(input.email)} (${input.organization}) — falta RESEND_API_KEY`);
    return { ok: true, skipped: true, reason: 'sin RESEND_API_KEY' };
  }

  const from = deps.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const replyTo = deps.replyTo ?? process.env.EMAIL_REPLY_TO ?? null;
  const inbox = deps.inbox ?? process.env.LANDING_INBOX_EMAIL ?? DEFAULT_INBOX;
  const send = deps.send ?? ((m: SendMessage) => resendSend(apiKey as string, m));

  // Inbox primero (lo crítico). Best-effort: no falla el request si se cae.
  let inboxId: string | undefined;
  try {
    const r = await send({
      from,
      to: inbox,
      replyTo: input.email,
      subject: `Lead · ${input.organization} (${input.name})`,
      html: inboxHtml({ ...input, ...meta }),
      attachments: [],
    });
    if (r.error) {
      // eslint-disable-next-line no-console
      console.error('[contact] error enviando lead a inbox:', r.error);
    } else {
      inboxId = r.id;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[contact] excepción al enviar lead:', e instanceof Error ? e.message : String(e));
  }

  // Ack al prospecto (nice-to-have). Fallar acá no afecta el resultado.
  let ackId: string | undefined;
  try {
    const r = await send({
      from,
      to: input.email,
      ...(replyTo ? { replyTo } : {}),
      subject: 'Recibimos tu solicitud · contan2',
      html: ackHtml({ name: input.name }),
      attachments: [],
    });
    if (!r.error) ackId = r.id;
  } catch {
    // no-op: el ack es best-effort
  }

  return { ok: true, inboxId, ackId };
}
