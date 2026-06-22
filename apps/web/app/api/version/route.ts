// app/api/version/route.ts · build vivo del bundle web-v2. El gate A.5
// (scripts/release/lib/a5-verify.mjs) compara data.buildSha === EXPECTED_SHA
// para certificar el deploy. Si BUILD_SHA no está seteado (falta "Include
// Source Commit" en Coolify), responde 'unknown' y el gate aborta exit 7,
// forzando a arreglar el env antes de declarar éxito.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json({ buildSha: process.env.BUILD_SHA ?? 'unknown' });
}
