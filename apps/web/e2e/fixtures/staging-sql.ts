// fixtures/staging-sql.ts · lectura SELECT-only de la DB de staging por SSH (p.ej. tokens RSVP).
// Guardas: solo SELECT, una sentencia, sin palabras de escritura. Sin shell local (execFile).
// Requiere E2E_SSH_HOST, E2E_SSH_KEY, E2E_DB_CONTAINER. Staging, nunca prod.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../env';

const run = promisify(execFile);

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|vacuum|set|reset|lock|comment|merge)\b/i;

export function assertSelectOnly(sql: string): string {
  const s = sql.trim().replace(/;+\s*$/, '');
  if (!/^select\b/i.test(s)) throw new Error('staging-sql: solo se permite SELECT.');
  if (s.includes(';')) throw new Error('staging-sql: una sola sentencia.');
  if (FORBIDDEN.test(s)) throw new Error('staging-sql: palabra de escritura no permitida.');
  return s;
}

export function stagingSqlConfigured(): boolean {
  return Boolean(env('E2E_SSH_HOST') && env('E2E_SSH_KEY') && env('E2E_DB_CONTAINER'));
}

/** Devuelve filas como arrays de columnas (psql -At, separador '|'). */
export async function stagingSelect(sql: string): Promise<string[][]> {
  if (!stagingSqlConfigured()) throw new Error('staging-sql: faltan E2E_SSH_HOST/E2E_SSH_KEY/E2E_DB_CONTAINER.');
  const q = assertSelectOnly(sql);
  const container = env('E2E_DB_CONTAINER');
  if (!/^[a-z0-9_.-]+$/i.test(container)) throw new Error('staging-sql: E2E_DB_CONTAINER invalido.');
  // ssh concatena los args en un shell remoto: la SQL va entre comillas simples escapadas.
  const quoted = `'${q.replace(/'/g, `'\\''`)}'`;
  const remote = `docker exec -i ${container} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c ${quoted}`;
  const { stdout } = await run(
    'ssh',
    ['-i', env('E2E_SSH_KEY'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', `root@${env('E2E_SSH_HOST')}`, remote],
    { timeout: 30_000 },
  );
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('|'));
}
