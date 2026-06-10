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

// PATCH /api/v2/org/branding (F5 Identidad). Solo campos permitidos, validados.
// logoUrl: null (quitar), una ruta /uploads/… o una URL https:// (sin javascript:
// ni datos arbitrarios). Colores hex #RRGGBB. SIN CSS/HTML arbitrario.
const BrandHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hex #RRGGBB');
const BrandLogo = z.union([
  z.null(),
  z.string().regex(/^\/uploads\/[\w./-]{1,200}$/),
  z.string().regex(/^https:\/\/[\w.\-/?=&%:]{1,300}$/),
]);
export const AdminBrandingUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  primaryColor: BrandHex.optional(),
  secondaryColor: BrandHex.optional(),
  sidebarTheme: z.enum(['brand', 'dark', 'light']).optional(),
  logoUrl: BrandLogo.optional(),
}).strict();
export type AdminBrandingUpdateRequest = z.infer<typeof AdminBrandingUpdateRequestSchema>;

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
  deletedAt: z.string().nullable(),         // ISO 8601 | null (archivado · F2D)
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

// Detalle del perfil (UI-2): mismo enriquecimiento que el listado (última visita,
// credencial, estado de actividad). Sin organizationId ni campos internos.
export const UserDetailResponseSchema = z.object({ user: UserListItemSchema });
export type UserDetailResponse = z.infer<typeof UserDetailResponseSchema>;

// Edición de visitante (UI-2 · F2B). PATCH PARCIAL: sólo los campos presentes se
// actualizan. Rechaza claves no editables (code/visitCount/credential/organizationId)
// vía `.strict()`. email/phone admiten null (limpiar). Al menos un campo. Sólo
// owner/admin (la API arbitra el rol). El email respeta unicidad por tenant.
export const AdminUserUpdateRequestSchema = z
  .object({
    firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
    lastName: z.string().trim().max(120),
    email: z.string().trim().email('Email inválido').max(255).nullable(),
    phone: z.string().trim().max(60).nullable(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'No hay cambios para guardar' });
export type AdminUserUpdateRequest = z.infer<typeof AdminUserUpdateRequestSchema>;

// Alta de visitante desde el padrón (S1 · paridad v1 POST /api/users). Cualquier
// staff autenticado (operator registra gente en puerta, igual que v1). El código
// se genera server-side con el code_prefix REAL del tenant (@contan2/codes, mismo
// algoritmo que v1 → continuidad de credenciales). Si trae email, se envía la
// credencial (dry-run sin RESEND_API_KEY) y se reporta el resultado honesto.
export const AdminUserCreateRequestSchema = z
  .object({
    firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
    lastName: z.string().trim().min(1, 'El apellido es obligatorio').max(120),
    email: z.string().trim().email('Email inválido').max(255).optional(),
    phone: z.string().trim().max(60).optional(),
  })
  .strict();
export type AdminUserCreateRequest = z.infer<typeof AdminUserCreateRequestSchema>;

export const AdminUserCreateResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    code: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  credential: z.enum(['sent', 'dry-run', 'skipped', 'error']),
});
export type AdminUserCreateResponse = z.infer<typeof AdminUserCreateResponseSchema>;

// Reenvío de credencial (UI-2 · F2C). Sin body (el código va en la URL); requiere
// header Idempotency-Key. Respuesta honesta:
//   sent      → enviado de verdad por Resend (credential_sent_at actualizado)
//   dry-run   → sin RESEND_API_KEY → NO se envió ni se marcó (staging por defecto)
//   skipped   → no se pudo (p. ej. sin email) — la API igual exige email (422)
//   replayed  → misma Idempotency-Key (retry/doble-click) → no se reenvió
//   error     → fallo de envío
export const AdminCredentialResendResultSchema = z.enum(['sent', 'dry-run', 'skipped', 'replayed', 'error']);
export type AdminCredentialResendResult = z.infer<typeof AdminCredentialResendResultSchema>;
export const AdminCredentialResendResponseSchema = z.object({
  result: AdminCredentialResendResultSchema,
  credentialSentAt: z.string().nullable(),
  message: z.string(),
});
export type AdminCredentialResendResponse = z.infer<typeof AdminCredentialResendResponseSchema>;

// Archivar / reactivar visitante (UI-2 · F2D). Soft-archive (deleted_at); jamás
// hard-delete. Respuesta mínima con el estado resultante.
export const AdminUserArchiveResponseSchema = z.object({
  archived: z.boolean(),
  deletedAt: z.string().nullable(),
});
export type AdminUserArchiveResponse = z.infer<typeof AdminUserArchiveResponseSchema>;

// Historial de actividades del visitante (UI-2). Incluye TODAS sus inscripciones
// (RSVP) y asistencias: `checkedInAt` es null si registró pero no asistió.
export const UserActivityHistoryItemSchema = z.object({
  activityId: z.string(),
  name: z.string(),
  type: z.string(),
  location: z.string(),
  status: ActivityStatusSchema,        // estado actual de la actividad
  registeredAt: z.string(),            // ISO 8601 (alta de la inscripción)
  checkedInAt: z.string().nullable(),  // ISO 8601 | null (no asistió / sólo RSVP)
  attended: z.boolean(),               // checked_in_at IS NOT NULL
  companionsChildren: z.number().int(),
});
export type UserActivityHistoryItem = z.infer<typeof UserActivityHistoryItemSchema>;
export const UserActivityHistoryResponseSchema = z.object({
  items: z.array(UserActivityHistoryItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type UserActivityHistoryResponse = z.infer<typeof UserActivityHistoryResponseSchema>;

// Afinidad/intereses derivados ON-DEMAND (UI-2): agregados de las actividades a las
// que el visitante REALMENTE asistió (checked_in_at IS NOT NULL). Sin materializar.
export const AffinityBucketSchema = z.object({ key: z.string(), count: z.number().int() });
export type AffinityBucket = z.infer<typeof AffinityBucketSchema>;
export const UserAffinityResponseSchema = z.object({
  byType: z.array(AffinityBucketSchema),
  byCategory: z.array(AffinityBucketSchema),
  byLocation: z.array(AffinityBucketSchema),
  totalAttended: z.number().int(),
  lastVisitAt: z.string().nullable(),
  status: UserActivityStatusSchema.nullable(),
});
export type UserAffinityResponse = z.infer<typeof UserAffinityResponseSchema>;

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

// Respuesta del lookup: 1 hallado → { visitor }; HOMÓNIMOS por nombre completo
// (2..5) → { matches } para que el visitante elija en el kiosko.
export const PublicVisitorLookupResponseSchema = z.union([
  z.object({ visitor: PublicVisitorSchema }),
  z.object({ matches: z.array(PublicVisitorSchema).min(2).max(5) }),
]);
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

// ── Dashboard overview · período + deltas + serie (S2, paridad v1 stats) ──
const OverviewMetricSchema = z.object({ current: z.number(), previous: z.number(), deltaPct: z.number() });
const OverviewActivitySchema = z.object({
  id: z.string(), name: z.string(), type: z.string(), category: z.string().nullable(),
  location: z.string(), date: z.string(), capacity: z.number().int(),
  enrolledCount: z.number().int(), imageUrl: z.string().nullable(),
});
export const DashboardOverviewResponseSchema = z.object({
  period: z.enum(['today', '7d', '30d', '90d']),
  series: z.array(z.object({ date: z.string(), value: z.number().int() })),
  attendance: OverviewMetricSchema,
  newVisitors: OverviewMetricSchema,
  avgOccupancyPct: OverviewMetricSchema,
  returnRatePct: OverviewMetricSchema,
  upcoming: OverviewActivitySchema.nullable(),
  featured: OverviewActivitySchema.extend({ periodAttendances: z.number().int() }).nullable(),
  insights: z.array(z.object({
    type: z.enum(['low_enrollment', 'near_full', 'empty_activities']),
    severity: z.enum(['warning', 'info']),
    title: z.string(),
    message: z.string(),
  })),
});
export type DashboardOverviewResponse = z.infer<typeof DashboardOverviewResponseSchema>;

// ── Reportes operativos (F4) ──────────────────────────────────────────────
export const ReportAttendanceRowSchema = z.object({
  activityId: z.string(),
  name: z.string(),
  date: z.string(), // ISO
  location: z.string(),
  category: z.string().nullable(),
  status: z.string(),
  capacity: z.number().int(),
  enrolledCount: z.number().int(),
  attendances: z.number().int(),
  people: z.number().int(),
  anonymous: z.number().int(),
  occupancyPct: z.number().int(),
});
export type ReportAttendanceRow = z.infer<typeof ReportAttendanceRowSchema>;

export const ReportAttendanceByActivityResponseSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  totals: z.object({
    activities: z.number().int(),
    attendances: z.number().int(),
    people: z.number().int(),
    anonymous: z.number().int(),
    capacity: z.number().int(),
    occupancyPct: z.number().int(),
  }),
  rows: z.array(ReportAttendanceRowSchema),
});
export type ReportAttendanceByActivityResponse = z.infer<typeof ReportAttendanceByActivityResponseSchema>;

// ── Historial · log de auditoría del tenant (F5) ───────────────────────────
export const AuditLogItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  action: z.string(),
  actorEmailMasked: z.string().nullable(),
  actorRole: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  targetLabel: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

export const AuditLogResponseSchema = z.object({
  items: z.array(AuditLogItemSchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

// ── Mi equipo · staff_members (F5) ─────────────────────────────────────────
export const TeamMemberSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamListResponseSchema = z.object({
  items: z.array(TeamMemberSchema),
  nextCursor: z.string().nullable(),
});
export type TeamListResponse = z.infer<typeof TeamListResponseSchema>;

export const TeamRoleUpdateRequestSchema = z.object({ role: z.enum(['owner', 'admin', 'operator']) }).strict();
export type TeamRoleUpdateRequest = z.infer<typeof TeamRoleUpdateRequestSchema>;
export const TeamStatusUpdateRequestSchema = z.object({ status: z.enum(['active', 'suspended']) }).strict();
export type TeamStatusUpdateRequest = z.infer<typeof TeamStatusUpdateRequestSchema>;
export const TeamMutationResponseSchema = z.object({ id: z.string(), role: z.string().optional(), status: z.string().optional() });
export type TeamMutationResponse = z.infer<typeof TeamMutationResponseSchema>;
