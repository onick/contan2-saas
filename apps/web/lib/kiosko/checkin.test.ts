import { describe, it, expect } from 'vitest';
import { checkinErrorMessage } from './checkin';

describe('kiosko · checkinErrorMessage (status/mensaje → copy)', () => {
  it('409 correo ya registrado', () => {
    expect(checkinErrorMessage(409, { error: 'Ese correo ya está registrado. Identifícate con tu código.' }))
      .toMatch(/correo ya está registrado/i);
  });

  it('409 ya registrado en la actividad', () => {
    expect(checkinErrorMessage(409, { error: 'Ya estás registrado en esta actividad.' }))
      .toMatch(/ya tienes tu asistencia/i);
  });

  it('409 cupo agotado (por defecto)', () => {
    expect(checkinErrorMessage(409, { error: 'Cupo agotado.' })).toMatch(/se agotó el cupo/i);
  });

  it('404 actividad vs visitante', () => {
    expect(checkinErrorMessage(404, { error: 'Actividad no encontrada.' })).toMatch(/actividad ya no está disponible/i);
    expect(checkinErrorMessage(404, { error: 'No te encontramos con ese dato.' })).toMatch(/no te encontramos/i);
  });

  it('400 datos / 429 / red', () => {
    expect(checkinErrorMessage(400, { error: 'x' })).toMatch(/revisa tus datos/i);
    expect(checkinErrorMessage(429, { error: 'x' })).toMatch(/demasiados intentos/i);
    expect(checkinErrorMessage(0, null)).toMatch(/no pudimos completar/i);
  });
});
