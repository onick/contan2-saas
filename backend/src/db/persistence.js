import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const TMP_FILE = path.join(DATA_DIR, 'db.json.tmp');
const SCHEMA_VERSION = 1;

export async function loadSnapshot() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      version: parsed.version ?? 1,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
    };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    console.error('[persistence] error leyendo snapshot:', e.message);
    return null;
  }
}

export async function writeSnapshot(snapshot) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    users: snapshot.users,
    activities: snapshot.activities,
    attendance: snapshot.attendance,
  };
  await fs.writeFile(TMP_FILE, JSON.stringify(payload), 'utf8');
  await fs.rename(TMP_FILE, DATA_FILE);
}

export function createScheduler(getSnapshot, { debounceMs = 500 } = {}) {
  let timer = null;
  let pendingPromise = null;
  let writingPromise = null;

  async function flush() {
    timer = null;
    const snap = getSnapshot();
    writingPromise = writeSnapshot(snap).catch(e => {
      console.error('[persistence] error guardando:', e.message);
    });
    await writingPromise;
    writingPromise = null;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
    if (!pendingPromise) {
      pendingPromise = new Promise(resolve => {
        const check = setInterval(() => {
          if (!timer && !writingPromise) {
            clearInterval(check);
            pendingPromise = null;
            resolve();
          }
        }, 50);
      });
    }
    return pendingPromise;
  }

  async function flushNow() {
    if (timer) {
      clearTimeout(timer);
      await flush();
    }
    if (writingPromise) await writingPromise;
  }

  return { schedule, flushNow };
}
