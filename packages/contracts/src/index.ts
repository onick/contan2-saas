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

// ─────────────────────────────────────────────────────────────────────────
// Endpoints READ-ONLY de api-v2 (PR v2/api-readonly-endpoints).
// Proyecciones camelCase de las tablas de negocio v1 (snake_case en la DB).
// Misma forma que consumirá apps/web al reemplazar demoData → fetch(api-v2).
// ─────────────────────────────────────────────────────────────────────────

// Métricas agregadas del dashboard (todas tenant-scoped).
export const DashboardMetricsResponseSchema = z.object({
  metrics: z.object({
    totalUsers: z.number().int(),
    totalActivities: z.number().int(),
    activeActivities: z.number().int(),
    totalAttendance: z.number().int(),
    checkedIn: z.number().int(),
  }),
});
export type DashboardMetricsResponse = z.infer<typeof DashboardMetricsResponseSchema>;

export const ActivityStatusSchema = z.enum(['activa', 'finalizada', 'cancelada']);

export const ActivityListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  location: z.string(),
  date: z.string(), // ISO 8601
  capacity: z.number().int(),
  enrolledCount: z.number().int(),
  status: ActivityStatusSchema,
  category: z.string().nullable(),
});
export type ActivityListItem = z.infer<typeof ActivityListItemSchema>;

export const ActivitiesListResponseSchema = z.object({
  items: z.array(ActivityListItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type ActivitiesListResponse = z.infer<typeof ActivitiesListResponseSchema>;

// Visitante · PII real visible para staff autenticado del MISMO tenant.
export const UserSchema = z.object({
  id: z.string(),
  code: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  visitCount: z.number().int(),
  createdAt: z.string(), // ISO 8601
});
export type User = z.infer<typeof UserSchema>;

export const UsersListResponseSchema = z.object({
  items: z.array(UserSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type UsersListResponse = z.infer<typeof UsersListResponseSchema>;

export const UserDetailResponseSchema = z.object({ user: UserSchema });
export type UserDetailResponse = z.infer<typeof UserDetailResponseSchema>;

// Registro de asistencia (con datos del visitante por join; null si anónimo).
export const AttendanceListItemSchema = z.object({
  id: z.string(),
  userCode: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  activityId: z.string(),
  activityName: z.string(),
  anonymous: z.boolean(),
  checkedInAt: z.string().nullable(), // ISO 8601 | null
  registeredAt: z.string(), // ISO 8601
});
export type AttendanceListItem = z.infer<typeof AttendanceListItemSchema>;

export const AttendanceListResponseSchema = z.object({
  items: z.array(AttendanceListItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type AttendanceListResponse = z.infer<typeof AttendanceListResponseSchema>;
