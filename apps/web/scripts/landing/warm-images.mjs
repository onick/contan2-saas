#!/usr/bin/env node
// scripts/landing/warm-images.mjs · precalienta /_next/image tras un deploy.
// El cache de .next/cache/images se pierde en cada deploy; sin esto la primera
// visita paga la conversión AVIF. Node puro.
//
//   node apps/web/scripts/landing/warm-images.mjs --url https://contan2.com/ [--host contan2.com]
//
// Lee el HTML de la landing, toma cada <img src="/_next/image?..."> y cada URL
// de su srcset (todos los anchos), y las pide con Accept: image/avif.

import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

/** URLs de /_next/image (src + srcset) presentes en el HTML, sin duplicados. */
export function extractImageUrls(html) {
  const urls = new Set();
  const decode = (s) => s.replace(/&amp;/g, '&');
  for (const m of html.matchAll(/\s(?:src|srcset|imagesrcset)\s*=\s*"([^"]*)"/gi)) {
    for (const part of (m[1] ?? '').split(',')) {
      const candidate = decode(part.trim().split(/\s+/)[0] ?? '');
      if (candidate.startsWith('/_next/image')) urls.add(candidate);
    }
  }
  return [...urls];
}

function get(urlStr, host, accept) {
  const u = new URL(urlStr);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(u, { method: 'GET', headers: { host: host ?? u.host, accept } }, (res) => {
      let bytes = 0;
      res.on('data', (c) => (bytes += c.length));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'], bytes }));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function run(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!args.url) {
    console.error('uso: warm-images.mjs --url <url de la landing> [--host <Host>]');
    return 2;
  }
  const page = await new Promise((resolve, reject) => {
    const u = new URL(args.url);
    const lib = u.protocol === 'https:' ? https : http;
    lib.get(u, { headers: { host: args.host ?? u.host } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
  const urls = extractImageUrls(page);
  let failed = 0;
  for (const rel of urls) {
    const r = await get(new URL(rel, args.url).toString(), args.host, 'image/avif,image/webp,*/*');
    const ok = r.status === 200;
    if (!ok) failed++;
    console.log(`${ok ? 'ok ' : 'ERR'} ${r.status} ${r.type ?? '-'} ${r.bytes}B ${rel}`);
  }
  console.log(`${urls.length} imágenes, ${failed} con error`);
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
    console.error(e);
    process.exit(1);
  });
}
