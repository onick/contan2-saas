// Conjuntos de roles compartidos para el RBAC de la API (B9 + residuales Q3).
// Una sola fuente de verdad: los handlers los componen con requireRole().

// Lectura de PII del padrón (nombre, correo, teléfono, código de carné).
export const PADRON_READ_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'operator', 'consulta', 'puerta']);

// Escrituras de puerta / check-in.
export const DOOR_WRITE_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'operator', 'puerta']);

// Protocolo busca personas para designarlas, pero SOLO ve una proyección sin PII
// sensible (ver /checkin/visitors). Se usa para abrir esa ruta, no el padrón.
export const VISITOR_SEARCH_ROLES: ReadonlySet<string> = new Set([...PADRON_READ_ROLES, 'protocolo']);
