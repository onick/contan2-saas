// apps/api-v2/test/credential-delivery.test.ts · integration (skip sin
// DATABASE_URL). deliverCredential: genera PNG + envía + marca credential_sent_at
// SOLO si el envío fue real. Usa send inyectado (sin red).

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { deliverCredential, type DeliverUser } from '../src/services/credential-delivery.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('deliverCredential · marca credential_sent_at sólo si sent', () => {
  let db: Kysely<Database>;
  const stamp = Date.now();
  let orgId: string;
  const uSent = { id: randomUUID(), code: 'CCB-SENT01', email: 'sent@e2e.test', firstName: 'Eva', lastName: 'Sent' };
  const uSkip = { id: randomUUID(), code: 'CCB-SKIP01', email: 'skip@e2e.test', firstName: 'Noe', lastName: 'Skip' };
  const uNoMail = { id: randomUUID(), code: 'CCB-NONE01', email: null, firstName: 'Sin', lastName: 'Correo' };

  const mkUser = (u: DeliverUser) =>
    db.insertInto('users').values({
      id: u.id, organization_id: orgId, code: u.code, first_name: u.firstName, last_name: u.lastName, email: u.email, visit_count: 1,
    }).execute();

  const sentAt = async (id: string) => {
    const r = await db.selectFrom('users').select('credential_sent_at').where('id', '=', id).executeTakeFirst();
    return r?.credential_sent_at ?? null;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const o = await db.insertInto('organizations').values({
      slug: `cred-${stamp}`, name: `Org cred ${stamp}`, status: 'active', primary_color: '#0f766e', secondary_color: '#f59e0b',
    }).returning('id').executeTakeFirstOrThrow();
    orgId = o.id;
    await mkUser(uSent);
    await mkUser(uSkip);
    await mkUser(uNoMail);
  });

  afterAll(async () => {
    if (!db) return;
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('envío real (send inyectado) → marca credential_sent_at', async () => {
    expect(await sentAt(uSent.id)).toBeNull();
    const r = await deliverCredential(db, orgId, uSent, { send: async () => ({ id: 're_ok' }) });
    expect(r).toEqual({ sent: true, id: 're_ok' });
    expect(await sentAt(uSent.id)).not.toBeNull();
  });

  it('dry-run (sin key, sin send) → skipped y NO marca', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await deliverCredential(db, orgId, uSkip);
    expect(r).toEqual({ skipped: true, reason: 'sin RESEND_API_KEY' });
    expect(await sentAt(uSkip.id)).toBeNull();
  });

  it('sin email → skipped y NO marca', async () => {
    const r = await deliverCredential(db, orgId, uNoMail, { send: async () => ({ id: 'x' }) });
    expect(r).toEqual({ skipped: true, reason: 'sin email' });
    expect(await sentAt(uNoMail.id)).toBeNull();
  });
});
