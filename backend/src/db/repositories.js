import { config } from '../config.js';
import { MemoryUserRepository } from './memoryUserRepository.js';
import { MemoryActivityRepository } from './memoryActivityRepository.js';
import { MemoryAttendanceRepository } from './memoryAttendanceRepository.js';
import { loadSnapshot, createScheduler } from './persistence.js';

const CCB_ORG_ID = '00000000-0000-0000-0000-000000000001';

let _pgInstance = null;
let _memoryInstance = null;

export async function initRepositories() {
  if (config.DB_DRIVER === 'memory') {
    if (_memoryInstance) return _memoryInstance;
    _memoryInstance = {
      users: new MemoryUserRepository(),
      activities: new MemoryActivityRepository(),
      attendance: new MemoryAttendanceRepository(),
    };

    const snapshot = await loadSnapshot();
    if (snapshot) {
      _memoryInstance.users.hydrate(snapshot.users);
      _memoryInstance.activities.hydrate(snapshot.activities);
      _memoryInstance.attendance.hydrate(snapshot.attendance);
      console.log(
        `[persistence] cargado: ${snapshot.users.length} usuarios, ${snapshot.activities.length} actividades, ${snapshot.attendance.length} asistencias`,
      );
    } else {
      console.log('[persistence] sin snapshot previo, iniciando vacío');
    }

    const scheduler = createScheduler(() => ({
      users: _memoryInstance.users.dump(),
      activities: _memoryInstance.activities.dump(),
      attendance: _memoryInstance.attendance.dump(),
    }));
    _memoryInstance.persist = () => scheduler.schedule();
    _memoryInstance.persistNow = () => scheduler.flushNow();
    _memoryInstance.driver = 'memory';
    return _memoryInstance;
  } else if (config.DB_DRIVER === 'postgres') {
    if (_pgInstance) return _pgInstance;
    const { getPool, applySchema } = await import('./postgres/pool.js');
    const pool = getPool();
    await applySchema();
    _pgInstance = { pool, driver: 'postgres' };
    console.log('[postgres] pool listo, migrations al día');
    return _pgInstance;
  } else {
    throw new Error(`DB_DRIVER no soportado: ${config.DB_DRIVER}`);
  }
}

/**
 * Devuelve un set de repositorios scopeados a una organización.
 * Para postgres: instancias bindeadas al organization_id.
 * Para memory: las mismas instancias singleton (single-tenant legacy).
 */
export async function createTenantRepos(organizationId, opts = {}) {
  const codePrefix = (opts.codePrefix || 'CCB').toUpperCase();
  if (config.DB_DRIVER === 'memory') {
    const inst = await initRepositories();
    inst.users.codePrefix = codePrefix;
    const invitationsStub = {
      async findByActivity() { return []; },
      async findByActivityAndUser() { return null; },
      async findById() { return null; },
      async create() { throw new Error('RSVP no soportado en modo memory'); },
      async respond() { throw new Error('RSVP no soportado en modo memory'); },
      async cancel() { return null; },
      async markSent() { return null; },
      async countByActivityAndStatus() { return 0; },
    };
    return {
      ...inst,
      invitations: invitationsStub,
      organizationId: organizationId || CCB_ORG_ID,
      codePrefix,
    };
  }
  if (config.DB_DRIVER === 'postgres') {
    const inst = await initRepositories();
    const { PostgresUserRepository } = await import('./postgres/PostgresUserRepository.js');
    const { PostgresActivityRepository } = await import('./postgres/PostgresActivityRepository.js');
    const { PostgresAttendanceRepository } = await import('./postgres/PostgresAttendanceRepository.js');
    const { PostgresInvitationRepository } = await import('./postgres/PostgresInvitationRepository.js');
    return {
      users: new PostgresUserRepository(inst.pool, organizationId, { codePrefix }),
      activities: new PostgresActivityRepository(inst.pool, organizationId),
      attendance: new PostgresAttendanceRepository(inst.pool, organizationId),
      invitations: new PostgresInvitationRepository(inst.pool, organizationId),
      pool: inst.pool,
      driver: 'postgres',
      organizationId,
      codePrefix,
      persist: () => {},
      persistNow: async () => {},
    };
  }
}

/**
 * Compat layer: hasta Sprint 3, las rutas siguen usando un "repos" singleton
 * hardcodeado al CCB. En Sprint 3 lo reemplazamos por middleware tenantRepos
 * que crea `req.repos` por request.
 */
export async function getRepositories() {
  return createTenantRepos(CCB_ORG_ID);
}

export { CCB_ORG_ID };
