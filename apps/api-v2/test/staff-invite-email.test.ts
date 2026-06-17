// apps/api-v2/test/staff-invite-email.test.ts · unit (sin DB). El envío real del
// correo de invitación de EQUIPO: dry-run sin key, Resend (send inyectado) con to/
// subject/link correctos, manejo de error, y escapado/branding del HTML.

import { describe, it, expect, vi } from 'vitest';
import { sendStaffInviteEmail, buildStaffInviteHtml } from '../src/services/staff-invite-email.js';

const BR = { name: 'Centro CCB', primaryColor: '#e65100', secondaryColor: '#ff6f00' };

describe('staff-invite-email', () => {
  it('dry-run sin RESEND_API_KEY ni send → skipped', async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const r = await sendStaffInviteEmail('a@b.com', { orgName: 'CCB', role: 'operator', inviteUrl: 'https://x/invite/tok', branding: null });
      expect(r).toEqual({ skipped: true, reason: 'sin RESEND_API_KEY' });
    } finally {
      if (prev !== undefined) process.env.RESEND_API_KEY = prev;
    }
  });

  it('con send inyectado → envía con to/subject correctos + el link en el HTML; sent', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'em_123' });
    const r = await sendStaffInviteEmail('esthe@x.com',
      { orgName: 'Centro CCB', role: 'operator', inviteUrl: 'https://ccb.contan2.com/invite/TOKEN123', branding: BR }, { send });
    expect(r).toEqual({ sent: true, id: 'em_123' });
    const msg = send.mock.calls[0]![0] as { to: string; subject: string; html: string; attachments: unknown[] };
    expect(msg.to).toBe('esthe@x.com');
    expect(msg.subject).toContain('Centro CCB');
    expect(msg.attachments).toEqual([]);
    expect(msg.html).toContain('https://ccb.contan2.com/invite/TOKEN123'); // el link de aceptación
    expect(msg.html).toContain('Operador'); // rol traducido
  });

  it('error del transporte → { error }', async () => {
    const send = vi.fn().mockResolvedValue({ error: 'rejected' });
    const r = await sendStaffInviteEmail('a@b.com', { orgName: 'X', role: 'admin', inviteUrl: 'https://x/invite/t', branding: null }, { send });
    expect(r).toEqual({ error: 'rejected' });
  });

  it('buildStaffInviteHtml escapa el nombre y usa el color de marca', () => {
    const html = buildStaffInviteHtml({ orgName: 'A&B <x>', role: 'protocolo', inviteUrl: 'https://x/invite/t', branding: { name: 'A', primaryColor: '#0182a2', secondaryColor: '#000000' } });
    expect(html).toContain('A&amp;B &lt;x&gt;'); // escapado (anti-inyección)
    expect(html).toContain('#0182a2');           // botón con color de marca del tenant
    expect(html).toContain('Protocolo');
  });
});
