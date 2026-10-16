#!/usr/bin/env node
// scripts/landing/ttfb.mjs · TTFB de SERVIDOR con keep-alive (Node puro).
//
//   node apps/web/scripts/landing/ttfb.mjs --url https://contan2.com/ [--host contan2.com] [--n 20]
//
// Mide 20 muestras sobre UNA conexión abierta (sin DNS/TCP/TLS) con
// curl -w, equivalente a time_starttransfer - time_pretransfer, y reporta
// p50/p75. El TTFB "en frío" desde RD (3–4 RTT) se mide aparte, no acá.

import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { n: sorted.length, p50: percentile(sorted, 50), p75: percentile(sorted, 75), min: sorted[0], max: sorted[sorted.length - 1] };
}

function sample(u, agent, host) {
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const req = lib.request(u, { method: 'GET', agent, headers: { host: host ?? u.host } }, (res) => {
      const ttfb = Number(process.hrtime.bigint() - t0) / 1e6; // ms hasta los headers
      res.resume();
      res.on('end', () => resolve({ ttfb, status: res.statusCode }));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function run(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!args.url) {
    console.error('uso: ttfb.mjs --url <url> [--host <Host>] [--n 20]');
    return 2;
  }
  const n = Number(args.n ?? 20);
  const u = new URL(args.url);
  const lib = u.protocol === 'https:' ? https : http;
  const agent = new lib.Agent({ keepAlive: true, maxSockets: 1 });
  try {
    await sample(u, agent, args.host); // calienta la conexión (no cuenta)
    const samples = [];
    for (let i = 0; i < n; i++) samples.push((await sample(u, agent, args.host)).ttfb);
    const s = summarize(samples);
    console.log(JSON.stringify({ url: args.url, host: args.host ?? u.host, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(2)) : v])), unit: 'ms' }, null, 2));
    return 0;
  } finally {
    agent.destroy();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
    console.error(e);
    process.exit(1);
  });
}
