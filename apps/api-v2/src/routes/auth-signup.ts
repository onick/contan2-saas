import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb } from '@contan2/db';
import { createStaffSession } from '@contan2/auth';
import { StaffSignupRequestSchema, type StaffSignupResponse } from '@contan2/contracts';
import { findOrgBySlug } from '@contan2/db';
import { hashStaffPassword } from '../services/password.js';
import { RESERVED_SUBDOMAINS } from '../tenant.js';

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

export const authSignupRoute: FastifyPluginAsync = async (app) => {
  app.post('/auth/signup', async (req: FastifyRequest, reply) => {
    const db = getDb();

    // 1) Validar body con el esquema
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

    // 3) Hashear contraseña del administrador
    const passwordHash = await hashStaffPassword(password);

    // Generar prefijo de código (primeras 3 letras mayúsculas del slug, o 'MEM')
    const cleanLetters = slug.replace(/[^a-z0-9]/g, '').toUpperCase();
    const codePrefix = cleanLetters.slice(0, 3) || 'MEM';

    // 14 días a partir de ahora para el trial
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    try {
      // 4) Crear organización y usuario en una transacción
      const result = await db.transaction().execute(async (tx) => {
        // a) Crear organización
        const org = await tx
          .insertInto('organizations')
          .values({
            slug,
            name: organizationName,
            status: 'active',
            plan: 'free',
            trial_ends_at: trialEndsAt,
            code_prefix: codePrefix,
          })
          .returning(['id', 'slug'])
          .executeTakeFirstOrThrow();

        // b) Verificar si ya existe este email en la misma organización
        const existingStaff = await tx
          .selectFrom('staff_members')
          .select('id')
          .where('organization_id', '=', org.id)
          .where('email', '=', email.toLowerCase())
          .executeTakeFirst();
        if (existingStaff) {
          throw new Error('Este correo ya está registrado en la organización.');
        }

        // c) Crear el usuario staff (owner/admin)
        const staff = await tx
          .insertInto('staff_members')
          .values({
            organization_id: org.id,
            email: email.toLowerCase(),
            password_hash: passwordHash,
            full_name: fullName,
            role: 'owner',
            status: 'active',
            must_change_password: false,
          })
          .returning(['id', 'email'])
          .executeTakeFirstOrThrow();

        return { orgId: org.id, slug: org.slug, staffId: staff.id };
      });

      // 5) Crear sesión de staff
      const ua = req.headers['user-agent'];
      const { token } = await createStaffSession(db, {
        staffMemberId: result.staffId,
        rememberMe: true,
        ipHash: req.ip ? sha256(req.ip) : null,
        userAgent: typeof ua === 'string' ? ua.slice(0, 256) : null,
      });

      reply.code(201);
      const body: StaffSignupResponse = {
        ok: true,
        slug: result.slug,
        token,
      };
      return body;
    } catch (err: any) {
      reply.code(500);
      return { error: err.message || 'Error al procesar el registro.' };
    }
  });
};
