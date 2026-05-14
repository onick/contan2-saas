import { config } from '../config.js';
import { sendInvitationEmail } from './email.js';

const DAY_MS = 86_400_000;

function rsvpUrlFor(organization, token) {
  // Si el publicar URL ya apunta al tenant, úsalo. Si no, construir desde slug.
  const base = config.PUBLIC_URL;
  return `${base.replace(/\/$/, '')}/rsvp/${token}`;
}

/**
 * Invita una lista de usuarios a una actividad. Para cada uno:
 * - Crea la invitación (o reutiliza si ya existe y está pending)
 * - Envía email con link único
 *
 * Devuelve resumen con counts por estado.
 */
export async function inviteUsersToActivity({ repos, organization, activity, userIds }) {
  // Expiración: 1 día después de la fecha de la actividad (margen de gracia)
  const expiresAt = new Date(new Date(activity.date).getTime() + DAY_MS);

  let created = 0;
  let alreadyInvited = 0;
  let emailsSent = 0;
  let emailsSkipped = 0;
  let emailsFailed = 0;
  const details = [];

  for (const userId of userIds) {
    const user = await repos.users.findById(userId);
    if (!user) {
      details.push({ userId, error: 'usuario no encontrado' });
      continue;
    }
    if (!user.email) {
      details.push({ userId, code: user.code, error: 'usuario sin email' });
      emailsSkipped += 1;
      continue;
    }

    let invitation;
    try {
      invitation = await repos.invitations.create({
        activityId: activity.id,
        userId,
        expiresAt,
      });
      created += 1;
    } catch (e) {
      if (e.code === 'DUPLICATE_INVITATION') {
        alreadyInvited += 1;
        invitation = e.existing;
        details.push({
          userId,
          code: user.code,
          status: invitation?.status || 'pending',
          note: 'ya invitado previamente',
        });
        // No re-enviamos email a invitaciones ya respondidas
        if (invitation?.status !== 'pending') continue;
      } else {
        details.push({ userId, code: user.code, error: e.message });
        continue;
      }
    }

    const rsvpUrl = rsvpUrlFor(organization, invitation.token);
    const r = await sendInvitationEmail({
      user,
      activity,
      orgName: organization.name,
      rsvpUrl,
    });
    if (r.sent) {
      emailsSent += 1;
      await repos.invitations.markSent(invitation.id).catch(() => {});
    } else if (r.skipped) emailsSkipped += 1;
    else emailsFailed += 1;
  }

  return {
    summary: {
      requested: userIds.length,
      created,
      alreadyInvited,
      emailsSent,
      emailsSkipped,
      emailsFailed,
    },
    details,
  };
}
