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

// ─────────────────────────────────────────────────────────────────────────
// Auth admin v2 (ESCRITURA · login/logout). Paridad con v1 (backend/src/routes/
// auth.js · POST /api/auth/login + POST /api/logout). El tenant se deriva del
// HOST, jamás del body; la sesión se escribe en staff_auth_sessions (la MISMA
// tabla de v1, byte-compatible). Roles: owner/admin/operator pueden ingresar;
// los permisos de escritura se gatean por endpoint, no en el login.
// ─────────────────────────────────────────────────────────────────────────
export const StaffLoginRequestSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional(),
});
export type StaffLoginRequest = z.infer<typeof StaffLoginRequestSchema>;

// Respuesta del login OK. `mustChangePassword` se expone también al tope (igual
// que v1) para que el cliente pueda forzar el cambio sin releer el staff.
export const StaffLoginResponseSchema = z.object({
  ok: z.literal(true),
  staff: PublicStaffSchema,
  mustChangePassword: z.boolean(),
});
export type StaffLoginResponse = z.infer<typeof StaffLoginResponseSchema>;

export const StaffLogoutResponseSchema = z.object({ ok: z.literal(true) });
export type StaffLogoutResponse = z.infer<typeof StaffLogoutResponseSchema>;

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
  imageUrl: z.string().nullable(), // ruta de portada (/uploads/...) o null
});
export type ActivityListItem = z.infer<typeof ActivityListItemSchema>;

export const ActivitiesListResponseSchema = z.object({
  items: z.array(ActivityListItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type ActivitiesListResponse = z.infer<typeof ActivitiesListResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Creación de actividad (ESCRITURA · POST /api/v2/activities). Primer write
// del admin v2. Paridad con v1 (backend/src/domain/schemas.js · validateActivity
// Create + normalizeActivityData). Decisiones de producto:
//   · status NO viaja en el request: el server fija 'activa' (publica al crear).
//   · imageUrl NO viaja en el request: se persiste image_url = null (sin uploads).
//   · organizationId jamás del body: se deriva de la sesión staff (tenant-scope).
// ─────────────────────────────────────────────────────────────────────────

// type es un enum cerrado en v1 (no free-text). Mismo conjunto exacto.
export const ACTIVITY_TYPES = [
  'exposicion', 'concierto', 'cine', 'taller', 'teatro', 'conferencia', 'otro',
] as const;
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

// Gracia de 60s para "fecha no en el pasado" (paridad exacta con v1).
const ACTIVITY_DATE_PAST_GRACE_MS = 60_000;

export const ActivityCreateRequestSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    type: ActivityTypeSchema,
    location: z.string().trim().min(2).max(100),
    date: z.string().datetime({ offset: true }), // ISO 8601 (inicio)
    endDate: z.string().datetime({ offset: true }).optional(), // ISO 8601 (cierre)
    capacity: z.number().int().min(1).max(10000),
    description: z.string().max(1000).optional(),
    category: z.string().max(60).optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.date).getTime();
    if (Number.isNaN(start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'Fecha inválida' });
      return;
    }
    if (start < Date.now() - ACTIVITY_DATE_PAST_GRACE_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'La fecha debe ser presente o futura' });
    }
    if (data.endDate) {
      const end = new Date(data.endDate).getTime();
      if (Number.isNaN(end)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Fecha de cierre inválida' });
      } else if (end < start) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'La fecha de cierre debe ser igual o posterior a la de inicio' });
      }
    }
  });
export type ActivityCreateRequest = z.infer<typeof ActivityCreateRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Edición de actividad (ESCRITURA · PATCH /api/v2/activities/:id). PARCIAL:
// todos los campos opcionales (se actualiza sólo lo enviado). `.strict()` →
// RECHAZA claves no editables (organizationId, enrolledCount, imageUrl, status,
// id, timestamps) con 400. Las validaciones CRUZADAS contra el estado/valores
// EXISTENTES (capacity ≥ enrolled_count → 409, endDate ≥ date, fecha no pasada
// si está 'activa') viven en el route, porque dependen de la fila actual.
//   · endDate/category aceptan null para LIMPIAR el valor.
// ─────────────────────────────────────────────────────────────────────────
export const ActivityUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    type: ActivityTypeSchema,
    location: z.string().trim().min(2).max(100),
    date: z.string().datetime({ offset: true }),
    endDate: z.string().datetime({ offset: true }).nullable(),
    capacity: z.number().int().min(1).max(10000),
    description: z.string().max(1000),
    category: z.string().max(60).nullable(),
  })
  .partial()
  .strict();
export type ActivityUpdateRequest = z.infer<typeof ActivityUpdateRequestSchema>;

// Cambio de estado (ESCRITURA · PATCH /api/v2/activities/:id/status). Sólo el
// campo status; transiciones válidas las decide el route (matriz). `.strict()`.
export const ActivityStatusUpdateSchema = z.object({ status: ActivityStatusSchema }).strict();
export type ActivityStatusUpdate = z.infer<typeof ActivityStatusUpdateSchema>;

// Actividad completa (respuesta del create · superset del ListItem con los
// campos que el listado no proyecta: endDate/description/imageUrl/timestamps).
export const ActivityDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  location: z.string(),
  date: z.string(), // ISO 8601
  endDate: z.string().nullable(), // ISO 8601 | null
  capacity: z.number().int(),
  enrolledCount: z.number().int(),
  status: ActivityStatusSchema,
  description: z.string(),
  imageUrl: z.string().nullable(),
  category: z.string().nullable(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});
export type ActivityDetail = z.infer<typeof ActivityDetailSchema>;

export const ActivityCreateResponseSchema = z.object({ activity: ActivityDetailSchema });
export type ActivityCreateResponse = z.infer<typeof ActivityCreateResponseSchema>;

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

// Cohortes del listado de usuarios (User Intelligence UI-1). Reglas:
//   all          → sin filtro
//   frequent     → visit_count >= 3 (regla v1 fija)
//   new7d        → created_at en los últimos 7 días
//   noEmail      → email IS NULL
//   noCredential → email IS NOT NULL AND credential_sent_at IS NULL
//   active       → última visita (MAX checked_in_at) dentro de 30 días
//   dormant      → última visita > 90 días O NUNCA visitó
// Zona intermedia 31–90 días: SIN etiqueta active/dormant (status = null).
export const USER_COHORTS = ['all', 'frequent', 'new7d', 'noEmail', 'noCredential', 'active', 'dormant'] as const;
export const UserCohortSchema = z.enum(USER_COHORTS);
export type UserCohort = z.infer<typeof UserCohortSchema>;

// Estado derivado de actividad (solo lectura). null = zona intermedia 31–90 días.
export const UserActivityStatusSchema = z.enum(['active', 'dormant']);
export type UserActivityStatus = z.infer<typeof UserActivityStatusSchema>;

// Fila del listado: User + enriquecimiento de inteligencia (última visita, estado
// de credencial, estado de actividad derivado). El detalle (UserDetailResponse)
// sigue usando UserSchema crudo (el perfil completo es UI-2).
export const UserListItemSchema = UserSchema.extend({
  lastVisitAt: z.string().nullable(),       // ISO 8601 | null (nunca visitó)
  credentialSentAt: z.string().nullable(),  // ISO 8601 | null (sin enviar / sin email)
  status: UserActivityStatusSchema.nullable(), // null = intermedia 31–90 días
});
export type UserListItem = z.infer<typeof UserListItemSchema>;

export const UsersListResponseSchema = z.object({
  items: z.array(UserListItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type UsersListResponse = z.infer<typeof UsersListResponseSchema>;

// Conteos exactos por cohorte (endpoint facets), tenant-scoped, dentro de la
// búsqueda `q` vigente (no del cohorte vigente: cada pill muestra su propio total).
export const UsersFacetsResponseSchema = z.object({
  counts: z.object({
    all: z.number().int(),
    frequent: z.number().int(),
    new7d: z.number().int(),
    noEmail: z.number().int(),
    noCredential: z.number().int(),
    active: z.number().int(),
    dormant: z.number().int(),
  }),
});
export type UsersFacetsResponse = z.infer<typeof UsersFacetsResponseSchema>;

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

// ─────────────────────────────────────────────────────────────────────────
// Slice PÚBLICO read-only de api-v2 (kiosko · PR v2/api-public-reads).
// Tenant por host, SIN auth de staff. Shapes deliberadamente REDUCIDOS para
// la superficie pública. Paridad con v1 (backend/src/routes/public.js):
//   publicActivity = { type, category, …, enrolledCount } · filtro cupo
//   publicUser     = { firstName, lastName, code, visitCount } · SIN PII extra
// ─────────────────────────────────────────────────────────────────────────

// Actividad visible al público (status activa + con cupo). Mismo type/category
// que el endpoint staff; sin description ni campos internos.
export const PublicActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  category: z.string().nullable(),
  location: z.string(),
  date: z.string(), // ISO 8601; el cliente formatea
  capacity: z.number().int(),
  enrolledCount: z.number().int(),
  imageUrl: z.string().nullable(),
});
export type PublicActivity = z.infer<typeof PublicActivitySchema>;

export const PublicActivitiesResponseSchema = z.object({
  activities: z.array(PublicActivitySchema),
  total: z.number().int(),
});
export type PublicActivitiesResponse = z.infer<typeof PublicActivitiesResponseSchema>;

// Lookup público de visitante: SOLO lo mínimo para confirmar identidad en el
// kiosko. NUNCA email, phone, id ni tokens (anti-enumeración/leak de PII).
export const PublicVisitorSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  code: z.string(),
  visitCount: z.number().int(),
});
export type PublicVisitor = z.infer<typeof PublicVisitorSchema>;

export const PublicVisitorLookupResponseSchema = z.object({ visitor: PublicVisitorSchema });
export type PublicVisitorLookupResponse = z.infer<typeof PublicVisitorLookupResponseSchema>;

// Check-in público (escritura · POST /api/v2/public/checkin). El visitante se
// identifica por código, por email, o se registra como nuevo (un solo adulto
// por check-in; sólo niños como acompañantes). Tope server-side de niños.
export const MAX_COMPANIONS_CHILDREN = 10;

export const PublicCheckinRequestSchema = z.object({
  activityId: z.string().min(1),
  visitor: z.union([
    z.object({ code: z.string().min(1) }),
    z.object({ email: z.string().email() }),
    z.object({
      new: z.object({
        firstName: z.string().min(1).max(120),
        lastName: z.string().min(1).max(120),
        email: z.string().email().optional(),
        phone: z.string().max(40).optional(),
      }),
    }),
  ]),
  companionsChildren: z.number().int().min(0).max(MAX_COMPANIONS_CHILDREN),
});
export type PublicCheckinRequest = z.infer<typeof PublicCheckinRequestSchema>;

export const PublicCheckinResponseSchema = z.object({
  code: z.string(),          // código real del visitante (QR = este valor)
  visitCount: z.number().int(),
  partySize: z.number().int(), // 1 + companionsChildren (cupos descontados)
  activity: z.object({ id: z.string(), name: z.string() }),
});
export type PublicCheckinResponse = z.infer<typeof PublicCheckinResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Check-in administrativo (LECTURA · Check-in A). Consola operativa del staff
// autenticado. "Hoy" usa una zona horaria única de app (CHECKIN_TZ, default
// America/Santo_Domingo) porque v2 NO tiene timezone por tenant; los "últimos
// 10 min" son absolutos. serverNow corrige discrepancias de reloj del cliente.
// ─────────────────────────────────────────────────────────────────────────
export const CheckinMetricsResponseSchema = z.object({
  metrics: z.object({
    checkinsToday: z.number().int(),
    checkinsLast10Min: z.number().int(),
    uniqueVisitorsToday: z.number().int(),
    activeActivities: z.number().int(),
  }),
  serverNow: z.string(), // ISO 8601
  timezone: z.string(), // tz usada para "hoy"
});
export type CheckinMetricsResponse = z.infer<typeof CheckinMetricsResponseSchema>;

export const CheckinActivityItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  date: z.string(), // ISO 8601
  capacity: z.number().int(),
  enrolledCount: z.number().int(),
  available: z.number().int(), // max(0, capacity - enrolledCount)
  occupancyPct: z.number().int(),
  recentMovement: z.number().int(), // check-ins en los últimos 10 min
  full: z.boolean(),
});
export type CheckinActivityItem = z.infer<typeof CheckinActivityItemSchema>;
export const CheckinActivitiesResponseSchema = z.object({
  items: z.array(CheckinActivityItemSchema),
  serverNow: z.string(),
});
export type CheckinActivitiesResponse = z.infer<typeof CheckinActivitiesResponseSchema>;

// Respuesta mínima de búsqueda: lo necesario para identificar/seleccionar al
// visitante. NO incluye teléfono (PII innecesaria para el check-in).
export const CheckinVisitorItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  visitCount: z.number().int(),
});
export type CheckinVisitorItem = z.infer<typeof CheckinVisitorItemSchema>;
export const CheckinVisitorsResponseSchema = z.object({ items: z.array(CheckinVisitorItemSchema) });
export type CheckinVisitorsResponse = z.infer<typeof CheckinVisitorsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Check-in administrativo · ESCRITURA autenticada (Check-in B). Schemas SEPARADOS
// (no se reutilizan los públicos). .strict() rechaza campos prohibidos del cliente
// (organizationId/enrolledCount/userId directo/actor). El actor/tenant salen de la
// sesión (requireTenantStaff), nunca del body.
// ─────────────────────────────────────────────────────────────────────────
const AdminCheckinVisitorSchema = z.union([
  z.object({ code: z.string().min(1) }).strict(),
  z.object({ email: z.string().email() }).strict(),
  z.object({
    new: z.object({
      firstName: z.string().trim().min(1).max(120),
      lastName: z.string().trim().min(1).max(120),
      email: z.string().email().optional(),
      phone: z.string().max(40).optional(),
    }).strict(),
  }).strict(),
]);
export const AdminCheckinRequestSchema = z.object({
  activityId: z.string().min(1),
  visitor: AdminCheckinVisitorSchema,
  companionsChildren: z.number().int().min(0).max(10),
}).strict();
export type AdminCheckinRequest = z.infer<typeof AdminCheckinRequestSchema>;
export const AdminCheckinResponseSchema = z.object({
  code: z.string(),
  visitCount: z.number().int(),
  partySize: z.number().int(),
  activity: z.object({ id: z.string(), name: z.string() }),
  mode: z.enum(['existing', 'new']),
});
export type AdminCheckinResponse = z.infer<typeof AdminCheckinResponseSchema>;

export const AdminAnonymousCheckinRequestSchema = z.object({
  activityId: z.string().min(1),
}).strict();
export type AdminAnonymousCheckinRequest = z.infer<typeof AdminAnonymousCheckinRequestSchema>;
export const AdminAnonymousCheckinResponseSchema = z.object({
  attendanceId: z.string(),
  activity: z.object({ id: z.string(), name: z.string() }),
  mode: z.literal('anonymous'),
  replay: z.boolean(), // true si devolvió el resultado original (Idempotency-Key repetida)
});
export type AdminAnonymousCheckinResponse = z.infer<typeof AdminAnonymousCheckinResponseSchema>;
