// scripts/release/lib/evidence.mjs · escritura de evidence post-deploy.
// Dos formatos: manifest.json (machine-readable, indexable) + summary.md
// (humano-legible para pegar en ticket o canal de Slack).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function createEvidenceDir(root, runId) {
  const dir = path.join(root, runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeManifest(dir, data) {
  const file = path.join(dir, 'manifest.json');
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  return file;
}

export async function writeSummary(dir, data) {
  const file = path.join(dir, 'summary.md');
  const md = renderSummary(data);
  await writeFile(file, md);
  return file;
}

export async function writeRawArtifact(dir, name, content) {
  const file = path.join(dir, name);
  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n';
  await writeFile(file, body);
  return file;
}

function renderSummary({
  runId,
  branch,
  expectedSha,
  outcome,
  durationMs,
  phases = {},
  errorMessage,
}) {
  const status = outcome === 'success' ? '✅ SUCCESS' : `❌ FAILED (${outcome})`;
  const lines = [
    `# Deploy ${runId}`,
    '',
    `**Branch:** \`${branch}\``,
    `**Expected SHA:** \`${expectedSha ?? '(no capturado)'}\``,
    `**Resultado:** ${status}`,
    `**Duración total:** ${formatDuration(durationMs)}`,
    '',
    '## Fases',
    '',
  ];
  for (const [name, phase] of Object.entries(phases)) {
    const mark = phase.ok ? '✓' : '✗';
    const detail = phase.detail ? ` · ${phase.detail}` : '';
    const time = phase.durationMs != null ? ` (${formatDuration(phase.durationMs)})` : '';
    lines.push(`- ${mark} **${name}**${time}${detail}`);
  }
  if (errorMessage) {
    lines.push('', '## Error', '', '```', errorMessage, '```');
  }
  lines.push('');
  return lines.join('\n');
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m${String(r).padStart(2, '0')}s`;
}
