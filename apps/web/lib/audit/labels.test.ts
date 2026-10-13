import { describe, it, expect } from 'vitest';
import { actionMeta, actionLabel, ACTION_LABEL } from './labels';

// Claves reales extraídas de api-v2 por grep (oct 2026).
// Fuente: apps/api-v2/src/routes/*.ts + services/*.ts
const REAL_KEYS = [
  // actividades
  'activity.created',
  'activity.audience_invited', 'activity.deleted', 'activity.guests_added',
  'activity.guests_imported', 'activity.protocol_invited',
  // asistencia
  'attendance.companions_edited', 'attendance.deleted',
  // biblio
  'biblio.exported',
  'biblio.inventory.exported', 'biblio.inventory.finished', 'biblio.inventory.started',
  'biblio.item.created', 'biblio.item.retired', 'biblio.item.updated',
  'biblio.loan.created', 'biblio.loan.renewed', 'biblio.loan.returned',
  'biblio.reader.created', 'biblio.reader.profile_updated',
  'biblio.reader.reactivated', 'biblio.reader.suspended',
  'biblio.reservation.cancelled', 'biblio.reservation.created',
  'biblio.site.created',
  'biblio.title.cover_updated', 'biblio.title.created', 'biblio.title.updated',
  // sala
  'booking.created', 'puerta.exported',
  // identidad
  'branding.updated',
  // checkin
  'checkin.anonymous', 'checkin.manual',
  // credenciales
  'credential.resent',
  // programas
  'program.created',
  // protocolo
  'protocol.designated', 'protocol.removed', 'protocol.updated',
  // reportes
  'report.generated',
  // equipo
  'staff.invited', 'staff.invitation_revoked', 'staff.role_changed', 'staff.status_changed',
  // visitantes
  'user.archived', 'user.created', 'user.reactivated', 'user.updated', 'users.imported',
] as const;

describe('actionMeta', () => {
  it('devuelve frase, icono y tono para cada clave real de api-v2', () => {
    for (const key of REAL_KEYS) {
      const meta = actionMeta(key);
      expect(meta.frase, `frase de ${key}`).toBeTruthy();
      expect(meta.icono, `icono de ${key}`).toBeTruthy();
      expect(['brand', 'success', 'danger', 'info', 'neutral'], `tono de ${key}`).toContain(meta.tono);
    }
  });

  it('ninguna clave real devuelve la frase genérica de fallback', () => {
    for (const key of REAL_KEYS) {
      const meta = actionMeta(key);
      expect(meta.frase, `${key} no debe caer al fallback`).not.toBe('Actividad registrada');
    }
  });

  it('clave desconocida devuelve frase genérica (no la clave cruda)', () => {
    const meta = actionMeta('unknown.action.xyz');
    expect(meta.frase).toBe('Actividad registrada');
    expect(meta.tono).toBe('neutral');
    expect(meta.icono).toBeTruthy();
  });
});

describe('actionLabel', () => {
  it('devuelve frase legible para claves conocidas', () => {
    expect(actionLabel('checkin.manual')).toBe('Check-in registrado');
    expect(actionLabel('biblio.loan.returned')).toBe('Préstamo devuelto');
    expect(actionLabel('user.created')).toBe('Visitante registrado');
    expect(actionLabel('credential.resent')).toBe('Se enviaron credenciales');
  });

  it('nunca devuelve la clave cruda para claves desconocidas', () => {
    const unknown = 'some.unknown.key';
    expect(actionLabel(unknown)).not.toBe(unknown);
    expect(actionLabel(unknown)).toBe('Actividad registrada');
  });
});

describe('ACTION_LABEL', () => {
  it('contiene todas las claves reales de api-v2', () => {
    for (const key of REAL_KEYS) {
      expect(ACTION_LABEL, `ACTION_LABEL debe tener "${key}"`).toHaveProperty(key);
    }
  });
});
