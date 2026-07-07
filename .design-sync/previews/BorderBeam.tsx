import { BorderBeam, Card } from '@contan2/web';

// El beam se monta dentro de un contenedor `relative` con border-radius
// propio (hereda el radio vía rounded-[inherit]). Decorativo, sin JS: anillo
// conic-gradient sobre var(--color-brand-accent) que rota lento (CSS puro).
export const EnCardDestacada = () => (
  <Card interactive className="relative max-w-md">
    <BorderBeam />
    <p className="text-[15px] font-semibold text-ink">Noche de museos</p>
    <p className="mt-1 text-[13px] text-muted">
      Evento destacado · Sábado 7:00 p.m. · Entrada libre con registro
    </p>
  </Card>
);

// En un contenedor propio (cualquier caja relative + rounded).
export const EnContenedorPropio = () => (
  <div className="relative max-w-md rounded-xl border border-line bg-surface p-5">
    <BorderBeam />
    <p className="text-[13px] text-muted">
      El anillo hereda el border-radius del contenedor (rounded-xl).
    </p>
  </div>
);
