// Constantes y formato compartidos por las piezas del dashboard de Reportes.

import {
  Film, Music, Wrench, Image as ImageIcon, Drama, Presentation, MessagesSquare, Footprints, BookOpen, type LucideIcon,
} from 'lucide-react';

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export const TYPE_COLOR: Record<string, string> = {
  cine: '#e65100', concierto: '#14b8a6', taller: '#8b5cf6', exposicion: '#10b981', teatro: '#ec4899', conferencia: '#3b6fe0',
  tertulia: '#0ea5e9', visita_guiada: '#eab308', cuentacuentos: '#f43f5e', otro: '#94a3b8',
};
export const TYPE_ICON: Record<string, LucideIcon> = {
  cine: Film, concierto: Music, taller: Wrench, exposicion: ImageIcon, teatro: Drama, conferencia: Presentation,
  tertulia: MessagesSquare, visita_guiada: Footprints, cuentacuentos: BookOpen,
};
export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const PALETTE = ['#e65100', '#14b8a6', '#8b5cf6', '#10b981', '#3b6fe0', '#ec4899', '#94a3b8'];

/** Ciclo/categoría del tenant con su cantidad de actividades (GET /reportes/api/categories). */
export interface CatItem { category: string; activities: number }
export type CatStatus = 'loading' | 'ok' | 'error' | 'forbidden';
