// apps/api-v2/test/invitation-email.test.ts · unit (sin DB): email de
// invitación RSVP. Dry-run honesto sin key; HTML branded con portada, fecha
// es-DO, botones ?intent=yes|no y enlace plano; escape de HTML hostil; el
// remitente y replyTo inyectados llegan al mensaje.

import { describe, it, expect } from 'vitest';
import {
  buildInvitationHtml,
  sendInvitationEmail,
  type InviteeUser,
  type InvitationActivityInfo,
} from '../src/services/invitation-email.js';
import type { SendMessage } from '../src/services/email.js';

const user: InviteeUser = { email: 'ana@test.local', firstName: 'Ana', lastName: 'Pérez' };
const act: InvitationActivityInfo = {
  name: 'Ciclo de Jazz · Apertura',
  date: '2026-07-10T23:00:00.000Z', // 7:00 p. m. en Santo Domingo (UTC-4)
  location: 'Sala Principal',
  imageUrl: '/uploads/cover.webp',
};
const branding = { name: 'Centro Cultural', primaryColor: '#0182a2', secondaryColor: '#ff6f00' };
const RSVP = 'https://ccb.contan2.com/rsvp/tok123';
const COVER = 'https://ccb.contan2.com/uploads/cover.webp';

describe('buildInvitationHtml', () => {
  const html = buildInvitationHtml(user, act, branding, RSVP, COVER);

  it('lleva nombre, actividad, lugar y fecha es-DO con hora de Santo Domingo', () => {
    expect(html).toContain('Ana');
    expect(html).toContain('Ciclo de Jazz · Apertura');
    expect(html).toContain('Sala Principal');
    expect(html).toContain('Viernes, 10 de julio de 2026');
    expect(html).toMatch(/7:00\s?p\.?\s?m\.?/i);
  });

  it('botones a /rsvp con intent y enlace plano de respaldo; portada absoluta', () => {
    expect(html).toContain(`${RSVP}?intent=yes`);
    expect(html).toContain(`${RSVP}?intent=no`);
    expect(html).toContain(`>${RSVP}</a>`);
    expect(html).toContain(COVER);
  });

  it('usa el branding del tenant (primario en banda, org name)', () => {
    expect(html).toContain('#0182a2');
    expect(html.toLowerCase()).toContain('centro cultural');
  });

  it('escapa HTML hostil en nombre de actividad', () => {
    const evil = buildInvitationHtml(user, { ...act, name: '<script>x</script>' }, branding, RSVP, null);
    expect(evil).not.toContain('<script>');
    expect(evil).toContain('&lt;script&gt;');
  });

  it('sin portada no renderiza <img>', () => {
    const noCover = buildInvitationHtml(user, { ...act, imageUrl: null }, branding, RSVP, null);
    expect(noCover).not.toContain('<img');
  });
});

describe('sendInvitationEmail', () => {
  it('dry-run sin key y sin sender → skipped (no envía)', async () => {
    const r = await sendInvitationEmail(user, act, branding, RSVP, COVER, { apiKey: undefined });
    expect(r).toMatchObject({ skipped: true });
  });

  it('con sender inyectado arma el mensaje completo (from/replyTo/subject/html)', async () => {
    let got: SendMessage | null = null;
    const r = await sendInvitationEmail(user, act, branding, RSVP, COVER, {
      send: async (m) => { got = m; return { id: 'msg-1' }; },
      from: 'CCB <eventos@ccb.do>',
      replyTo: 'hola@ccb.do',
    });
    expect(r).toMatchObject({ sent: true, id: 'msg-1' });
    expect(got!.to).toBe('ana@test.local');
    expect(got!.from).toBe('CCB <eventos@ccb.do>');
    expect(got!.replyTo).toBe('hola@ccb.do');
    expect(got!.subject).toContain('Ciclo de Jazz');
    expect(got!.html).toContain(`${RSVP}?intent=yes`);
    expect(got!.attachments).toEqual([]);
  });

  it('error del transporte → { sent:false } sin lanzar', async () => {
    const r = await sendInvitationEmail(user, act, branding, RSVP, null, {
      send: async () => ({ error: 'boom' }),
    });
    expect(r).toMatchObject({ sent: false, error: 'boom' });
  });
});
