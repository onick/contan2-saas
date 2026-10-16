#!/usr/bin/env bash
# scripts/landing/lighthouse.sh · Lighthouse 12, 5 corridas, mediana (mobile
# simulado + desktop). NO se ejecuta en CI; lo corre el integrador contra
# staging/prod o contra `next start` local.
#
#   scripts/landing/lighthouse.sh https://stg.contan2.com/ [salida_dir]
#
# Objetivos: LCP <= 1500 ms, CLS <= 0.01, TBT <= 50 ms, server-response-time
# <= 300 ms, performance >= 0.95, accessibility 1.0, seo 1.0.
set -euo pipefail

URL="${1:?uso: lighthouse.sh <url> [salida_dir]}"
OUT="${2:-./lighthouse-out}"
RUNS=5
mkdir -p "$OUT"

for preset in mobile desktop; do
  for i in $(seq 1 "$RUNS"); do
    extra=()
    [ "$preset" = "desktop" ] && extra=(--preset=desktop)
    # ${extra[@]+…}: bash 3.2 (macOS) + set -u fallan con un array vacío.
    npx -y lighthouse@12 "$URL" ${extra[@]+"${extra[@]}"} \
      --only-categories=performance,accessibility,seo \
      --output=json --output-path="$OUT/$preset-$i.json" \
      --chrome-flags="--headless=new --no-sandbox ${LH_CHROME_FLAGS:-}" --quiet
  done
done

node --input-type=module - "$OUT" <<'EOF'
import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const preset of ['mobile', 'desktop']) {
  const runs = readdirSync(dir).filter((f) => f.startsWith(preset + '-') && f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
  const pick = (fn) => median(runs.map(fn));
  console.log(preset, JSON.stringify({
    runs: runs.length,
    performance: pick((r) => r.categories.performance.score),
    accessibility: pick((r) => r.categories.accessibility.score),
    seo: pick((r) => r.categories.seo.score),
    lcp_ms: Math.round(pick((r) => r.audits['largest-contentful-paint'].numericValue)),
    cls: Number(pick((r) => r.audits['cumulative-layout-shift'].numericValue).toFixed(4)),
    tbt_ms: Math.round(pick((r) => r.audits['total-blocking-time'].numericValue)),
    server_response_ms: Math.round(pick((r) => r.audits['server-response-time'].numericValue)),
  }));
}
EOF
