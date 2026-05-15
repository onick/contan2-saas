import { sendActivityCancellationEmail } from './email.js';

/**
 * Notifica a todos los inscritos en una actividad cancelada.
 * Se ejecuta de forma asíncrona (fire-and-forget) para no bloquear la respuesta HTTP.
 */
export async function notifyActivityCancelled({ repos, activity, organization }) {
  const attendances = await repos.attendance.findByActivityId(activity.id);
  if (attendances.length === 0) {
    console.log(`[cancellation] ${activity.name} sin asistencias, 0 emails`);
    return { total: 0, sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0, skipped = 0, failed = 0;
  for (const att of attendances) {
    const user = await repos.users.findById(att.userId);
    if (!user) { skipped += 1; continue; }
    if (!user.email) { skipped += 1; continue; }
    const r = await sendActivityCancellationEmail({ user, activity, organization });
    if (r.sent) sent += 1;
    else if (r.skipped) skipped += 1;
    else failed += 1;
  }

  console.log(`[cancellation] ${activity.name}: ${sent}/${attendances.length} enviados (${skipped} sin email, ${failed} fallos)`);
  return { total: attendances.length, sent, skipped, failed };
}
