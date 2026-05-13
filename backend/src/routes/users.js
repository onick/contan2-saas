import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  validateUserCreate,
  validateUserUpdate,
  normalizeUserData,
} from '../domain/schemas.js';
import { sendCredentialEmail } from '../services/email.js';

export function createUsersRouter() {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const errors = validateUserCreate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const data = normalizeUserData(req.body);
      const existing = await req.repos.users.findByEmail(data.email);
      if (existing) throw new HttpError(409, 'El email ya está registrado');
      const user = await req.repos.users.create(data);
      if (user.email) {
        sendCredentialEmail(user).catch(err =>
          console.error('[users] envío credencial falló:', err.message),
        );
      }
      res.status(201).json(user);
    } catch (e) {
      next(e);
    }
  });

  router.post('/bulk', async (req, res, next) => {
    try {
      const list = Array.isArray(req.body?.users) ? req.body.users : null;
      if (!list) throw new HttpError(400, 'Body debe contener { users: [...] }');
      if (list.length === 0) throw new HttpError(400, 'Lista de usuarios vacía');
      if (list.length > 5000) {
        throw new HttpError(400, 'Máximo 5000 usuarios por importación');
      }

      const created = [];
      const errors = [];
      const seenEmails = new Set();

      for (let i = 0; i < list.length; i++) {
        const raw = list[i];
        const validation = validateUserCreate(raw);
        if (validation.length) {
          errors.push({
            index: i,
            email: raw?.email ?? null,
            error: 'Datos inválidos',
            details: validation.map(d => `${d.field}: ${d.message}`),
          });
          continue;
        }
        const data = normalizeUserData(raw);
        if (data.email) {
          if (seenEmails.has(data.email)) {
            errors.push({
              index: i,
              email: data.email,
              error: 'Email duplicado dentro del archivo',
            });
            continue;
          }
          seenEmails.add(data.email);

          const existing = await req.repos.users.findByEmail(data.email);
          if (existing) {
            errors.push({
              index: i,
              email: data.email,
              error: 'Email ya registrado en el sistema',
            });
            continue;
          }
        }
        try {
          const user = await req.repos.users.create(data);
          created.push(user);
        } catch (e) {
          errors.push({
            index: i,
            email: data.email,
            error: e.message || 'Error al crear usuario',
          });
        }
      }

      res.status(201).json({
        created,
        errors,
        summary: {
          total: list.length,
          created: created.length,
          failed: errors.length,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const users = await req.repos.users.findAll();
      users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ users, total: users.length });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:code', async (req, res, next) => {
    try {
      const user = await req.repos.users.findByCode(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      res.json(user);
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:code/visit', async (req, res, next) => {
    try {
      const user = await req.repos.users.incrementVisit(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      res.json(user);
    } catch (e) {
      next(e);
    }
  });

  router.put('/:code', async (req, res, next) => {
    try {
      const errors = validateUserUpdate(req.body);
      if (errors.length) throw new HttpError(400, 'Datos inválidos', errors);
      const user = await req.repos.users.findByCode(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const data = normalizeUserData(req.body);
      if (data.email && data.email !== user.email) {
        const conflict = await req.repos.users.findByEmail(data.email);
        if (conflict) throw new HttpError(409, 'El email ya está registrado');
      }
      const updated = await req.repos.users.update(req.params.code, data);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:code', async (req, res, next) => {
    try {
      const user = await req.repos.users.findByCode(req.params.code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const attendances = await req.repos.attendance.findByUserId(user.id);
      if (attendances.length > 0) {
        throw new HttpError(409, 'El usuario tiene asistencias registradas');
      }
      await req.repos.users.delete(req.params.code);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
