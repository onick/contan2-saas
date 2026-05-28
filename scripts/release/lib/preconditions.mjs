// scripts/release/lib/preconditions.mjs · checks que corren ANTES de tocar
// la red. Si cualquiera falla, abortamos con exitCode preciso para que el
// caller distinga "dirty tree" de "wrong branch" sin parsear stderr.

import { spawn } from 'node:child_process';

function execCapture(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, shell: false });
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

export async function checkWorkingTreeClean() {
  const { code, stdout } = await execCapture('git', ['status', '--porcelain']);
  if (code !== 0) {
    const err = new Error('git status falló');
    err.exitCode = 1;
    throw err;
  }
  if (stdout.length > 0) {
    const err = new Error(
      `Working tree no está limpio. Cambios pendientes:\n${stdout}`,
    );
    err.exitCode = 3;
    throw err;
  }
}

export async function checkCurrentBranch(expected) {
  const { stdout: current } = await execCapture('git', ['branch', '--show-current']);
  if (current !== expected) {
    const err = new Error(
      `Branch actual es '${current}', se esperaba '${expected}'. Cambiá con: git checkout ${expected}`,
    );
    err.exitCode = 4;
    throw err;
  }
  return current;
}

export async function captureSha() {
  const { stdout } = await execCapture('git', ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(stdout)) {
    const err = new Error(`SHA inválido devuelto por git: ${stdout}`);
    err.exitCode = 1;
    throw err;
  }
  return stdout;
}

/**
 * Devuelve { ahead, behind } respecto a origin/<branch>. Si el remote-tracking
 * no existe (rama nueva), ambos serán null.
 */
export async function checkAheadBehind(branch) {
  await execCapture('git', ['fetch', 'origin', branch, '--quiet']).catch(() => {});
  const { code, stdout } = await execCapture('git', [
    'rev-list', '--left-right', '--count', `${branch}...origin/${branch}`,
  ]);
  if (code !== 0) return { ahead: null, behind: null };
  const [ahead, behind] = stdout.split(/\s+/).map((n) => Number(n));
  return { ahead, behind };
}

export async function runTests(testCommand, opts = {}) {
  const { stdoutOnSuccess = false } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', testCommand], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        if (stdoutOnSuccess) console.log('  ✓ tests pasaron');
        resolve();
      } else {
        const err = new Error(`Tests fallaron (exit ${code})`);
        err.exitCode = 5;
        reject(err);
      }
    });
  });
}

export async function gitPush(branch) {
  const { code, stdout, stderr } = await execCapture(
    'git', ['push', 'origin', branch],
  );
  if (code !== 0) {
    const err = new Error(`git push falló:\n${stderr || stdout}`);
    err.exitCode = 6;
    throw err;
  }
  return stdout || stderr;
}

/**
 * Devuelve el SHA actual del head remoto de la branch indicada, sin compararlo
 * con nada. Útil para --verify-only, donde el operador no necesita estar
 * parado en la branch ni con working tree limpio — queremos certificar el
 * deploy que YA existe contra lo que vive en `origin/<branch>`.
 */
export async function getRemoteSha(branch) {
  const { code, stdout, stderr } = await execCapture('git', [
    'ls-remote', 'origin', `refs/heads/${branch}`,
  ]);
  if (code !== 0) {
    const err = new Error(`git ls-remote falló: ${stderr || stdout}`);
    err.exitCode = 6;
    throw err;
  }
  const remoteSha = stdout.split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(remoteSha)) {
    const err = new Error(
      `No se pudo resolver origin/${branch}: ` +
      `${stdout || '(respuesta vacía — ¿la branch existe en origin?)'}`,
    );
    err.exitCode = 6;
    throw err;
  }
  return remoteSha;
}

export async function verifyRemoteSha(branch, expectedSha) {
  const remoteSha = await getRemoteSha(branch);
  if (remoteSha !== expectedSha) {
    const err = new Error(
      `Remote SHA mismatch:\n  esperado: ${expectedSha}\n  remoto:   ${remoteSha}`,
    );
    err.exitCode = 6;
    throw err;
  }
  return remoteSha;
}
