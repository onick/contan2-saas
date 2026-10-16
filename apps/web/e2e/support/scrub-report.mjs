#!/usr/bin/env node
// scrub-report.mjs · deja el reporte JSON de Playwright sin PII para subirlo como artefacto de CI.
// Misma logica que support/mask.ts (maskEmail + scrubPII): emails -> j***@d***.com, telefonos -> ***-***-****.
// Ademas borra videos, trazas y screenshots de test-results (en CI ya van apagados con E2E_NO_MEDIA=1).
//   node apps/web/e2e/support/scrub-report.mjs        (desde la raiz del repo o desde apps/web)
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(e2eDir, '.artifacts', 'report.json');
const out = path.join(e2eDir, '.artifacts', 'report.scrubbed.json');

function maskEmail(email) {
  const m = /^([^@])[^@]*@([^.])[^.]*(\..+)$/.exec(email.trim());
  return m ? `${m[1]}***@${m[2]}***${m[3]}` : '***';
}
function scrub(text) {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (e) => maskEmail(e))
    .replace(/\b\d{3}[-\s.]?\d{3}[-\s.]?\d{4}\b/g, '***-***-****');
}

if (existsSync(src)) {
  writeFileSync(out, scrub(readFileSync(src, 'utf8')));
  console.log(`[scrub] ${path.relative(process.cwd(), out)} escrito (emails/telefonos enmascarados).`);
} else {
  console.log('[scrub] no hay report.json (la corrida no llego a escribirlo).');
}

// Medios: nada que pueda contener datos reales sale de aqui.
const results = path.resolve(e2eDir, '..', 'test-results');
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(webm|mp4|zip|png|jpe?g)$/i.test(name)) rmSync(p, { force: true });
  }
}
walk(results);
