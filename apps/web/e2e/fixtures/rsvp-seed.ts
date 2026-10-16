// fixtures/rsvp-seed.ts · tokens RSVP conocidos sembrados por provision/seed-staging.sql (decision 6.20).
// token(slot) = sha256(E2E_RSVP_TOKEN + ':' + slot), slot 1..6 (misma derivacion que make-seed.mjs).
// Slots: 1-3 = RSVP-01a (webkit-tablet, desktop-1440, mobile-390); 4-6 = RSVP-01b.
import { createHash } from 'node:crypto';
import { env } from '../env';

export function rsvpSeedConfigured(): boolean {
  return Boolean(env('E2E_RSVP_TOKEN'));
}

export function rsvpSeedToken(slot: number): string {
  const base = env('E2E_RSVP_TOKEN');
  if (!base) throw new Error('rsvp-seed: falta E2E_RSVP_TOKEN.');
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) throw new Error(`rsvp-seed: slot invalido (${slot}).`);
  return createHash('sha256').update(`${base}:${slot}`).digest('hex');
}
