import { IconButton } from '@contan2/web';
import { ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react';

// ghost (default) y outline; label obligatorio = nombre accesible.
export const Variantes = () => (
  <div className="flex items-center gap-3">
    <IconButton label="Editar"><Pencil size={18} /></IconButton>
    <IconButton label="Eliminar"><Trash2 size={18} /></IconButton>
    <IconButton label="Cerrar" variant="outline"><X size={18} /></IconButton>
  </div>
);

// sm (36px): solo paginación/toolbars de desktop; md (44px) es el default táctil.
export const Paginacion = () => (
  <div className="flex items-center gap-1">
    <IconButton label="Página anterior" variant="outline" size="sm"><ChevronLeft size={16} /></IconButton>
    <span className="px-2 text-[13px] text-muted">3 de 12</span>
    <IconButton label="Página siguiente" variant="outline" size="sm"><ChevronRight size={16} /></IconButton>
  </div>
);

export const Deshabilitado = () => (
  <div className="flex items-center gap-3">
    <IconButton label="Editar" disabled><Pencil size={18} /></IconButton>
    <IconButton label="Cerrar" variant="outline" disabled><X size={18} /></IconButton>
  </div>
);
