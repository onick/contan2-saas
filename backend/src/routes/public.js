import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  validatePublicCheckin,
  normalizeUserData,
} from '../domain/schemas.js';
import { sendCredentialEmail } from '../services/email.js';
import { initRepositories, createTenantRepos } from '../db/repositories.js';
import { PostgresInvitationRepository } from '../db/postgres/PostgresInvitationRepository.js';
import { OrganizationRepository } from '../db/postgres/platform/OrganizationRepository.js';
import { config } from '../config.js';
import { rateLimit } from '../utils/rateLimit.js';

// 30 check-ins por IP/minuto: suficiente para staff que registra a mano,
// bloquea scripts que intenten flood.
const checkinRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: 'Demasiados check-ins desde esta IP. Intenta de nuevo en un momento.',
});

function publicUser(u) {
  return { code: u.code, firstName: u.firstName, lastName: u.lastName, visitCount: u.visitCount };
}

// Rate limiter in-memory para el endpoint de lookup público
// (previene enumeración de emails registrados)
const lookupAttempts = new Map(); // ip -> { count, resetAt }
const LOOKUP_MAX_PER_MIN = 15;

function publicLookupRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = lookupAttempts.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (entry.resetAt < now) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  entry.count += 1;
  lookupAttempts.set(ip, entry);
  if (entry.count > LOOKUP_MAX_PER_MIN) {
    return next(new HttpError(429, 'Demasiadas búsquedas. Espera un minuto.'));
  }
  next();
}

// Cleanup periódico
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of lookupAttempts) {
    if (e.resetAt < now - 60_000) lookupAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

function publicActivity(a) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    location: a.location,
    date: a.date,
    capacity: a.capacity,
    enrolledCount: a.enrolledCount,
    description: a.description,
    imageUrl: a.imageUrl ?? null,
  };
}

export function createPublicRouter() {
  const router = Router();

  router.get('/activities', async (req, res, next) => {
    try {
      const all = await req.repos.activities.findAll({ status: 'activa' });
      const available = all
        .filter(a => a.enrolledCount < a.capacity)
        .map(publicActivity);
      res.json({ activities: available, total: available.length });
    } catch (e) {
      next(e);
    }
  });

  // Type-ahead suggest: dado un prefix mínimo de 3 chars, devuelve UN match
  // (el más reciente). Privacidad: solo nombre, no email completo.
  // Rate-limited para prevenir scraping/enumeración.
  router.get('/users/suggest', publicLookupRateLimit, async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 3) return res.status(204).end();
      if (!/^[a-zA-Z0-9._+-]+$/.test(q)) return res.status(204).end();

      const { matches, total } = await req.repos.users.findByEmailPrefix(q, 3);

      if (total === 0) return res.status(204).end();

      // Privacy guard: si hay >1 match, requerir al menos 4 chars para listar varios.
      // Con 3 chars solo mostramos si el match es único (evita scraping con prefix corto).
      if (total > 1 && q.length < 4) {
        return res.json({ matches: [], total, tooBroad: true });
      }

      // Si hay más de 3 matches en total, devolvemos los top 3 + flag para que el front
      // sugiera al usuario seguir escribiendo
      const payload = matches.map(u => ({
        code: u.code,
        firstName: u.firstName,
        lastName: u.lastName,
        visitCount: u.visitCount,
      }));
      res.json({ matches: payload, total, hasMore: total > matches.length });
    } catch (e) {
      next(e);
    }
  });

  // Lookup flexible: acepta código o email. Para el kiosko, cuando el usuario
  // no recuerda su código. Rate-limited para prevenir enumeración de emails.
  // IMPORTANTE: debe declararse ANTES de /users/:code (Express match order).
  router.get('/users/lookup', publicLookupRateLimit, async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) throw new HttpError(400, 'Parámetro q requerido');
      let user = null;
      if (q.includes('@')) {
        user = await req.repos.users.findByEmail(q);
      } else {
        const orgPrefix = (req.organization?.codePrefix || 'CCB').toUpperCase();
        let code = q.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        // Si el usuario escribió solo los 6 chars (sin prefijo), prependemos el del tenant.
        if (!code.includes('-') && /^[A-Z0-9]{6}$/.test(code)) {
          code = `${orgPrefix}-${code}`;
        }
        if (!/^[A-Z]{2,6}-[A-Z0-9]{6}$/.test(code)) {
          throw new HttpError(400, 'Formato inválido (código o email)');
        }
        user = await req.repos.users.findByCode(code);
      }
      if (!user) {
        throw new HttpError(404, 'No te encontramos en el sistema');
      }
      res.json(publicUser(user));
    } catch (e) {
      next(e);
    }
  });

  router.get('/users/:code', async (req, res, next) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      if (!/^[A-Z]{2,6}-[A-Z0-9]{6}$/.test(code)) {
        throw new HttpError(400, 'Formato de código inválido');
      }
      const user = await req.repos.users.findByCode(code);
      if (!user) throw new HttpError(404, 'Código no encontrado');
      res.json(publicUser(user));
    } catch (e) {
      next(e);
    }
  });

  router.post('/checkin', checkinRateLimit, async (req, res, next) => {
    try {
      const errors = validatePublicCheckin(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);

      const activityId = String(req.body.activityId).trim();
      const activity = await req.repos.activities.findById(activityId);
      if (!activity) throw new HttpError(404, 'Actividad no encontrada');
      if (activity.status !== 'activa') {
        throw new HttpError(409, 'La actividad no está activa');
      }

      let user;
      let isNewUser = false;

      if (req.body.userCode) {
        const code = String(req.body.userCode).trim().toUpperCase();
        user = await req.repos.users.findByCode(code);
        if (!user) throw new HttpError(404, 'Código no encontrado');

        const existing = await req.repos.attendance.findOne({
          userId: user.id,
          activityId,
        });
        if (existing) {
          if (!existing.checkedInAt) {
            // RSVP previamente confirmado, ahora hace check-in real (sin duplicar cupo)
            await req.repos.attendance.markCheckedIn(existing.id);
            user = await req.repos.users.incrementVisit(user.code);
            return res.status(200).json({
              user: { code: user.code, firstName: user.firstName, lastName: user.lastName, visitCount: user.visitCount },
              activity: { id: activity.id, name: activity.name, date: activity.date, location: activity.location, type: activity.type },
              isNewUser: false,
              upgradedFromRsvp: true,
            });
          }
          throw new HttpError(409, 'Ya estás registrado en esta actividad');
        }

        const reservation = await req.repos.activities.incrementEnrolledIfRoom(activityId);
        if (!reservation.ok) {
          if (reservation.reason === 'full') throw new HttpError(409, 'Cupo agotado');
          if (reservation.reason === 'not_active') {
            throw new HttpError(409, 'La actividad no está activa');
          }
          throw new HttpError(404, 'Actividad no encontrada');
        }

        try {
          await req.repos.attendance.create({
            userId: user.id,
            userCode: user.code,
            activityId,
            activityName: activity.name,
          });
          user = await req.repos.users.incrementVisit(user.code);
        } catch (e) {
          await req.repos.activities.decrementEnrolled(activityId);
          throw e;
        }
      } else {
        const data = normalizeUserData(req.body.newUser);

        if (data.email) {
          const existing = await req.repos.users.findByEmail(data.email);
          if (existing) {
            return res.status(409).json({
              error: 'Este email ya tiene un código registrado',
              existingCode: existing.code,
              existingName: `${existing.firstName} ${existing.lastName}`,
            });
          }
        }

        const reservation = await req.repos.activities.incrementEnrolledIfRoom(activityId);
        if (!reservation.ok) {
          if (reservation.reason === 'full') throw new HttpError(409, 'Cupo agotado');
          if (reservation.reason === 'not_active') {
            throw new HttpError(409, 'La actividad no está activa');
          }
          throw new HttpError(404, 'Actividad no encontrada');
        }

        try {
          user = await req.repos.users.create(data);
          isNewUser = true;
          await req.repos.attendance.create({
            userId: user.id,
            userCode: user.code,
            activityId,
            activityName: activity.name,
          });
        } catch (e) {
          await req.repos.activities.decrementEnrolled(activityId);
          throw e;
        }
        if (user.email) {
          sendCredentialEmail(user, req.organization).catch(err =>
            console.error('[public-checkin] envío credencial falló:', err.message),
          );
        }
      }

      res.status(201).json({
        user: {
          code: user.code,
          firstName: user.firstName,
          lastName: user.lastName,
          visitCount: user.visitCount,
        },
        activity: {
          id: activity.id,
          name: activity.name,
          date: activity.date,
          location: activity.location,
          type: activity.type,
        },
        isNewUser,
      });
    } catch (e) {
      next(e);
    }
  });

  // =========================================================================
  // RSVP: invitado responde via link único del email
  // Usa req.repos (tenant scoped por subdomain del link).
  // Valida que el token pertenezca a la org actual (anti cross-tenant).
  // =========================================================================
  router.get('/rsvp/:token', async (req, res, next) => {
    try {
      const inst = await initRepositories();
      const inv = await PostgresInvitationRepository.findByToken(inst.pool, req.params.token);
      if (!inv) throw new HttpError(404, 'Invitación no encontrada');
      // Validar que la invitación es de este tenant
      const invOrgId = await getOrgIdFromInv(inst.pool, inv.id);
      if (req.organizationId && invOrgId !== req.organizationId) {
        throw new HttpError(404, 'Invitación no pertenece a esta organización');
      }

      const activity = await req.repos.activities.findById(inv.activityId);
      const user = await req.repos.users.findById(inv.userId);

      const expired = new Date(inv.expiresAt).getTime() < Date.now();

      res.json({
        invitation: {
          token: inv.token,
          status: expired && inv.status === 'pending' ? 'expired' : inv.status,
          expiresAt: inv.expiresAt,
          respondedAt: inv.respondedAt,
        },
        activity: activity
          ? {
              name: activity.name,
              type: activity.type,
              location: activity.location,
              date: activity.date,
              description: activity.description,
              imageUrl: activity.imageUrl,
              status: activity.status,
              capacity: activity.capacity,
              enrolledCount: activity.enrolledCount,
            }
          : null,
        user: user
          ? { firstName: user.firstName, lastName: user.lastName, code: user.code }
          : null,
        organization: req.organization
          ? {
              name: req.organization.name,
              slug: req.organization.slug,
              primaryColor: req.organization.primaryColor,
              logoUrl: req.organization.logoUrl,
            }
          : null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/rsvp/:token', async (req, res, next) => {
    try {
      const action = req.body?.action;
      if (!['yes', 'no'].includes(action)) {
        throw new HttpError(400, 'action debe ser yes o no');
      }
      const inst = await initRepositories();
      const inv = await PostgresInvitationRepository.findByToken(inst.pool, req.params.token);
      if (!inv) throw new HttpError(404, 'Invitación no encontrada');

      const invOrgId = await getOrgIdFromInv(inst.pool, inv.id);
      if (req.organizationId && invOrgId !== req.organizationId) {
        throw new HttpError(404, 'Invitación no pertenece a esta organización');
      }

      const expired = new Date(inv.expiresAt).getTime() < Date.now();
      if (expired) throw new HttpError(410, 'Invitación expirada');

      if (inv.status !== 'pending') {
        return res.json({
          ok: true,
          alreadyResponded: true,
          status: inv.status,
          respondedAt: inv.respondedAt,
        });
      }

      const activity = await req.repos.activities.findById(inv.activityId);
      const user = await req.repos.users.findById(inv.userId);
      if (!activity || !user) throw new HttpError(404, 'Recurso asociado no encontrado');

      if (action === 'no') {
        const updated = await req.repos.invitations.respond(inv.id, 'declined');
        return res.json({ ok: true, status: 'declined', respondedAt: updated.respondedAt });
      }

      // action === 'yes' → confirmar y reservar cupo
      if (activity.status !== 'activa') {
        throw new HttpError(409, 'La actividad ya no está activa');
      }
      const existingAtt = await req.repos.attendance.findOne({
        userId: user.id,
        activityId: activity.id,
      });
      if (existingAtt) {
        const updated = await req.repos.invitations.respond(inv.id, 'confirmed');
        return res.json({
          ok: true,
          status: 'confirmed',
          alreadyEnrolled: true,
          respondedAt: updated.respondedAt,
        });
      }
      const reservation = await req.repos.activities.incrementEnrolledIfRoom(activity.id);
      if (!reservation.ok) {
        if (reservation.reason === 'full') throw new HttpError(409, 'Cupo agotado');
        throw new HttpError(409, 'No se puede reservar plaza');
      }
      try {
        await req.repos.attendance.create({
          userId: user.id,
          userCode: user.code,
          activityId: activity.id,
          activityName: activity.name,
          checkedIn: false, // reserva cupo via RSVP pero no marca check-in real todavía
        });
        const updated = await req.repos.invitations.respond(inv.id, 'confirmed');
        res.json({ ok: true, status: 'confirmed', respondedAt: updated.respondedAt });
      } catch (e) {
        await req.repos.activities.decrementEnrolled(activity.id);
        throw e;
      }
    } catch (e) {
      next(e);
    }
  });

  return router;
}

async function getOrgIdFromInv(pool, invId) {
  const { rows } = await pool.query(
    'SELECT organization_id FROM invitations WHERE id = $1',
    [invId],
  );
  return rows[0]?.organization_id;
}
