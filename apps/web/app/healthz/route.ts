// app/healthz/route.ts · liveness público del proceso Next.js (web-v2).
// No toca DB ni api-v2: sólo confirma que el server responde. El gate A.5 de
// release (scripts/release) lo usa como PUBLIC_HEALTHZ_URL; necesita HTTP 200.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    service: 'web',
    ts: new Date().toISOString(),
    buildSha: process.env.BUILD_SHA ?? 'unknown',
  });
}
