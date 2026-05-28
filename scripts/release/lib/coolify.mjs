// scripts/release/lib/coolify.mjs · wrapper de la Coolify v4 API.
// Nunca loguea el token; lo recibe como argumento y lo usa sólo en headers.

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Valida que el token + app uuid funcionan ANTES de hacer cualquier write.
 * Si el token está mal o el uuid no existe, abort temprano.
 */
export async function verifyCredentials({ baseUrl, token, appUuid }) {
  const url = `${baseUrl}/api/v1/applications/${appUuid}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 401) {
    const err = new Error('Coolify · 401 token inválido o expirado');
    err.exitCode = 2;
    throw err;
  }
  if (res.status === 404) {
    const err = new Error(`Coolify · 404 application '${appUuid}' no encontrada`);
    err.exitCode = 2;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Coolify · GET application devolvió ${res.status}`);
    err.exitCode = 1;
    throw err;
  }
  return true;
}

export async function triggerDeploy({ baseUrl, token, appUuid, force = false }) {
  const url = `${baseUrl}/api/v1/deploy?uuid=${appUuid}&force=${force}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`Coolify · trigger deploy devolvió ${res.status}: ${txt}`);
    err.exitCode = 8;
    throw err;
  }
  const data = await res.json();
  const deploymentUuid = data?.deployments?.[0]?.deployment_uuid;
  if (!deploymentUuid) {
    const err = new Error(`Coolify · respuesta sin deployment_uuid: ${JSON.stringify(data)}`);
    err.exitCode = 8;
    throw err;
  }
  return { deploymentUuid, raw: data };
}

const TERMINAL_STATES = new Set(['finished', 'failed', 'cancelled']);

export async function pollDeployment({
  baseUrl,
  token,
  deploymentUuid,
  intervalMs = 8000,
  timeoutMs = 300000,
  onTick = () => {},
}) {
  const url = `${baseUrl}/api/v1/deployments/${deploymentUuid}`;
  const start = Date.now();
  while (true) {
    const res = await fetch(url, { headers: authHeaders(token) });
    if (!res.ok) {
      const err = new Error(`Coolify · poll devolvió ${res.status}`);
      err.exitCode = 8;
      throw err;
    }
    const data = await res.json();
    const status = Array.isArray(data) ? data[0]?.status : data?.status;
    onTick(status);
    if (TERMINAL_STATES.has(status)) {
      if (status !== 'finished') {
        const err = new Error(`Deployment terminó con status='${status}'`);
        err.exitCode = 8;
        err.finalStatus = status;
        throw err;
      }
      return { status, durationMs: Date.now() - start, raw: data };
    }
    if (Date.now() - start > timeoutMs) {
      const err = new Error(
        `Deployment no llegó a estado terminal en ${timeoutMs}ms (último status='${status}')`,
      );
      err.exitCode = 8;
      throw err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
