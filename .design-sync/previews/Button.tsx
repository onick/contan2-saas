import { Button } from '@contan2/web';

// Jerarquía de acciones del admin: primary (brand-strong, AA) para el CTA,
// secondary para acciones de soporte, ghost para terciarias.
export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary">Crear actividad</Button>
    <Button variant="secondary">Exportar</Button>
    <Button variant="ghost">Cancelar</Button>
  </div>
);

// md=44px (touch target por defecto) · sm=36px (toolbars densas de desktop) ·
// lg=48px (superficies táctiles: kiosko / check-in).
export const Tamanos = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="lg">Registrar entrada</Button>
    <Button size="md">Guardar cambios</Button>
    <Button size="sm">Filtrar</Button>
  </div>
);

// variant="pill": filtros toggle (aria-pressed vía `selected`).
export const FiltrosPill = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button variant="pill" selected>Todas</Button>
    <Button variant="pill">Infantiles</Button>
    <Button variant="pill">Adultos</Button>
    <Button variant="pill">Finalizadas</Button>
  </div>
);

export const Deshabilitado = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Crear actividad</Button>
    <Button variant="secondary" disabled>Exportar</Button>
  </div>
);
