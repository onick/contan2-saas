import { Router } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { generateCredentialPng } from '../services/credential.js';
import { sendCredentialEmail } from '../services/email.js';

export function createCredentialsRouter(repos) {
  const router = Router();

  router.get('/:code.png', async (req, res, next) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      if (!/^CCB-[A-Z0-9]{6}$/.test(code)) {
        throw new HttpError(400, 'Formato de código inválido');
      }
      const user = await repos.users.findByCode(code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      const png = await generateCredentialPng(user);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="credencial-${code}.png"`);
      res.send(png);
    } catch (e) {
      next(e);
    }
  });

  router.post('/:code/send', async (req, res, next) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      if (!/^CCB-[A-Z0-9]{6}$/.test(code)) {
        throw new HttpError(400, 'Formato de código inválido');
      }
      const user = await repos.users.findByCode(code);
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      if (!user.email) {
        throw new HttpError(400, 'El usuario no tiene email registrado');
      }
      const result = await sendCredentialEmail(user);
      if (result.skipped) {
        return res.status(202).json({
          ok: false,
          message: result.reason === 'sin RESEND_API_KEY'
            ? 'Modo desarrollo: credencial generada pero no enviada (falta RESEND_API_KEY)'
            : 'Email no enviado',
          ...result,
        });
      }
      if (!result.sent) {
        return res.status(502).json({ ok: false, error: result.error });
      }
      res.json({ ok: true, id: result.id, email: user.email });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
