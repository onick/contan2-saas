// apps/api-v2/src/services/credential-delivery.ts · orquesta la entrega de la
// credencial tras un check-in: trae branding del tenant → genera PNG → envía por
// correo (Resend, best-effort) y por WHATSAPP si el visitante dejó teléfono
// (Meta Cloud API, best-effort) → marca users.credential_sent_at SOLO si ALGÚN
// envío fue real. En dry-run (sin RESEND_API_KEY / sin credenciales de Meta)
// NO marca. Un visitante SOLO-teléfono también recibe su credencial.
//
// Vive APARTE del check-in (que ya respondió). La ruta lo dispara fire-and-forget
// FUERA de la transacción; los tests lo llaman directo (sin flakiness).

import type { DbClient } from '@contan2/db';
import { generateCredentialPng, loadLogoDataUri } from './credential.js';
import { sendCredentialEmail, type CredentialEmailDeps, type CredentialEmailResult } from './email.js';
import { sendWhatsAppCredential, type WhatsAppDeps, type WhatsAppResult } from './whatsapp.js';
import type { OrgBranding } from './branding-tokens.js';

export interface DeliverUser {
  id: string;
  code: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null; // si no viene, se busca en DB (los callers no lo proyectan)
}

export type DeliverDeps = CredentialEmailDeps & { whatsapp?: WhatsAppDeps };

export async function deliverCredential(
  db: DbClient,
  orgId: string,
  user: DeliverUser,
  deps: DeliverDeps = {},
): Promise<CredentialEmailResult> {
  // Teléfono: los call sites históricos no lo pasan → una consulta barata.
  const phone = user.phone !== undefined
    ? user.phone
    : (await db.selectFrom('users').select('phone').where('id', '=', user.id).executeTakeFirst())?.phone ?? null;

  if (!user.email && !phone) return { skipped: true, reason: 'sin email' };

  const org = await db
    .selectFrom('organizations')
    .select([
      'name', 'primary_color', 'secondary_color', 'logo_url', 'email_logo_url', 'credential_logo_url',
      'email_from_addr', 'email_from_name', 'email_reply_to',
    ])
    .where('id', '=', orgId)
    .executeTakeFirst();

  const branding: OrgBranding | null = org
    ? { name: org.name, primaryColor: org.primary_color, secondaryColor: org.secondary_color }
    : null;

  const logo = await loadLogoDataUri(org?.credential_logo_url ?? org?.logo_url ?? org?.email_logo_url ?? null);
  const png = await generateCredentialPng(user, branding, logo);

  // Remitente: prefiere el de la org (email_from_addr/name); si no, el del env.
  const from = deps.from
    ?? (org?.email_from_addr ? `${org.email_from_name || org.name} <${org.email_from_addr}>` : undefined);
  const replyTo = deps.replyTo ?? org?.email_reply_to ?? null;

  const result: CredentialEmailResult = user.email
    ? await sendCredentialEmail(user, branding, png, { ...deps, from, replyTo })
    : { skipped: true, reason: 'sin email' };

  // WhatsApp en paralelo conceptual (mismo PNG): dry-run sin credenciales de
  // Meta. El retorno del orquestador sigue siendo el del email (compat con
  // los callers); el canal WhatsApp cuenta para credential_sent_at.
  const wa: WhatsAppResult = await sendWhatsAppCredential(
    { code: user.code, firstName: user.firstName, phone },
    png,
    deps.whatsapp ?? {},
  );

  const emailSent = 'sent' in result && result.sent === true;
  const waSent = 'sent' in wa && wa.sent === true;
  // Marca credential_sent_at SOLO si ALGÚN canal envió de verdad.
  if (emailSent || waSent) {
    await db.updateTable('users')
      .set({ credential_sent_at: new Date().toISOString() })
      .where('id', '=', user.id)
      .execute();
  }
  return result;
}
