// apps/api-v2/src/services/reports/labels.ts · vocabulario EXACTO del
// departamento para el libro "Registro_Actividades_Culturales" (decisión del
// dueño P5, auditoría REP-A13). Una sola fuente: el registro mensual/anual, sus
// listas ocultas (dropdowns) y el pivote "Resumen Mensual" salen de aquí.

// Los 5 tipos del departamento, en el orden de su plantilla.
export const TIPO_ORDER = ['Cine', 'Teatro', 'Talleres', 'Charlas', 'Actividades Especiales'] as const;
export type RegisterTipo = (typeof TIPO_ORDER)[number];

// `activities.type` (contrato) → tipo del departamento. Lo no mapeado cae en
// "Actividades Especiales".
export const TIPO_LABEL: Record<string, RegisterTipo> = {
  cine: 'Cine',
  teatro: 'Teatro',
  taller: 'Talleres',
  conferencia: 'Charlas',
  tertulia: 'Charlas', // conversación/charla en el vocabulario del depto
  concierto: 'Actividades Especiales',
  exposicion: 'Actividades Especiales',
  visita_guiada: 'Actividades Especiales',
  cuentacuentos: 'Actividades Especiales',
  otro: 'Actividades Especiales',
};
export const tipoLabel = (t: string): RegisterTipo => TIPO_LABEL[t] ?? 'Actividades Especiales';

// Programa de una actividad sin ciclo/categoría.
export const PROGRAMA_SIN_CICLO = 'Actividades Especiales';

// Programas oficiales del departamento (siempre disponibles en el dropdown).
export const PROGRAMAS_DEPTO = [
  'Ciclo de Cine Dominicano',
  'Ciclo de Cine Clásico',
  'Temporada de Teatro',
  'Ciclo de Cine de Embajada',
  'Proyecciones fuera de ciclo',
  'Otras Obras de teatro',
  'Actividades Especiales',
] as const;

export const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;
export const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;
export const monthNameEs = (m: number): string => MESES_ES[m - 1] ?? '';

// Semana del mes: vocabulario 1–5.
export const SEMANAS = [1, 2, 3, 4, 5] as const;
