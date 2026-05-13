const HOUR_MS = 60 * 60 * 1000;

export function startAutoFinalize(repos, intervalMs = HOUR_MS) {
  const tick = async () => {
    try {
      const finalized = await repos.activities.finalizePastActivities();
      if (finalized.length) {
        console.log(`[auto-finalize] ${finalized.length} actividad(es) marcadas como finalizadas`);
        await repos.persist();
      }
    } catch (e) {
      console.error('[auto-finalize] error:', e.message);
    }
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  return handle;
}
