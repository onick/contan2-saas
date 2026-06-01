// Datos LOCALES de la pantalla Reportes (/app/reportes). Estáticos: no hay
// /api/v2. La generación y descarga real se cablean luego. Operador genérico
// ("Administración"), sin PII.

import type { LucideIcon } from 'lucide-react';
import { ClipboardCheck, CalendarRange, CalendarDays, BarChart3, UserPlus, Layers, FileText, FileSpreadsheet } from 'lucide-react';

export type ReportFormat = 'PDF' | 'Excel';

export interface ReportTemplate {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  formats: ReportFormat[];
}

export interface RecentReport {
  id: string;
  name: string;
  type: string;
  period: string;
  generated: string;
  by: string;
  format: ReportFormat;
  size: string;
}

export const REPORT_TYPES = ['Asistencia', 'Ocupación', 'Por actividad', 'Mensual', 'Anual'] as const;

export const REPORT_TEMPLATES: ReportTemplate[] = [
  { id: 'asistencia', title: 'Asistencia por actividad', description: 'Asistentes, ocupación y no-show por evento', icon: ClipboardCheck, formats: ['PDF', 'Excel'] },
  { id: 'mensual', title: 'Resumen mensual', description: 'Métricas clave del mes con comparativo', icon: CalendarDays, formats: ['PDF', 'Excel'] },
  { id: 'anual', title: 'Resumen anual', description: 'Consolidado del año por categoría', icon: CalendarRange, formats: ['PDF', 'Excel'] },
  { id: 'ocupacion', title: 'Ocupación', description: 'Cupo usado por actividad y promedio del período', icon: BarChart3, formats: ['PDF', 'Excel'] },
  { id: 'nuevos', title: 'Visitantes nuevos', description: 'Altas y recurrencia en el período', icon: UserPlus, formats: ['PDF', 'Excel'] },
  { id: 'segmento', title: 'Por segmento', description: 'Comportamiento de un segmento de audiencia', icon: Layers, formats: ['PDF', 'Excel'] },
];

export const RECENT_REPORTS: RecentReport[] = [
  { id: 'rr1', name: 'Asistencia · Los Congos de Villa Mella', type: 'Por actividad', period: '12 may 2026', generated: 'hace 2 h', by: 'Administración', format: 'PDF', size: '240 KB' },
  { id: 'rr2', name: 'Resumen mensual', type: 'Mensual', period: 'Mayo 2026', generated: 'hace 1 día', by: 'Administración', format: 'Excel', size: '84 KB' },
  { id: 'rr3', name: 'Ocupación', type: 'Ocupación', period: 'Últimos 30 días', generated: 'hace 3 días', by: 'Administración', format: 'PDF', size: '180 KB' },
  { id: 'rr4', name: '5to Ciclo de Cine Dominicano', type: 'Por actividad', period: '—', generated: 'hace 1 semana', by: 'Administración', format: 'Excel', size: '96 KB' },
];

// Íconos por formato (para chips/filas).
export const FORMAT_ICON: Record<ReportFormat, LucideIcon> = {
  PDF: FileText,
  Excel: FileSpreadsheet,
};
