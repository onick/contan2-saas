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
    expect(stdout).toMatch(/sin candidatos SVG/);
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
    expect(report.svgCandidates).toBe(1);
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
    expect(report.svgCandidates).toBe(1);
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
    expect(report.svgCandidates).toBe(1);
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
    expect(report.svgCandidates).toBe(1);
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
    expect(report.svgCandidates).toBe(0);
  });

  it('NO marca como SVG un JPEG real (firma SOI)', () => {
    // JPEG SOI: FF D8 FF E0
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    writeFileSync(path.join(workdir, 'real.jpg'), jpeg);
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(0);
  });

  it('SVG con extensión .svg sin payload → exit 10 sin wrong_extension', () => {
    writeFileSync(path.join(workdir, 'ok.svg'), '<svg><circle r="1"/></svg>');
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(10);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].flags).not.toContain('wrong_extension');
  });

  // ===========================================================================
  // Bypass del sniff de 4 KiB (reportado en feedback)
  // ===========================================================================
  // Un SVG puede tener whitespace, comentarios o prólogo XML arbitrariamente
  // largos antes del elemento raíz. Si el detector solo lee los primeros
  // 4 KiB, el atacante esconde el payload pasado ese offset y bypasea el
  // inventario. Tests del fix: lectura completa con cap MAX_AUDIT_BYTES.

  it('.svg con 5000 espacios antes de <svg><script> → exit 20', () => {
    const padded = ' '.repeat(5000) + '<svg><script>alert(1)</script></svg>';
    writeFileSync(path.join(workdir, 'hidden.svg'), padded);
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].extension).toBe('.svg');
    expect(report.entries[0].flags).toContain('script_tag');
    // No es wrong_extension porque la extensión sí es .svg.
    expect(report.entries[0].flags).not.toContain('wrong_extension');
  });

  it('.png con comentario XML > 4096 bytes antes de SVG malicioso → exit 20 + wrong_extension', () => {
    const longComment = '<!-- ' + 'A'.repeat(4500) + ' -->';
    const payload = '<svg><script>alert(1)</script></svg>';
    writeFileSync(path.join(workdir, 'hidden.png'), longComment + payload);
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].extension).toBe('.png');
    expect(report.entries[0].flags).toEqual(
      expect.arrayContaining(['script_tag', 'wrong_extension']),
    );
  });

  it('.svg con prólogo XML/DOCTYPE largo pero sin payload → al menos exit 10', () => {
    // Prólogo permitido pero gigante (whitespace + XML decl + DOCTYPE).
    const prologue =
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      '<!-- ' + 'comentario muy largo '.repeat(300) + ' -->\n' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
      ' '.repeat(2000) + '\n';
    const body = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
    writeFileSync(path.join(workdir, 'big-prologue.svg'), prologue + body);
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    // Sin flags de riesgo → exit 10 (NUNCA 0: el archivo está reportado).
    expect(code).toBe(10);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].flags).toEqual([]); // sin flags pero entró al reporte
  });

  it('archivo raster grande (PNG válido > 8 KiB) → no falso positivo', () => {
    // Construimos un buffer que comience con PNG signature y contenga 16 KiB
    // de bytes binarios pseudoaleatorios (sin secuencia <svg).
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const filler = Buffer.alloc(16 * 1024);
    for (let i = 0; i < filler.length; i++) filler[i] = (i * 31) & 0xff;
    // Aseguramos que el byte literal '<svg' (0x3c 0x73 0x76 0x67) no aparece.
    // Reemplazamos cualquier ocurrencia accidental con 0xff.
    for (let i = 0; i < filler.length - 3; i++) {
      if (filler[i] === 0x3c && filler[i+1] === 0x73 && filler[i+2] === 0x76 && filler[i+3] === 0x67) {
        filler[i] = 0xff;
      }
    }
    writeFileSync(path.join(workdir, 'big-real.png'), Buffer.concat([sig, filler]));
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.scannedFiles).toBe(1);
    expect(report.svgCandidates).toBe(0);
  });

  it('.svg vacío → exit 20 con svg_extension_unverified (nunca silencioso)', () => {
    // El path estático sirve este archivo igual con Content-Type image/svg+xml;
    // un humano debe verificarlo aunque el sniffer no encuentre <svg.
    writeFileSync(path.join(workdir, 'empty.svg'), '');
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].flags).toContain('svg_extension_unverified');
  });

  // ===========================================================================
  // Bypass del cap de 16 MiB (reportado en feedback)
  // ===========================================================================
  // Si el archivo es > MAX_AUDIT_BYTES, leemos solo el prefijo. Un atacante
  // puede esconder el payload pasado el cap. La política fail-closed exige
  // que CUALQUIER archivo truncado entre al reporte con `truncated_audit`,
  // sin importar la extensión ni si encontramos <svg en el prefijo.
  //
  // Estas pruebas generan archivos > 16 MiB en memoria — son 20-50 MB de
  // I/O cada una; total ~1-2 s para las tres. Está dentro del hookTimeout.

  const CAP = 16 * 1024 * 1024;

  it('.png > 16 MiB con SVG malicioso DESPUÉS del cap → exit 20 + truncated_audit', () => {
    // Padding de espacios > CAP, luego el payload. La lectura corta antes
    // del payload; truncated=true, hasSvgElement=false en lo leído.
    const padding = Buffer.alloc(CAP + 1024, 0x20);
    const payload = Buffer.from('<svg><script>alert(1)</script></svg>');
    writeFileSync(path.join(workdir, 'large-hidden.png'), Buffer.concat([padding, payload]));
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].extension).toBe('.png');
    expect(report.entries[0].size).toBeGreaterThan(CAP);
    expect(report.entries[0].flags).toContain('truncated_audit');
    // Crítico: NO afirmamos wrong_extension — no pudimos ver el payload,
    // así que no podemos confirmar que el archivo sea SVG. Solo "no se
    // pudo auditar entero".
    expect(report.entries[0].flags).not.toContain('wrong_extension');
  });

  it('raster/no-SVG > 16 MiB → exit 20 + truncated_audit (revisión manual)', () => {
    // 16+ MiB de bytes que no contienen <svg en ningún lado. Aún así debe
    // entrar al reporte porque no pudimos verificar el archivo completo.
    const filler = Buffer.alloc(CAP + 4096);
    for (let i = 0; i < filler.length; i++) filler[i] = (i * 31) & 0xff;
    // Garantizar que la secuencia '<svg' (0x3c 0x73 0x76 0x67) no aparece
    // dentro del prefijo leído por el auditor (los primeros CAP bytes).
    for (let i = 0; i < CAP - 3; i++) {
      if (filler[i] === 0x3c && filler[i+1] === 0x73 && filler[i+2] === 0x76 && filler[i+3] === 0x67) {
        filler[i] = 0xff;
      }
    }
    writeFileSync(path.join(workdir, 'large-binary.bin'), filler);
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].flags).toEqual(['truncated_audit']);
    // Sin svg_extension_unverified (no es .svg), sin wrong_extension
    // (no detectamos <svg), solo truncated_audit.
    expect(report.entries[0].flags).not.toContain('wrong_extension');
    expect(report.entries[0].flags).not.toContain('svg_extension_unverified');
  });

  it('.svg > 16 MiB → exit 20 + truncated_audit', () => {
    // SVG legítimo pero con prólogo > 16 MiB. La lectura corta antes de
    // ver el <svg>; sin embargo, la política de extensión .svg lo incluye
    // siempre. Combinado con truncado: ambos flags.
    const padding = Buffer.alloc(CAP + 1024, 0x20);
    const body = Buffer.from('<svg><circle r="1"/></svg>');
    writeFileSync(path.join(workdir, 'huge.svg'), Buffer.concat([padding, body]));
    const { code, stdout } = runAudit(['--dir', workdir, '--json']);
    expect(code).toBe(20);
    const report = JSON.parse(stdout);
    expect(report.svgCandidates).toBe(1);
    expect(report.entries[0].extension).toBe('.svg');
    expect(report.entries[0].flags).toContain('truncated_audit');
    // No vimos <svg en los primeros 16 MiB; flag de estructura no verificada.
    expect(report.entries[0].flags).toContain('svg_extension_unverified');
  });
});
