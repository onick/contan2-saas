// Plantillas del correo de la agenda de la Sala VR: confirmación, cancelación, reprogramación.
import { describe, it, expect } from 'vitest';
import { buildBookingHtml, sendBookingEmail, type BookingInfo } from '../src/services/booking-email.js';

const info: BookingInfo = {
  salaName: 'Sala VR', scheduledAt: '2030-01-15T15:00:00.000Z', colegio: 'Colegio Demo', level: '3ro B',
  contactName: 'Ana', studentCount: 12, previousAt: '2030-01-10T14:00:00.000Z',
};

describe('booking-email · plantillas', () => {
  it('confirmación: encabezado y fecha en español (REPORT_TZ)', () => {
    const h = buildBookingHtml('a@b.do', info, null, 'confirmed');
    expect(h).toContain('Visita confirmada');
    expect(h).toContain('a las 11:00'); // 15:00Z = 11:00 en Santo Domingo
    expect(h).toContain('15 de enero de 2030');
    expect(h).not.toContain('line-through');
  });
  it('cancelación: encabezado propio y fecha tachada', () => {
    const h = buildBookingHtml('a@b.do', info, null, 'cancelled');
    expect(h).toContain('Visita cancelada');
    expect(h).toContain('line-through');
  });
  it('reprogramación: muestra la fecha anterior tachada y la nueva', () => {
    const h = buildBookingHtml('a@b.do', info, null, 'rescheduled');
    expect(h).toContain('Visita reprogramada');
    expect(h).toMatch(/line-through[^>]*>[^<]*10 de enero/);
    expect(h).toContain('15 de enero');
  });
  it('asunto por tipo y envío inyectado; error del proveedor → { sent:false }', async () => {
    const subjects: string[] = [];
    const ok = await sendBookingEmail('cancelled', 'a@b.do', info, null, { send: async (m) => { subjects.push(m.subject); return { id: 'x' }; } });
    expect(ok).toEqual({ sent: true, id: 'x' });
    expect(subjects).toEqual(['Visita cancelada · Sala VR']);
    const bad = await sendBookingEmail('rescheduled', 'a@b.do', info, null, { send: async () => ({ error: 'boom' }) });
    expect(bad).toEqual({ sent: false, error: 'boom' });
  });
});
