// apps/api-v2/src/services/credential-delivery.ts · orquesta la entrega de la
// credencial tras un check-in: trae branding del tenant → genera PNG → envía por
// correo (Resend, best-effort) → marca users.credential_sent_at SOLO si el envío
// fue real (sent === true). En dry-run (sin RESEND_API_KEY) NO marca.
//
// Vive APARTE del check-in (que ya respondió). La ruta lo dispara fire-and-forget
// FUERA de la transacción; los tests lo llaman directo (sin flakiness).

import type { DbClient } from '@contan2/db';
import { generateCredentialPng, loadLogoDataUri } from './credential.js';
import { sendCredentialEmail, type CredentialEmailDeps, type CredentialEmailResult } from './email.js';
import type { OrgBranding } from './branding-tokens.js';

export interface DeliverUser {
  id: string;
  code: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

export async function deliverCredential(
  db: DbClient,
  orgId: string,
  user: DeliverUser,
  deps: CredentialEmailDeps = {},
): Promise<CredentialEmailResult> {
  if (!user.email) return { skipped: true, reason: 'sin email' };

  const org = await db
    .selectFrom('organizations')
    .select([
      'name', 'primary_color', 'secondary_color', 'logo_url', 'email_logo_url',
      'email_from_addr', 'email_from_name', 'email_reply_to',
    ])
    .where('id', '=', orgId)
    .executeTakeFirst();

  const branding: OrgBranding | null = org
    ? { name: org.name, primaryColor: org.primary_color, secondaryColor: org.secondary_color }
    : null;

  const logo = await loadLogoDataUri(org?.logo_url ?? org?.email_logo_url ?? null);
  const png = await generateCredentialPng(user, branding, logo);

  // Remitente: prefiere el de la org (email_from_addr/name); si no, el del env.
  const from = deps.from
    ?? (org?.email_from_addr ? `${org.email_from_name || org.name} <${org.email_from_addr}>` : undefined);
  const replyTo = deps.replyTo ?? org?.email_reply_to ?? null;

  const result = await sendCredentialEmail(user, branding, png, { ...deps, from, replyTo });

  // Marca credential_sent_at SOLO si hubo envío real.
  if ('sent' in result && result.sent === true) {
    await db.updateTable('users')
      .set({ credential_sent_at: new Date().toISOString() })
      .where('id', '=', user.id)
      .execute();
  }
  return result;
}
