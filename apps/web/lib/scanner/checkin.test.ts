import { describe, it, expect } from 'vitest';
import { classifyCheckin } from './checkin';

describe('scanner · classifyCheckin (status/mensaje → estado)', () => {
  it('200 → success con el código de la respuesta', () => {
    const body = { code: 'CCB-AB12CD', visitCount: 3, partySize: 1, activity: { id: 'a1', name: 'Cine' } };
    const r = classifyCheckin(200, body);
    expect(r.kind).toBe('success');
    expect(r.detail).toBe('CCB-AB12CD');
    expect(r.data).toEqual(body);
  });

  it('409 "ya registrado" → already', () => {
    const r = classifyCheckin(409, { error: 'Ya estás registrado en esta actividad.' });
    expect(r.kind).toBe('already');
  });

  it('409 "cupo agotado" → full', () => {
    expect(classifyCheckin(409, { error: 'Cupo agotado.' }).kind).toBe('full');
    expect(classifyCheckin(409, { error: 'La actividad no está activa.' }).kind).toBe('full');
  });

  it('404 "no te encontramos" → not-found', () => {
    expect(classifyCheckin(404, { error: 'No te encontramos con ese dato.' }).kind).toBe('not-found');
  });

  it('404 "actividad" → error (no es problema del código)', () => {
    expect(classifyCheckin(404, { error: 'Actividad no encontrada.' }).kind).toBe('error');
  });

  it('400 → invalid, 429/otros → error', () => {
    expect(classifyCheckin(400, { error: 'Código inválido.' }).kind).toBe('invalid');
    expect(classifyCheckin(429, { error: 'Demasiados intentos.' }).kind).toBe('error');
    expect(classifyCheckin(502, null).kind).toBe('error');
  });
});
