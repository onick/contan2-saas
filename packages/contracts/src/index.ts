import { z } from 'zod';

export const HealthzResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  ts: z.string().datetime(),
  buildSha: z.string(),
});

export type HealthzResponse = z.infer<typeof HealthzResponseSchema>;

// Shape público del staff autenticado · paridad exacta con el publicStaff
// de v1 (backend/src/services/auth/tenantAuthService.js).
export const PublicStaffSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  fullName: z.string(),
  status: z.enum(['active', 'suspended', 'deleted']),
  role: z.enum(['owner', 'admin', 'operator']),
  mustChangePassword: z.boolean(),
  mfaEnabled: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export type PublicStaff = z.infer<typeof PublicStaffSchema>;

// Respuesta de GET /api/v2/auth/me.
export const StaffMeResponseSchema = z.object({
  staff: PublicStaffSchema,
  sessionId: z.string(),
});

export type StaffMeResponse = z.infer<typeof StaffMeResponseSchema>;

// Respuesta de GET /api/v2/org/branding. `sidebarTheme` mapea la columna
// `sidebar_style` de v1; el resto es proyección de branding del tenant.
export const OrgBrandingResponseSchema = z.object({
  organization: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    emailLogoUrl: z.string().nullable(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
    sidebarTheme: z.enum(['brand', 'dark', 'light']),
    status: z.enum(['active', 'suspended', 'trial_ended', 'deleted']),
  }),
});

export type OrgBrandingResponse = z.infer<typeof OrgBrandingResponseSchema>;
