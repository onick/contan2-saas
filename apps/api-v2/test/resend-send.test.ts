// apps/api-v2/test/resend-send.test.ts · robustez del transporte compartido.
// Mockea el SDK `resend` para verificar el retry/backoff ante fallos
// transitorios y el corto-circuito ante errores permanentes de validación.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: sendMock } })),
}));

import { resendSend, type SendMessage } from '../src/services/email.js';

const msg: SendMessage = { from: 'a@b.com', to: 'c@d.com', subject: 's', html: '<p>h</p>', attachments: [] };

beforeEach(() => sendMock.mockReset());

describe('resendSend · robustez', () => {
  it('reintenta ante fallos transitorios y termina OK', async () => {
    sendMock
      .mockResolvedValueOnce({ error: { name: 'internal_server_error', message: 'boom' } })
      .mockResolvedValueOnce({ error: { name: 'rate_limit_exceeded', message: '429' } })
      .mockResolvedValueOnce({ data: { id: 're_ok' } });
    const r = await resendSend('key', msg);
    expect(r).toEqual({ id: 're_ok' });
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('reintenta ante excepción de red (timeout/fetch) y termina OK', async () => {
    sendMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ data: { id: 're_retry' } });
    const r = await resendSend('key', msg);
    expect(r).toEqual({ id: 're_retry' });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('error permanente de validación → NO reintenta', async () => {
    sendMock.mockResolvedValueOnce({ error: { name: 'validation_error', message: 'from inválido' } });
    const r = await resendSend('key', msg);
    expect(r).toEqual({ error: 'from inválido' });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('agota los reintentos → devuelve el último error', async () => {
    sendMock.mockResolvedValue({ error: { name: 'internal_server_error', message: 'down' } });
    const r = await resendSend('key', msg);
    expect(r).toEqual({ error: 'down' });
    expect(sendMock).toHaveBeenCalledTimes(3);
  });
});
