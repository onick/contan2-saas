// apps/api-v2/src/services/email.ts · envío de la credencial por correo (Resend).
// Port del contrato de v1 (backend/src/services/email.js sendCredentialEmail):
//  - sin RESEND_API_KEY → DRY-RUN: { skipped, reason } (genera la credencial pero
//    NO envía; el caller NO marca credential_sent_at).
//  - con key → envía vía Resend (HTML branded + PNG adjunto e inline).
// Best-effort: NUNCA lanza; devuelve un resultado discriminado. `deps.send` es
// inyectable para tests (sin tocar la red ni necesitar API key real).

import { Resend } from 'resend';
import type { OrgBranding } from './branding-tokens.js';
import { resolveBrandingTokens } from './branding-tokens.js';

export interface EmailUser {
  code: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

export type CredentialEmailResult =
  | { sent: true; id?: string }
  | { skipped: true; reason: string }
  | { sent: false; error: string };

export interface SendMessage {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  attachments: Array<{ filename: string; content: Buffer }>;
}

export interface CredentialEmailDeps {
  // Inyectable en tests. Si no se pasa y hay apiKey, se usa Resend real.
  send?: (msg: SendMessage) => Promise<{ id?: string; error?: string }>;
  apiKey?: string; // default: process.env.RESEND_API_KEY
  from?: string; // remitente ya resuelto (org o EMAIL_FROM)
  replyTo?: string | null;
}

export function maskEmail(email: string): string {
  return email.replace(/^(.).+(@.+)$/, '$1***$2');
}

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DEFAULT_FROM = 'contan2-saas <onboarding@resend.dev>';

function credentialHtml(user: EmailUser, branding: OrgBranding | null, credentialDataUri: string): string {
  const t = resolveBrandingTokens(branding);
  const name = escapeHtml(`${user.firstName} ${user.lastName}`.trim());
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td style="background:${t.primary};padding:28px 32px;">
        <span style="color:${t.onPrimary};font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(t.orgName)}</span>
      </td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <h1 style="margin:0 0 6px;font-size:22px;">Hola, ${name}</h1>
        <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.5;">Esta es tu credencial. Presenta el código QR en la entrada para registrar tu asistencia.</p>
      </td></tr>
      <tr><td align="center" style="padding:16px 24px 8px;">
        <img src="${credentialDataUri}" alt="Credencial ${escapeHtml(user.code)}" width="440" style="width:100%;max-width:440px;height:auto;border-radius:12px;" />
      </td></tr>
      <tr><td align="center" style="padding:8px 32px 28px;">
        <p style="margin:0;font-family:Menlo,Monaco,monospace;font-size:20px;font-weight:700;letter-spacing:3px;color:${t.primary};">${escapeHtml(user.code)}</p>
        <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">Guarda este correo. Si el QR no carga, muestra el código en la entrada.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Envío real vía Resend (lazy). Devuelve { id } o { error }. Exportado para
// que otros correos (invitación RSVP) reusen el mismo transporte.
export async function resendSend(apiKey: string, msg: SendMessage): Promise<{ id?: string; error?: string }> {
  const resend = new Resend(apiKey);
  const r = await resend.emails.send({
    from: msg.from,
    to: msg.to,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    subject: msg.subject,
    html: msg.html,
    attachments: msg.attachments,
  });
  if (r.error) return { error: r.error.message || String(r.error) };
  return { id: r.data?.id };
}

export async function sendCredentialEmail(
  user: EmailUser,
  branding: OrgBranding | null,
  pngBuffer: Buffer,
  deps: CredentialEmailDeps = {},
): Promise<CredentialEmailResult> {
  if (!user.email) return { skipped: true, reason: 'sin email' };

  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  // Dry-run: sin sender inyectado y sin API key, NO se envía.
  if (!deps.send && !apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[email-dev] credencial ${user.code} para ${maskEmail(user.email)} lista (${pngBuffer.length} bytes) — falta RESEND_API_KEY`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }

  const credentialDataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  const msg: SendMessage = {
    from: deps.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to: user.email,
    ...(deps.replyTo ? { replyTo: deps.replyTo } : {}),
    subject: `Tu credencial · ${user.code}`,
    html: credentialHtml(user, branding, credentialDataUri),
    attachments: [{ filename: `credencial-${user.code}.png`, content: pngBuffer }],
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
