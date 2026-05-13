import { config } from '../config.js';
import { MemoryUserRepository } from './memoryUserRepository.js';
import { MemoryActivityRepository } from './memoryActivityRepository.js';
import { MemoryAttendanceRepository } from './memoryAttendanceRepository.js';
import { loadSnapshot, createScheduler } from './persistence.js';

let instance = null;
let scheduler = null;

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

    scheduler = createScheduler(() => ({
      users: instance.users.dump(),
      activities: instance.activities.dump(),
      attendance: instance.attendance.dump(),
    }));
    instance.persist = () => scheduler.schedule();
    instance.persistNow = () => scheduler.flushNow();
    instance.hasSnapshot = snapshot !== null;
  } else {
    throw new Error(`DB_DRIVER no soportado: ${config.DB_DRIVER}`);
  }
  return instance;
}
