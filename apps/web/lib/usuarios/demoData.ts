// Datos LOCALES de la pantalla Usuarios (ruta provisional /app/usuarios).
// Estáticos: no hay /api/v2. DATOS DEMO ficticios — los visitantes reales son
// PII y vienen de la API enmascarados; acá todos usan @example.com y nunca se
// hardcodean datos reales.

export type UserStatus = 'activo' | 'nuevo' | 'inactivo';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  code: string;
  visits: number;
  lastVisit: string;
  status: UserStatus;
  statusLabel: string;
}

export interface UserKpi {
  key: string;
  label: string;
  value: string;
  trend?: { dir: 'up' | 'down'; label: string };
}

export const USER_KPIS: UserKpi[] = [
  { key: 'total', label: 'Total usuarios', value: '1,842' },
  { key: 'nuevos', label: 'Nuevos (30 días)', value: '1,181', trend: { dir: 'up', label: '+100%' } },
  { key: 'recurrentes', label: 'Recurrentes', value: '312' },
  { key: 'retorno', label: 'Tasa de retorno', value: '27%' },
];

export const USER_TABS = ['Todos', 'Activos', 'Nuevos', 'Inactivos'] as const;

export const TOTAL_USERS = '1,842';

export const USERS: UserRow[] = [
  { id: 'u1', name: 'Sofía Méndez', email: 'sofia.m@example.com', code: 'CCB-7K2P9Q', visits: 4, lastVisit: 'hace 1 día', status: 'activo', statusLabel: 'Activo' },
  { id: 'u2', name: 'Diego Ramírez', email: 'diego.r@example.com', code: 'CCB-3H8L4M', visits: 2, lastVisit: 'hace 2 días', status: 'activo', statusLabel: 'Activo' },
  { id: 'u3', name: 'Valentina Cruz', email: 'valentina.c@example.com', code: 'CCB-9T1X6B', visits: 1, lastVisit: 'hace 3 días', status: 'nuevo', statusLabel: 'Nuevo' },
  { id: 'u4', name: 'Andrés Polanco', email: 'andres.p@example.com', code: 'CCB-5R2N7D', visits: 1, lastVisit: 'hace 4 días', status: 'nuevo', statusLabel: 'Nuevo' },
  { id: 'u5', name: 'Carla Núñez', email: 'carla.n@example.com', code: 'CCB-2W8H1K', visits: 6, lastVisit: 'hace 1 semana', status: 'activo', statusLabel: 'Activo' },
  { id: 'u6', name: 'Luis Fermín', email: 'luis.f@example.com', code: 'CCB-6P3Q4R', visits: 3, lastVisit: 'hace 2 semanas', status: 'activo', statusLabel: 'Activo' },
  { id: 'u7', name: 'Mariana Tavárez', email: 'mariana.t@example.com', code: 'CCB-8D5V3J', visits: 0, lastVisit: '—', status: 'inactivo', statusLabel: 'Inactivo' },
];
