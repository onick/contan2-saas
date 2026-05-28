// scripts/release/lib/a5-verify.mjs · verificación dual del SHA desplegado.
// A.5 = "deployment certified": el container vivo en prod realmente contiene
// el commit que pusheamos. Dos checks ortogonales: endpoint público + OCI
// label vía SSH al VPS.

import { spawn } from 'node:child_process';

function execCapture(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export async function waitHealthz(url, { intervalMs = 3000, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  while (true) {
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        const body = await res.json().catch(() => ({}));
        return { ok: true, durationMs: Date.now() - start, body };
      }
    } catch {
      // network blip; retry until timeout
    }
    if (Date.now() - start > timeoutMs) {
      const err = new Error(`Healthcheck ${url} no respondió 200 en ${timeoutMs}ms`);
      err.exitCode = 9;
      throw err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function verifyVersionEndpoint(url, expectedSha) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`${url} devolvió ${res.status}`);
    err.exitCode = 7;
    throw err;
  }
  const data = await res.json();
  const buildSha = data?.buildSha;
  if (!buildSha) {
    const err = new Error(`${url} no devolvió .buildSha: ${JSON.stringify(data)}`);
    err.exitCode = 7;
    throw err;
  }
  if (buildSha !== expectedSha) {
    const err = new Error(
      `A.5 lado 1 mismatch: /api/version.buildSha='${buildSha}' esperado='${expectedSha}'`,
    );
    err.exitCode = 7;
    err.observed = buildSha;
    err.expected = expectedSha;
    throw err;
  }
  return { buildSha, raw: data };
}

// Allowlist estricta para nombres y prefijos de container. Cualquier char
// fuera de [a-zA-Z0-9_.-] convierte el SSH en ejecución remota arbitraria
// porque los pasamos como parte del string que el shell remoto evalúa.
// Esta regex es deliberadamente más restrictiva que lo que docker acepta —
// el deploy real usa nombres que siempre matchean este patrón.
const SAFE_CONTAINER_RE = /^[a-zA-Z0-9_.-]+$/;

function assertSafeContainerToken(name, kind) {
  if (typeof name !== 'string' || !SAFE_CONTAINER_RE.test(name)) {
    const err = new Error(
      `${kind} inválido (esperado /^[a-zA-Z0-9_.-]+$/): ${JSON.stringify(name)}`,
    );
    err.exitCode = 10;
    throw err;
  }
}

/**
 * SSH al VPS, encuentra el container por prefijo, inspecciona el label OCI
 * org.opencontainers.image.revision. El label viene del SOURCE_COMMIT pasado
 * al docker build por Coolify (Application Settings → Include Source Commit).
 *
 * Hardening:
 *   - containerPrefix se valida con allowlist antes de armar el comando
 *     remoto. Sin esa validación, un `.env.release` mal copiado con
 *     `CONTAINER_NAME_PREFIX="; rm -rf /"` ejecutaría rm en el VPS.
 *   - containerName devuelto por la primera SSH se re-valida con la misma
 *     allowlist antes de pasarlo a `docker inspect`. Defensa contra un
 *     `docker ps` adversario que devuelva nombres maliciosos.
 */
export async function verifyOciLabel({
  sshHost,
  sshKeyPath,
  containerPrefix,
  expectedSha,
}) {
  assertSafeContainerToken(containerPrefix, 'CONTAINER_NAME_PREFIX');

  const sshArgs = ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
  if (sshKeyPath) sshArgs.push('-i', sshKeyPath);
  sshArgs.push(sshHost);

  // Step 1: encontrar el container por prefijo. `containerPrefix` ya pasó
  // el allowlist arriba, por eso es seguro interpolarlo en el comando shell.
  const findCmd = `docker ps --format '{{.Names}}' | grep '^${containerPrefix}' | head -1`;
  const findRes = await execCapture('ssh', [...sshArgs, findCmd]);
  if (findRes.code !== 0) {
    const err = new Error(
      `SSH a ${sshHost} falló: ${findRes.stderr || findRes.stdout}`,
    );
    err.exitCode = 10;
    throw err;
  }
  const containerName = findRes.stdout;
  if (!containerName) {
    const err = new Error(
      `Sin container que matchee prefijo '${containerPrefix}' en ${sshHost}`,
    );
    err.exitCode = 10;
    throw err;
  }
  assertSafeContainerToken(containerName, 'containerName (de docker ps)');

  // Step 2: leer el label OCI. containerName re-validado arriba.
  const inspectCmd = `docker inspect ${containerName} --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'`;
  const inspectRes = await execCapture('ssh', [...sshArgs, inspectCmd]);
  if (inspectRes.code !== 0) {
    const err = new Error(`docker inspect falló: ${inspectRes.stderr}`);
    err.exitCode = 10;
    throw err;
  }
  const ociRevision = inspectRes.stdout.trim();
  if (ociRevision !== expectedSha) {
    const err = new Error(
      `A.5 lado 2 mismatch: OCI label='${ociRevision}' esperado='${expectedSha}'`,
    );
    err.exitCode = 7;
    err.observed = ociRevision;
    err.expected = expectedSha;
    err.containerName = containerName;
    throw err;
  }
  return { containerName, ociRevision };
}

/**
 * Sanity check de SSH sin tocar docker. Útil en preconditions para abortar
 * antes del push si el VPS no es alcanzable.
 */
export async function checkSshReachable({ sshHost, sshKeyPath }) {
  const args = ['-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes'];
  if (sshKeyPath) args.push('-i', sshKeyPath);
  args.push(sshHost, 'true');
  const res = await execCapture('ssh', args);
  if (res.code !== 0) {
    const err = new Error(
      `SSH no alcanza ${sshHost} (necesario para A.5 lado 2). Verificá ~/.ssh/config o SSH_KEY_PATH.`,
    );
    err.exitCode = 10;
    throw err;
  }
  return true;
}
