// apps/api-v2/src/routes/contact.ts · POST /api/v2/contact.
// Formulario público de la landing (web-v2). Sin tenant scope (vive en el host
// de marketing). Rate-limit por IP (3/hora, paridad v1), honeypot `fax`, y el
// envío de emails delega a services/contact.ts. Dry-run sin RESEND_API_KEY.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ContactRequestSchema, type ContactResponse } from '@contan2/contracts';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { sendContactEmails } from '../services/contact.js';

// 3 envíos/hora/IP (paridad con v1 · backend/src/routes/landing.js:16).
const contactLimiter = createRateLimiter({
  max: 3,
  windowMs: 60 * 60_000,
  prefix: endpointPrefix('contact'),
});

export const contactRoute: FastifyPluginAsync = async (app) => {
  app.post('/contact', async (req: FastifyRequest, reply) => {
    // 1) Rate-limit por IP real (trustProxy=1 → req.ip es la del visitante).
    const rl = await contactLimiter.hit(req.ip);
    if (rl.limited) {
      reply.code(429);
      reply.header('retry-after', Math.ceil(rl.retryAfterMs / 1000));
      return {
        error: 'Recibimos varias solicitudes desde tu ubicación. Espera una hora o escríbenos directo a hola@contan2.com.',
      };
    }

    // 2) Validar body contra el contrato.
    let parsed;
    try {
      parsed = ContactRequestSchema.parse(req.body ?? {});
    } catch {
      reply.code(400);
      return { error: 'Datos incompletos o inválidos.' };
    }

    // 3) Honeypot: si fax tiene contenido, responder OK sin enviar (bot cree que pasó).
    if (parsed.fax && parsed.fax.length > 0) {
      req.log.info({ evt: 'contact_honeypot', ip: req.ip }, 'honeypot descartado');
      return { ok: true } satisfies ContactResponse;
    }

    // 4) Enviar emails (inbox + ack). Best-effort, nunca lanza.
    const result = await sendContactEmails(parsed, {
      ip: req.ip,
      ua: req.headers['user-agent'] ?? '',
    });

    if ('skipped' in result) {
      req.log.info({ evt: 'contact_dev', org: parsed.organization }, `lead de ${parsed.email} en dry-run`);
    } else {
      req.log.info(
        { evt: 'contact_lead', inboxId: result.inboxId, org: parsed.organization },
        `lead recibido de ${parsed.email}`,
      );
    }

    return { ok: true } satisfies ContactResponse;
  });
};
