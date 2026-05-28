#!/usr/bin/env node
// scripts/release/deploy-coolify.mjs
//
// Deploy controlado de la app `contan2-saas-app` a Coolify desde la línea
// de comandos del operador. Reemplaza el flujo "git push + esperar webhook
// + abrir Actions + abrir Coolify UI + chequear /healthz manualmente"
// por un único comando con evidencia archivada.
//
// Uso típico:
//   node scripts/release/deploy-coolify.mjs --branch multitenant
//   node scripts/release/deploy-coolify.mjs --branch multitenant --skip-tests
//   node scripts/release/deploy-coolify.mjs --branch multitenant --dry-run
//   node scripts/release/deploy-coolify.mjs --branch multitenant --verify-only
//
// Exit codes:
//   0  ok
//   1  generic error
//   2  env/credentials problem
//   3  working tree dirty
//   4  wrong branch
//   5  tests failed
//   6  push or remote SHA mismatch
//   7  A.5 dual mismatch (endpoint or OCI label)
//   8  coolify deploy failed/timed out
//   9  healthz timeout
//   10 SSH unreachable

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, validateEnv, maskToken } from './lib/env.mjs';
import {
  checkWorkingTreeClean,
  checkCurrentBranch,
  captureSha,
  checkAheadBehind,
  runTests,
  gitPush,
  verifyRemoteSha,
  getRemoteSha,
} from './lib/preconditions.mjs';
import {
  verifyCredentials,
  triggerDeploy,
  pollDeployment,
} from './lib/coolify.mjs';
import {
  waitHealthz,
  verifyVersionEndpoint,
  verifyOciLabel,
  checkSshReachable,
} from './lib/a5-verify.mjs';
import {
  createEvidenceDir,
  writeManifest,
  writeSummary,
  writeRawArtifact,
} from './lib/evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ------------------------------------------------------------
// CLI args
// ------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    branch: null,
    skipTests: false,
    dryRun: false,
    verifyOnly: false,
    envFile: '.env.release',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branch') args.branch = argv[++i];
    else if (a === '--skip-tests') args.skipTests = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--verify-only') args.verifyOnly = true;
    // NOTA: usamos `--env` y NO `--env-file` porque Node ≥20 intercepta
    // `--env-file` como flag propio (carga env vars antes del script) y
    // nunca llega a nuestro parser.
    else if (a === '--env') args.envFile = argv[++i];
    else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Argumento desconocido: ${a}`);
      printHelp();
      process.exit(1);
    }
  }
  if (!args.branch) {
    console.error('--branch es requerido');
    printHelp();
    process.exit(1);
  }
  return args;
}

function printHelp() {
  console.log(`
deploy-coolify.mjs · release controlado a Coolify

USO
  node scripts/release/deploy-coolify.mjs --branch <name> [opciones]

FLAGS
  --branch <name>      branch a deployar (requerido)
  --skip-tests         no correr TEST_COMMAND antes del push
  --dry-run            ejecutar pre-flight pero no push/deploy
  --verify-only        sólo A.5 dual contra el deploy actual (no push, no trigger)
  --env <path>         archivo de env (default: .env.release)
                       (no usar --env-file: Node lo intercepta antes del script)
  -h, --help           esta ayuda

ENV
  Ver .env.release.example para la lista completa.
  Nunca se imprime el valor de COOLIFY_API_TOKEN.
`);
}

// ------------------------------------------------------------
// Logging helpers
// ------------------------------------------------------------

const log = {
  phase(name) { console.log(`\n[${ts()}] FASE ${name}`); },
  step(line)  { console.log(`  ${line}`); },
  ok(line)    { console.log(`  ✓ ${line}`); },
  warn(line)  { console.log(`  ⚠ ${line}`); },
  fail(line)  { console.error(`  ✗ ${line}`); },
};

function ts() { return new Date().toISOString(); }

function newRunId() {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const start = Date.now();
  const runId = newRunId();

  console.log(`deploy-coolify · RUN_ID=${runId} · branch=${args.branch}`);
  if (args.dryRun) console.log('  (dry-run · sin push ni deploy)');
  if (args.verifyOnly) console.log('  (verify-only · sin push ni trigger)');

  const phases = {};
  let expectedSha = null;
  let evidenceDir = null;
  let env;

  try {
    // ---- LOAD ENV ----
    log.phase('ENV');
    const envPath = path.isAbsolute(args.envFile)
      ? args.envFile
      : path.join(REPO_ROOT, args.envFile);
    const rawEnv = await loadEnvFile(envPath);
    env = validateEnv(rawEnv);
    log.ok(`${args.envFile} cargado · COOLIFY_API_TOKEN=${maskToken(env.COOLIFY_API_TOKEN)}`);
    log.ok(`COOLIFY_BASE_URL=${env.COOLIFY_BASE_URL}`);
    log.ok(`COOLIFY_APP_UUID=${env.COOLIFY_APP_UUID}`);
    log.ok(`VPS_SSH_HOST=${env.VPS_SSH_HOST}`);
    phases.env = { ok: true };

    // ---- PRE-FLIGHT ----
    log.phase('PRE-FLIGHT');
    const preStart = Date.now();

    if (args.verifyOnly) {
      // verify-only: NO exigimos working-tree clean ni estar parado en
      // --branch. La intención del modo es "certificar el deploy actual
      // contra lo que origin tiene como HEAD de la branch indicada", sin
      // importar dónde está parado el operador. EXPECTED_SHA se resuelve
      // contra origin/<branch>, NO contra HEAD local.
      log.step('(verify-only) saltando working-tree + branch checks');
      expectedSha = await getRemoteSha(args.branch);
      log.ok(`EXPECTED_SHA = ${expectedSha} (desde origin/${args.branch})`);
    } else {
      await checkWorkingTreeClean();
      log.ok('working tree clean');

      const current = await checkCurrentBranch(args.branch);
      log.ok(`branch actual = ${current}`);

      expectedSha = await captureSha();
      log.ok(`EXPECTED_SHA = ${expectedSha} (HEAD local de ${current})`);

      const { ahead, behind } = await checkAheadBehind(args.branch);
      if (behind != null && behind > 0) {
        const err = new Error(
          `Local está ${behind} commits behind de origin/${args.branch}. Hacé pull antes.`,
        );
        err.exitCode = 6;
        throw err;
      }
      if (ahead != null && ahead > 0) {
        log.ok(`local ahead ${ahead} commit(s) (push pendiente)`);
      } else if (ahead === 0) {
        log.ok('local en sync con origin');
      }
    }

    await checkSshReachable({
      sshHost: env.VPS_SSH_HOST,
      sshKeyPath: env.SSH_KEY_PATH || undefined,
    });
    log.ok(`SSH a ${env.VPS_SSH_HOST} alcanzable`);

    await verifyCredentials({
      baseUrl: env.COOLIFY_BASE_URL,
      token: env.COOLIFY_API_TOKEN,
      appUuid: env.COOLIFY_APP_UUID,
    });
    log.ok('Coolify credentials válidas');

    if (!args.skipTests && !args.verifyOnly) {
      log.step(`corriendo tests: ${env.TEST_COMMAND}`);
      await runTests(env.TEST_COMMAND);
      log.ok('tests pasaron');
    } else {
      log.warn('tests salteados');
    }

    phases.preflight = { ok: true, durationMs: Date.now() - preStart };

    // ---- EVIDENCE DIR ----
    evidenceDir = await createEvidenceDir(
      path.join(REPO_ROOT, env.EVIDENCE_ROOT),
      runId,
    );
    await writeRawArtifact(evidenceDir, 'EXPECTED_SHA', expectedSha + '\n');
    await writeRawArtifact(evidenceDir, 'BRANCH', args.branch + '\n');
    log.ok(`evidence dir: ${path.relative(REPO_ROOT, evidenceDir)}`);

    if (args.dryRun) {
      log.phase('DRY-RUN END');
      log.ok('todo el pre-flight pasó · sin push, sin deploy');
      await finalize({ runId, args, expectedSha, phases, evidenceDir, start, outcome: 'dry-run' });
      return;
    }

    // ---- PUSH ----
    if (!args.verifyOnly) {
      log.phase('PUSH');
      const pushStart = Date.now();
      const pushOut = await gitPush(args.branch);
      if (pushOut) log.step(pushOut.split('\n')[0]);
      const remoteSha = await verifyRemoteSha(args.branch, expectedSha);
      log.ok(`remote SHA = ${remoteSha} (match)`);
      phases.push = { ok: true, durationMs: Date.now() - pushStart };
    }

    // ---- COOLIFY DEPLOY ----
    let deploymentUuid = null;
    if (!args.verifyOnly) {
      log.phase('COOLIFY');
      const coolifyStart = Date.now();
      const trigger = await triggerDeploy({
        baseUrl: env.COOLIFY_BASE_URL,
        token: env.COOLIFY_API_TOKEN,
        appUuid: env.COOLIFY_APP_UUID,
      });
      deploymentUuid = trigger.deploymentUuid;
      await writeRawArtifact(evidenceDir, 'deployment-trigger.json', trigger.raw);
      log.ok(`deployment_uuid = ${deploymentUuid}`);

      log.step('polling status...');
      const poll = await pollDeployment({
        baseUrl: env.COOLIFY_BASE_URL,
        token: env.COOLIFY_API_TOKEN,
        deploymentUuid,
        intervalMs: Number(env.POLL_INTERVAL_MS),
        timeoutMs: Number(env.DEPLOY_TIMEOUT_MS),
        onTick: (status) => log.step(`  [${ts().slice(11, 19)}] status=${status}`),
      });
      log.ok(`deployment finished en ${Math.round(poll.durationMs / 1000)}s`);
      phases.coolify = { ok: true, durationMs: Date.now() - coolifyStart, detail: deploymentUuid };
    }

    // ---- HEALTHCHECK ----
    log.phase('HEALTHCHECK');
    const hzStart = Date.now();
    const hz = await waitHealthz(env.PUBLIC_HEALTHZ_URL, {
      timeoutMs: Number(env.HEALTHZ_TIMEOUT_MS),
    });
    await writeRawArtifact(evidenceDir, 'healthz.json', hz.body);
    log.ok(`/healthz 200 en ${Math.round(hz.durationMs / 1000)}s`);
    phases.healthz = { ok: true, durationMs: Date.now() - hzStart };

    // ---- A.5 DUAL ----
    log.phase('A.5 DUAL');
    const a5Start = Date.now();
    const versionRes = await verifyVersionEndpoint(env.PUBLIC_VERSION_URL, expectedSha);
    await writeRawArtifact(evidenceDir, 'version-endpoint.json', versionRes.raw);
    log.ok(`/api/version.buildSha = ${expectedSha.slice(0, 10)}… (match)`);

    const ociRes = await verifyOciLabel({
      sshHost: env.VPS_SSH_HOST,
      sshKeyPath: env.SSH_KEY_PATH || undefined,
      containerPrefix: env.CONTAINER_NAME_PREFIX,
      expectedSha,
    });
    await writeRawArtifact(evidenceDir, 'container-info.json', {
      containerName: ociRes.containerName,
      ociRevision: ociRes.ociRevision,
    });
    log.ok(`OCI label image.revision = ${expectedSha.slice(0, 10)}… (match)`);
    log.ok(`container: ${ociRes.containerName}`);
    phases.a5 = { ok: true, durationMs: Date.now() - a5Start, detail: ociRes.containerName };

    // ---- DONE ----
    await finalize({
      runId,
      args,
      expectedSha,
      phases,
      evidenceDir,
      start,
      outcome: 'success',
      extra: { deploymentUuid, containerName: ociRes.containerName },
    });

  } catch (err) {
    if (evidenceDir) {
      await finalize({
        runId, args, expectedSha, phases, evidenceDir, start,
        outcome: 'failed',
        errorMessage: err.message,
      }).catch(() => {});
    }
    log.fail(err.message);
    if (err.observed && err.expected) {
      log.fail(`  observado: ${err.observed}`);
      log.fail(`  esperado:  ${err.expected}`);
    }
    process.exit(err.exitCode || 1);
  }
}

async function finalize({ runId, args, expectedSha, phases, evidenceDir, start, outcome, errorMessage, extra = {} }) {
  const durationMs = Date.now() - start;
  const manifest = {
    runId,
    branch: args.branch,
    expectedSha,
    outcome,
    durationMs,
    timestamp: new Date().toISOString(),
    phases,
    args: {
      skipTests: args.skipTests,
      dryRun: args.dryRun,
      verifyOnly: args.verifyOnly,
    },
    ...extra,
    ...(errorMessage ? { error: errorMessage } : {}),
  };
  await writeManifest(evidenceDir, manifest);
  await writeSummary(evidenceDir, {
    runId,
    branch: args.branch,
    expectedSha,
    outcome,
    durationMs,
    phases,
    errorMessage,
  });
  const rel = path.relative(REPO_ROOT, evidenceDir);
  if (outcome === 'success') {
    console.log(`\n✅ Deploy completo · SHA ${expectedSha?.slice(0, 10)}… · ${Math.round(durationMs / 1000)}s`);
  } else if (outcome === 'dry-run') {
    console.log(`\n✓ Dry-run OK · evidence en ${rel}`);
  } else {
    console.log(`\n✗ Deploy fallido · evidence parcial en ${rel}`);
  }
  console.log(`   Evidence: ${rel}/`);
}

main();
