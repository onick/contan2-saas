// e2e/env.ts · carga minima de .env.e2e (sin dependencias) + helpers de entorno.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(E2E_DIR, '.auth');
export const ARTIFACTS_DIR = path.join(E2E_DIR, '.artifacts');

let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(E2E_DIR, '.env.e2e');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // El entorno real gana sobre el archivo.
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
  }
}
loadEnv();

export function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const BASE_URL = env('E2E_BASE_URL', 'https://ccb.stg.contan2.com').replace(/\/$/, '');
export const PLATFORM_URL = env('E2E_PLATFORM_URL', 'https://admin.stg.contan2.com').replace(/\/$/, '');
export const PROD_URL = env('E2E_PROD_URL', 'https://ccb.contan2.com').replace(/\/$/, '');

/** Aborta si la URL no es staging/local. Se llama en config, setup y fixtures de escritura. */
export function assertStaging(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`assertStaging: URL invalida (${url})`);
  }
  const ok = host === 'localhost' || host === '127.0.0.1' || /(^|\.)stg\.contan2\.com$/.test(host);
  if (!ok) {
    throw new Error(
      `assertStaging: ${host} NO es staging. Las escrituras/logins solo corren contra *.stg.contan2.com o localhost.`,
    );
  }
}

/** Invocacion apuntada SOLO al proyecto prod-readonly (no hay login ni setup). */
export function onlyProdReadonly(argv: string[] = process.argv): boolean {
  const projects: string[] = [];
  argv.forEach((a, i) => {
    if (a.startsWith('--project=')) projects.push(a.slice('--project='.length));
    else if (a === '--project' && argv[i + 1]) projects.push(argv[i + 1]!);
  });
  return projects.length > 0 && projects.every((p) => p === 'prod-readonly');
}
