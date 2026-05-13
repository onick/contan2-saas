import { config } from './config.js';
import { initRepositories, CCB_ORG_ID } from './db/repositories.js';
import { OrganizationRepository } from './db/postgres/platform/OrganizationRepository.js';
import { hashPin } from './services/staffPin.js';

/**
 * Tareas idempotentes que corren al iniciar el server.
 * - Setea staff_pin_hash de la org CCB si está null (default PIN 2828).
 */
export async function runBootstrap() {
  if (config.DB_DRIVER !== 'postgres') return;
  const inst = await initRepositories();
  const orgRepo = new OrganizationRepository(inst.pool);
  const ccb = await orgRepo.findById(CCB_ORG_ID);
  if (!ccb) {
    console.log('[bootstrap] org CCB no encontrada (¿migrations corrieron?)');
    return;
  }
  if (!ccb.staffPinHash) {
    const hash = await hashPin(config.STAFF_PIN || '2828');
    await orgRepo.update(CCB_ORG_ID, { staffPinHash: hash });
    console.log('[bootstrap] staff PIN default seteado para CCB');
  }
}
