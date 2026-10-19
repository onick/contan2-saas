// Constantes y formato compartidos por las piezas del dashboard de Reportes.

import {
  Film, Music, Wrench, Image as ImageIcon, Drama, Presentation, MessagesSquare, Footprints, BookOpen, type LucideIcon,
} from 'lucide-react';

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export { TYPE_COLOR, PALETTE } from '../charts/palette';
export const TYPE_ICON: Record<string, LucideIcon> = {
  cine: Film, concierto: Music, taller: Wrench, exposicion: ImageIcon, teatro: Drama, conferencia: Presentation,
  tertulia: MessagesSquare, visita_guiada: Footprints, cuentacuentos: BookOpen,
};
export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Ciclo/categoría del tenant con su cantidad de actividades (GET /reportes/api/categories). */
export interface CatItem { category: string; activities: number }
export type CatStatus = 'loading' | 'ok' | 'error' | 'forbidden';
