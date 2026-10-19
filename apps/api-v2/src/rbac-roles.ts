// Conjuntos de roles compartidos para el RBAC de la API (B9 + residuales Q3).
// Una sola fuente de verdad: los handlers los componen con requireRole().
import { REPORT_READ_ROLE_LIST, REPORT_EXPORT_ROLE_LIST, PROTOCOL_REPORT_ROLE_LIST, REPORT_CONTACT_ROLE_LIST } from '@contan2/contracts';

// Lectura de PII del padrón (nombre, correo, teléfono, código de carné).
export const PADRON_READ_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'operator', 'consulta', 'puerta']);

// Escrituras de puerta / check-in.
export const DOOR_WRITE_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'operator', 'puerta']);

// Protocolo busca personas para designarlas, pero SOLO ve una proyección sin PII
// sensible (ver /checkin/visitors). Se usa para abrir esa ruta, no el padrón.
export const VISITOR_SEARCH_ROLES: ReadonlySet<string> = new Set([...PADRON_READ_ROLES, 'protocolo']);

// ── Reportes (REP-A14) · la API es la fuente de verdad; la web importa las mismas listas ──
// Lectura del dashboard: period-summary, categories y el Asistente.
export const REPORT_READ_ROLES: ReadonlySet<string> = new Set(REPORT_READ_ROLE_LIST);
// Generar/descargar informes (xlsx/pdf/csv). 'puerta' los descarga (su operación).
export const REPORT_EXPORT_ROLES: ReadonlySet<string> = new Set(REPORT_EXPORT_ROLE_LIST);
// Reporte de protocolo: owner/admin y el rol 'protocolo' (gestiona su módulo).
export const PROTOCOL_REPORT_ROLES: ReadonlySet<string> = new Set(PROTOCOL_REPORT_ROLE_LIST);
// Correo/teléfono de asistentes en el informe por actividad (solo owner/admin).
export const REPORT_CONTACT_ROLES: ReadonlySet<string> = new Set(REPORT_CONTACT_ROLE_LIST);
