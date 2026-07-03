import { createHash, randomInt } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb } from '@contan2/db';
import { createStaffSession } from '@contan2/auth';
import {
  StaffSignupRequestSchema,
  SignupVerifyRequestSchema,
  type StaffSignupResponse,
  type SignupVerifyResponse,
} from '@contan2/contracts';
import { findOrgBySlug } from '@contan2/db';
import { hashStaffPassword } from '../services/password.js';
import { RESERVED_SUBDOMAINS } from '../tenant.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { resendSend, escapeHtml, type SendMessage } from '../services/email.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function generateCode(): string {
  return String(randomInt(100000, 999999));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${local[1]}***@${domain}`;
}

// Rate limiters
const signupLimiter = createRateLimiter({ max: 5, windowMs: 60_000, prefix: endpointPrefix('signup') });
const verifyLimiter = createRateLimiter({ max: 10, windowMs: 60_000, prefix: endpointPrefix('signup-verify') });

// ────────────────────────────────────────────────────────────────────────────
// Email de verificación
// ────────────────────────────────────────────────────────────────────────────

const ACCENT = '#e65100';
const INK = '#16181d';

function verificationEmailHtml(code: string, orgName: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td style="background:${INK};padding:24px 32px;">
        <span style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">CONTAN2</span>
      </td></tr>
      <tr><td style="padding:28px 32px 12px;">
        <h1 style="margin:0 0 8px;font-size:22px;color:${INK};">Verifica tu cuenta</h1>
        <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.6;">
          Estás creando una cuenta para <b>${escapeHtml(orgName)}</b>. Ingresa el siguiente código en la pantalla de registro para activar tu cuenta:
        </p>
      </td></tr>
      <tr><td align="center" style="padding:16px 32px;">
        <div style="background:#faf9f7;border:2px solid #e6e3dd;border-radius:12px;padding:18px 24px;display:inline-block;">
          <span style="font-family:Menlo,Monaco,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${ACCENT};">${escapeHtml(code)}</span>
        </div>
      </td></tr>
      <tr><td style="padding:12px 32px 28px;">
        <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;text-align:center;">
          Este código expira en 15 minutos.<br/>Si no solicitaste esta cuenta, ignora este correo.
        </p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

async function sendVerificationEmail(email: string, code: string, orgName: string): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(`[signup-dev] código ${code} para ${maskEmail(email)} — falta RESEND_API_KEY`);
    return { sent: true }; // dry-run: consider it "sent" for dev
  }
  const from = process.env.EMAIL_FROM ?? 'Contan2 <noreply@contan2.com>';
  const msg: SendMessage = {
    from,
    to: email,
    subject: `${code} — Código de verificación · Contan2`,
    html: verificationEmailHtml(code, orgName),
    attachments: [],
  };
  const result = await resendSend(apiKey, msg);
  if (result.error) return { sent: false, error: result.error };
  return { sent: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Endpoints
// ────────────────────────────────────────────────────────────────────────────

export const authSignupRoute: FastifyPluginAsync = async (app) => {
  // ──────────────────────────────────────────────────────────────────────
  // PASO 1: POST /auth/signup → valida, guarda pendiente, envía código
  // ──────────────────────────────────────────────────────────────────────
  app.post('/auth/signup', async (req: FastifyRequest, reply) => {
    // Rate limit por IP
    if ((await signupLimiter.hit(req.ip ?? '0.0.0.0')).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Esperá un momento.' };
    }

    const db = getDb();

    // 1) Validar body
    const parsed = StaffSignupRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.errors[0]?.message || 'Datos de registro inválidos.' };
    }

    const { organizationName, fullName, email, password } = parsed.data;

    // 2) Generar y validar slug
    const slug = slugify(organizationName);
    if (slug.length < 2) {
      reply.code(400);
      return { error: 'El nombre de la organización es muy corto o inválido.' };
    }

    if (RESERVED_SUBDOMAINS.has(slug)) {
      reply.code(400);
      return { error: 'Este nombre de organización está reservado.' };
    }

    // Verificar si el slug ya existe
    const existingOrg = await findOrgBySlug(db, slug);
    if (existingOrg) {
      reply.code(400);
      return { error: 'Ya existe una organización registrada con este nombre.' };
    }

    // 3) Hashear contraseña y generar código
    const passwordHash = await hashStaffPassword(password);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    // 4) Invalidar verificaciones previas del mismo email (evita acumulación)
    await db
      .updateTable('signup_verifications')
      .set({ verified_at: new Date().toISOString() }) // marcar como "usadas"
      .where('email', '=', email.toLowerCase())
      .where('verified_at', 'is', null)
      .execute();

    // 5) Guardar verificación pendiente
    await db
      .insertInto('signup_verifications')
      .values({
        email: email.toLowerCase(),
        code,
        organization_name: organizationName,
        slug,
        full_name: fullName,
        password_hash: passwordHash,
        expires_at: expiresAt,
      })
      .execute();

    // 6) Enviar email con código
    const emailResult = await sendVerificationEmail(email, code, organizationName);
    if (!emailResult.sent) {
      req.log.error({ error: emailResult.error }, 'fallo al enviar email de verificación');
      reply.code(500);
      return { error: 'No pudimos enviar el correo de verificación. Intentá de nuevo.' };
    }

    reply.code(200);
    const body: StaffSignupResponse = {
      ok: true,
      email: maskEmail(email),
    };
    return body;
  });

  // ──────────────────────────────────────────────────────────────────────
  // PASO 2: POST /auth/signup/verify → verifica código, crea org+staff+sesión
  // ──────────────────────────────────────────────────────────────────────
  app.post('/auth/signup/verify', async (req: FastifyRequest, reply) => {
    if ((await verifyLimiter.hit(req.ip ?? '0.0.0.0')).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Esperá un momento.' };
    }

    const db = getDb();

    // 1) Validar body
    const parsed = SignupVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Datos de verificación inválidos.' };
    }

    const { email, code } = parsed.data;

    // 2) Buscar verificación pendiente
    const verification = await db
      .selectFrom('signup_verifications')
      .selectAll()
      .where('email', '=', email.toLowerCase())
      .where('verified_at', 'is', null)
      .where('expires_at', '>', new Date())
      .where('attempts', '<', 5)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!verification) {
      reply.code(400);
      return { error: 'No se encontró una verificación pendiente. Es posible que el código haya expirado o se hayan agotado los intentos. Solicitá un nuevo código.' };
    }

    // 3) Verificar código
    if (verification.code !== code) {
      // Incrementar intentos
      await db
        .updateTable('signup_verifications')
        .set({ attempts: (verification.attempts as number) + 1 })
        .where('id', '=', verification.id)
        .execute();

      const remaining = 4 - (verification.attempts as number);
      reply.code(400);
      return {
        error: remaining > 0
          ? `Código incorrecto. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`
          : 'Código incorrecto. Se agotaron los intentos. Solicitá un nuevo código.',
      };
    }

    // 4) Código correcto — marcar como verificado
    await db
      .updateTable('signup_verifications')
      .set({ verified_at: new Date().toISOString() })
      .where('id', '=', verification.id)
      .execute();

    // 5) Verificar slug de nuevo (pudo haber sido tomado mientras esperaba)
    const existingOrg = await findOrgBySlug(db, verification.slug);
    if (existingOrg) {
      reply.code(400);
      return { error: 'Mientras verificabas, alguien registró una organización con el mismo nombre. Intentá con otro nombre.' };
    }

    // 6) Crear organización y usuario en transacción atómica
    const cleanLetters = verification.slug.replace(/[^a-z0-9]/g, '').toUpperCase();
    const codePrefix = cleanLetters.slice(0, 3) || 'MEM';
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const result = await db.transaction().execute(async (tx) => {
        const org = await tx
          .insertInto('organizations')
          .values({
            slug: verification.slug,
            name: verification.organization_name,
            status: 'active',
            plan: 'free',
            trial_ends_at: trialEndsAt,
            code_prefix: codePrefix,
            // Primario slate neutro para el tenant white-label (el default de
            // columna es legacy CCB navy). Explícito para no depender de que el
            // runner de migraciones ya haya corrido en el entorno.
            primary_color: '#334155',
          })
          .returning(['id', 'slug'])
          .executeTakeFirstOrThrow();

        const staff = await tx
          .insertInto('staff_members')
          .values({
            organization_id: org.id,
            email: verification.email,
            password_hash: verification.password_hash,
            full_name: verification.full_name,
            role: 'owner',
            status: 'active',
            must_change_password: false,
          })
          .returning(['id', 'email'])
          .executeTakeFirstOrThrow();

        return { orgId: org.id, slug: org.slug, staffId: staff.id };
      });

      // 7) Crear sesión
      const ua = req.headers['user-agent'];
      const { token } = await createStaffSession(db, {
        staffMemberId: result.staffId,
        rememberMe: true,
        ipHash: req.ip ? sha256(req.ip) : null,
        userAgent: typeof ua === 'string' ? ua.slice(0, 256) : null,
      });

      reply.code(201);
      const body: SignupVerifyResponse = {
        ok: true,
        slug: result.slug,
        token,
      };
      return body;
    } catch (err) {
      // El error completo queda en el log del servidor; al cliente solo un
      // mensaje genérico para no filtrar internals de la DB (p. ej. el texto
      // de una constraint única).
      req.log.error({ err }, 'signup/verify: error al crear organización');
      reply.code(500);
      return { error: 'Error al procesar el registro.' };
    }
  });
};
