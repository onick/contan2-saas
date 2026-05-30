// Datos LOCALES de la pantalla Segmentos (/app/segmentos). Estáticos: no hay
// /api/v2. Solo conteos AGREGADOS por segmento (sin listar visitantes → sin
// PII). Valores demo inspirados en la operación del CCB.

import type { LucideIcon } from 'lucide-react';
import { Repeat, UserPlus, Film, UserMinus, Star, Mail } from 'lucide-react';

export type SegmentType = 'dinamico' | 'estatico';

export interface Segment {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  members: number;
  audiencePct: number;
  rules: string[];
  type: SegmentType;
  typeLabel: string;
  updated: string;
}

export interface SegmentKpi {
  key: string;
  label: string;
  value: string;
}

export const SEGMENT_KPIS: SegmentKpi[] = [
  { key: 'total', label: 'Total segmentos', value: '6' },
  { key: 'audiencia', label: 'Audiencia total', value: '1,842' },
  { key: 'dinamicos', label: 'Dinámicos', value: '5' },
];

export const SEGMENTS: Segment[] = [
  { id: 'recurrentes', name: 'Recurrentes', description: 'Visitaron 2 o más veces', icon: Repeat, members: 312, audiencePct: 17, rules: ['2+ visitas'], type: 'dinamico', typeLabel: 'Dinámico', updated: 'Actualizado hace 1 h' },
  { id: 'nuevos', name: 'Nuevos este mes', description: 'Alta en los últimos 30 días', icon: UserPlus, members: 1181, audiencePct: 64, rules: ['registro ≤ 30 días'], type: 'dinamico', typeLabel: 'Dinámico', updated: 'Actualizado hace 1 h' },
  { id: 'cine', name: 'Asistentes a Cine', description: 'Asistieron a actividades de Cine', icon: Film, members: 540, audiencePct: 29, rules: ['categoría = Cine'], type: 'dinamico', typeLabel: 'Dinámico', updated: 'Actualizado hace 3 h' },
  { id: 'inactivos', name: 'Inactivos 90 días', description: 'Sin asistir hace 90+ días', icon: UserMinus, members: 220, audiencePct: 12, rules: ['última visita > 90 días'], type: 'dinamico', typeLabel: 'Dinámico', updated: 'Actualizado ayer' },
  { id: 'vip', name: 'Invitados VIP', description: 'Lista curada para eventos especiales', icon: Star, members: 48, audiencePct: 3, rules: ['lista manual'], type: 'estatico', typeLabel: 'Estático', updated: 'Actualizado hace 2 días' },
  { id: 'boletin', name: 'Suscriptores boletín', description: 'Opt-in de correo', icon: Mail, members: 1640, audiencePct: 89, rules: ['email opt-in'], type: 'dinamico', typeLabel: 'Dinámico', updated: 'Actualizado hace 5 h' },
];
