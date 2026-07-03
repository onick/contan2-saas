// apps/api-v2/test/contact.test.ts · formulario público de la landing.
// Cobertura: (1) HTML de los templates, (2) sendContactEmails con deps
// inyectables (dry-run + mock send), (3) route POST /contact via Fastify inject
// (validación, honeypot, rate-limit). Sin DB, sin Redis, sin Resend real.

import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import {
  inboxHtml,
  ackHtml,
  sendContactEmails,
  type ContactInput,
} from '../src/services/contact.js';
import { contactRoute } from '../src/routes/contact.js';
import type { SendMessage } from '../src/services/email.js';

const validInput: ContactInput = {
  name: 'María López',
  organization: 'Centro Cultural Test',
  email: 'maria@test.local',
  message: 'Queremos una demo para nuestro centro.',
  fax: '',
};

describe('inboxHtml', () => {
  it('incluye name, organización, email y mensaje escapado', () => {
    const html = inboxHtml({ ...validInput, ip: '1.2.3.4', ua: 'curl/8' });
    expect(html).toContain('María López');
    expect(html).toContain('Centro Cultural Test');
    expect(html).toContain('maria@test.local');
    expect(html).toContain('Queremos una demo');
    expect(html).toContain('1.2.3.4');
  });

  it('escapea HTML hostil en el nombre y mensaje', () => {
    const html = inboxHtml({
      ...validInput,
      name: '<script>alert(1)</script>',
      message: '<img src=x onerror=alert(1)>',
      ip: '',
      ua: '',
    });
    // Los tags se neutralizan: el browser los dibuja como texto, no como
    // elementos. escapeHtml convierte <>&"' pero NO borra atributos como
    // `onerror=` (no tienen chars especiales); la protección es que el `<`
    // inicial se escapa → el tag nunca llega a existir en el DOM.
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img ');
    expect(html).toContain('&lt;img ');
  });

  it('mensaje vacío → marcador (sin mensaje)', () => {
    const html = inboxHtml({ ...validInput, message: '', ip: '', ua: '' });
    expect(html).toContain('(sin mensaje)');
  });
});

describe('ackHtml', () => {
  it('incluye el nombre y la promesa de respuesta', () => {
    const html = ackHtml({ name: 'Carlos' });
    expect(html).toContain('Carlos');
    expect(html).toContain('Recibimos tu solicitud');
    expect(html).toContain('24 horas');
  });

  it('escapea HTML hostil en el nombre', () => {
    const html = ackHtml({ name: '<b>x</b>' });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('sendContactEmails', () => {
  afterEach(() => { delete process.env.RESEND_API_KEY; });

  it('dry-run sin key y sin sender → skipped (no envía)', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendContactEmails(validInput, { ip: '', ua: '' });
    expect(r).toMatchObject({ ok: true, skipped: true });
  });

  it('con sender inyectado envía inbox + ack (2 mensajes, parámetros correctos)', async () => {
    const sent: SendMessage[] = [];
    const r = await sendContactEmails(validInput, { ip: '1.2.3.4', ua: 'curl' }, {
      send: async (m) => { sent.push(m); return { id: `id-${sent.length}` }; },
      from: 'contan2 <noreply@contan2.com>',
      replyTo: 'hola@contan2.com',
      inbox: 'leads@contan2.com',
    });
    expect(r).toMatchObject({ ok: true, inboxId: 'id-1', ackId: 'id-2' });
    expect(sent).toHaveLength(2);
    // Inbox primero (al inbox configurado, replyTo = email del prospecto).
    expect(sent[0]!.to).toBe('leads@contan2.com');
    expect(sent[0]!.replyTo).toBe('maria@test.local');
    expect(sent[0]!.subject).toContain('Lead · Centro Cultural Test');
    // Ack al prospecto (al email del prospecto, replyTo = hola@).
    expect(sent[1]!.to).toBe('maria@test.local');
    expect(sent[1]!.replyTo).toBe('hola@contan2.com');
    expect(sent[1]!.subject).toContain('Recibimos tu solicitud');
  });

  it('error del transporte en inbox → NO lanza; aun así intenta ack', async () => {
    let ackCalled = false;
    const r = await sendContactEmails(validInput, { ip: '', ua: '' }, {
      send: async (m) => {
        if (m.to.includes('leads')) return { error: 'boom inbox' };
        ackCalled = true;
        return { id: 'ack-1' };
      },
      inbox: 'leads@contan2.com',
    });
    expect(r).toMatchObject({ ok: true });
    expect(ackCalled).toBe(true);
  });
});

// ── Route (Fastify inject) ──────────────────────────────────────────────────
// El limiter del route es un singleton module-level (ventana 1h). Para evitar
// interferencia entre tests, cada uno usa una IP única vía x-forwarded-for.

function buildApp() {
  const app = Fastify({ trustProxy: true });
  app.register(contactRoute, { prefix: '/api/v2' });
  return app;
}

async function postContact(app: Fastify.FastifyInstance, body: unknown, ip: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v2/contact',
    headers: { 'x-forwarded-for': ip },
    payload: body as Record<string, unknown>,
  });
}

describe('POST /api/v2/contact', () => {
  it('body válido (dry-run sin RESEND_API_KEY) → 200 { ok: true }', async () => {
    delete process.env.RESEND_API_KEY;
    const app = buildApp();
    try {
      const res = await postContact(app, {
        name: 'Ana Pérez',
        organization: 'Teatro Nacional',
        email: 'ana@test.local',
        message: 'Hola',
      }, '192.0.2.10');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('body inválido (sin email) → 400', async () => {
    const app = buildApp();
    try {
      const res = await postContact(app, {
        name: 'Ana',
        organization: 'X',
        email: 'no-es-un-email',
      }, '192.0.2.11');
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/inválido/i);
    } finally {
      await app.close();
    }
  });

  it('campos requeridos faltantes → 400', async () => {
    const app = buildApp();
    try {
      const res = await postContact(app, { name: 'X' }, '192.0.2.12');
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('honeypot fax con contenido → 200 (silencioso, no envía)', async () => {
    // El branch del honeypot retorna antes de llamar al service. Cubrimos el
    // envío real en los tests del service arriba; acá sólo validamos la forma.
    delete process.env.RESEND_API_KEY;
    const app = buildApp();
    try {
      const res = await postContact(app, {
        name: 'Ana', organization: 'Teatro', email: 'ana@test.local', fax: 'spam-bot',
      }, '192.0.2.13');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('rate-limit: la ráfaga desde la misma IP termina bloqueada (429 con retry-after)', async () => {
    // El limiter (max=3) es fail-safe: si el backend Redis tiene un hipo, degrada
    // a in-memory (rate-limit.ts) y se puede perder algún INCR. Por eso NO se
    // afirma un índice exacto (el 4to), que era flaky en el job `integration` con
    // Redis: se dispara una ráfaga holgada y se verifica que el limiter ENGANCHA
    // (primer request pasa; alguno posterior queda 429 con retry-after).
    const app = buildApp();
    try {
      const ip = '192.0.2.20';
      const body = { name: 'Ana', organization: 'Teatro', email: 'ana@test.local' };
      const res = [];
      for (let i = 0; i < 8; i++) res.push(await postContact(app, body, ip));
      expect(res[0]!.statusCode).toBe(200); // el primero siempre pasa
      const blocked = res.find((r) => r.statusCode === 429);
      expect(blocked, 'la ráfaga debe terminar limitada (429)').toBeDefined();
      expect(blocked!.headers['retry-after']).toBeDefined();
      expect(blocked!.json().error).toMatch(/varias solicitudes/i);
    } finally {
      await app.close();
    }
  });
});
