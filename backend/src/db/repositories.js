import { config } from '../config.js';
import { MemoryUserRepository } from './memoryUserRepository.js';
import { MemoryActivityRepository } from './memoryActivityRepository.js';
import { MemoryAttendanceRepository } from './memoryAttendanceRepository.js';
import { loadSnapshot, createScheduler } from './persistence.js';

let instance = null;

export async function getRepositories() {
  if (instance) return instance;

  if (config.DB_DRIVER === 'memory') {
    instance = {
      users: new MemoryUserRepository(),
      activities: new MemoryActivityRepository(),
      attendance: new MemoryAttendanceRepository(),
    };

    const snapshot = await loadSnapshot();
    if (snapshot) {
      instance.users.hydrate(snapshot.users);
      instance.activities.hydrate(snapshot.activities);
      instance.attendance.hydrate(snapshot.attendance);
      console.log(
        `[persistence] cargado: ${snapshot.users.length} usuarios, ${snapshot.activities.length} actividades, ${snapshot.attendance.length} asistencias`,
      );
    } else {
      console.log('[persistence] sin snapshot previo, iniciando vacío');
    }

    const scheduler = createScheduler(() => ({
      users: instance.users.dump(),
      activities: instance.activities.dump(),
      attendance: instance.attendance.dump(),
    }));
    instance.persist = () => scheduler.schedule();
    instance.persistNow = () => scheduler.flushNow();
    instance.driver = 'memory';
  } else if (config.DB_DRIVER === 'postgres') {
    const { getPool, applySchema } = await import('./postgres/pool.js');
    const { PostgresUserRepository } = await import('./postgres/PostgresUserRepository.js');
    const { PostgresActivityRepository } = await import('./postgres/PostgresActivityRepository.js');
    const { PostgresAttendanceRepository } = await import('./postgres/PostgresAttendanceRepository.js');

    const pool = getPool();
    await applySchema();

    instance = {
      users: new PostgresUserRepository(pool),
      activities: new PostgresActivityRepository(pool),
      attendance: new PostgresAttendanceRepository(pool),
    };
    instance.persist = () => {};
    instance.persistNow = async () => {};
    instance.driver = 'postgres';

    const total = await instance.users.count();
    const totalAct = await instance.activities.count();
    console.log(`[postgres] conectado · ${total} usuarios · ${totalAct} actividades`);
  } else {
    throw new Error(`DB_DRIVER no soportado: ${config.DB_DRIVER}`);
  }

  return instance;
}
