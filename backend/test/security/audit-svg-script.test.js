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
    expect(report.svgByContent).toBe(1);
    expect(report.withRiskFlags).toBe(1);
    expect(Array.isArray(report.entries)).toBe(true);
    expect(report.entries[0].flags).toContain('script_tag');
  });

  // ===========================================================================
  // Detección por contenido (no por extensión)
  // ===========================================================================
  // Un SVG malicioso renombrado a `logo.png` se sirve igual con Content-Type
  // image/png por el middleware estático; el sniffer del navegador puede
  // re-interpretarlo. Defensa en profundidad: el inventario debe identificarlo.

  it('detecta SVG con extensión .png (renombrado malicioso)', () => {
    writeFileSync(
      path.join(workdir, 'logo.png'),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="1"/></svg>',
    );
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgByContent).toBe(1);
    expect(report.entries[0].extension).toBe('.png');
    expect(report.entries[0].flags).toContain('script_tag');
    expect(report.entries[0].flags).toContain('wrong_extension');
  });

  it('detecta SVG con extensión .jpg (renombrado malicioso)', () => {
    writeFileSync(
      path.join(workdir, 'avatar.jpg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>',
    );
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgByContent).toBe(1);
    expect(report.entries[0].extension).toBe('.jpg');
    expect(report.entries[0].flags).toEqual(
      expect.arrayContaining(['foreign_object', 'javascript_uri', 'wrong_extension']),
    );
  });

  it('detecta SVG precedido por declaración <?xml ?>', () => {
    writeFileSync(
      path.join(workdir, 'hero.png'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>',
    );
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    // Sin payload malicioso pero igual SVG-por-contenido con extensión incorrecta
    // → flag `wrong_extension` ⇒ exit 20.
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgByContent).toBe(1);
    expect(report.entries[0].flags).toContain('wrong_extension');
  });

  it('NO marca como SVG un PNG real (8 bytes signature + IHDR)', () => {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A + IHDR chunk header
    const png = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    ]);
    writeFileSync(path.join(workdir, 'real.png'), png);
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.scannedFiles).toBe(1);
    expect(report.svgByContent).toBe(0);
  });

  it('NO marca como SVG un JPEG real (firma SOI)', () => {
    // JPEG SOI: FF D8 FF E0
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    writeFileSync(path.join(workdir, 'real.jpg'), jpeg);
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.svgByContent).toBe(0);
  });

  it('SVG con extensión .svg sin payload → exit 10 sin wrong_extension', () => {
    writeFileSync(path.join(workdir, 'ok.svg'), '<svg><circle r="1"/></svg>');
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(10);
    const report = JSON.parse(stdout);
    expect(report.svgByContent).toBe(1);
    expect(report.entries[0].flags).not.toContain('wrong_extension');
  });
});
