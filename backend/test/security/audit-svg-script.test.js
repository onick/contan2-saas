// =============================================================================
// test/security/audit-svg-script.test.js
// =============================================================================
// Tests del comportamiento fail-closed del script de inventario SVG.
// El script es la fuente de verdad pre-deploy para decidir si hay riesgo
// de XSS en el volumen de uploads; debe rechazar cualquier "no pude
// verificar" como exit 1 — nunca devolver "clean" cuando no leyó nada.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'audit-historical-svg.mjs');

function runAudit(args = []) {
  const res = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe('audit-historical-svg.mjs · fail-closed', () => {
  let workdir;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), 'audit-svg-test-'));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('exit 0 cuando el directorio existe y está vacío', () => {
    const { code, stdout } = runAudit(['--dir', workdir]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/sin SVG/);
  });

  it('exit 1 cuando el directorio NO existe (fail-closed)', () => {
    const ghost = path.join(workdir, 'does-not-exist');
    const { code, stderr } = runAudit(['--dir', ghost]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no existe|fail-closed/);
  });

  it('exit 1 cuando el path NO es directorio (es un archivo)', () => {
    const f = path.join(workdir, 'not-a-dir.txt');
    writeFileSync(f, 'foo');
    const { code, stderr } = runAudit(['--dir', f]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no es directorio|fail-closed/);
  });

  it('exit 10 cuando hay SVG inocuo (sin flags)', () => {
    writeFileSync(path.join(workdir, 'safe.svg'), '<svg><circle r="1"/></svg>');
    const { code } = runAudit(['--dir', workdir]);
    expect(code).toBe(10);
  });

  it('exit 20 cuando hay SVG con <script>', () => {
    writeFileSync(
      path.join(workdir, 'evil.svg'),
      '<svg><script>alert(1)</script></svg>',
    );
    const { code, stdout } = runAudit(['--dir', workdir]);
    expect(code).toBe(20);
    expect(stdout).toMatch(/script_tag/);
    expect(stdout).toMatch(/BLOQUEAR DEPLOY/);
  });

  it('exit 20 cuando hay SVG con handler on*', () => {
    writeFileSync(
      path.join(workdir, 'evil2.svg'),
      '<svg><a onclick="alert(1)"><circle/></a></svg>',
    );
    const { code } = runAudit(['--dir', workdir]);
    expect(code).toBe(20);
  });

  it('exit 20 cuando hay SVG con javascript: URI', () => {
    writeFileSync(
      path.join(workdir, 'evil3.svg'),
      '<svg><a href="javascript:alert(1)"><circle/></a></svg>',
    );
    const { code } = runAudit(['--dir', workdir]);
    expect(code).toBe(20);
  });

  it('exit 20 cuando hay SVG en subdirectorio recursivo', () => {
    const sub = path.join(workdir, 'nested', 'deep');
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(sub, 'evil.svg'), '<svg><script/></svg>');
    const { code } = runAudit(['--dir', workdir]);
    expect(code).toBe(20);
  });

  it('--json emite JSON parseable con la estructura esperada', () => {
    writeFileSync(
      path.join(workdir, 'evil.svg'),
      '<svg><script>x</script></svg>',
    );
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.dir).toBe(workdir);
    expect(report.total).toBe(1);
    expect(report.withRiskFlags).toBe(1);
    expect(Array.isArray(report.entries)).toBe(true);
    expect(report.entries[0].flags).toContain('script_tag');
  });
});
