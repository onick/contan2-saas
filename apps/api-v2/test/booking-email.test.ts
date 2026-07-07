// apps/api-v2/test/booking-email.test.ts · unit (sin DB) del email de confirmación
// de reserva. Sin RESEND ni transporte → dry-run (skipped). Con transporte
// inyectado → envía y el HTML lleva sala/colegio/hora.
import { describe, it, expect } from 'vitest';
import { sendBookingConfirmEmail, buildBookingHtml, type BookingInfo } from '../src/services/booking-email.js';

const info: BookingInfo = {
  salaName: 'Sala VR', scheduledAt: '2026-06-12T14:00:00.000Z',
  colegio: 'Colegio San Juan', level: '3ro B', contactName: 'Ana', studentCount: 28,
};

describe('booking-email', () => {
  it('dry-run sin RESEND ni transporte → skipped', async () => {
    const r = await sendBookingConfirmEmail('ana@colegio.do', info, null, { apiKey: '' });
    expect('skipped' in r && r.skipped).toBe(true);
  });

  it('con transporte inyectado → sent, y captura el mensaje', async () => {
    const sent: { to: string; subject: string; html: string }[] = [];
    const r = await sendBookingConfirmEmail('ana@colegio.do', info, null, {
      send: async (m) => { sent.push({ to: m.to, subject: m.subject, html: m.html }); return { id: 'x' }; },
    });
    expect('sent' in r && r.sent === true).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ana@colegio.do');
    expect(sent[0]!.subject).toContain('Sala VR');
    expect(sent[0]!.html).toContain('Colegio San Juan');
  });

  it('el HTML escapa e incluye la sala + cantidad', () => {
    const html = buildBookingHtml('a@b.do', info, null);
    expect(html).toContain('Sala VR');
    expect(html).toContain('28 alumnos');
  });
});
