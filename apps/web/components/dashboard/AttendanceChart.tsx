import { ATTENDANCE_SERIES, ATTENDANCE_LABELS } from '../../lib/dashboard/demoData';
import { Card } from '../ui';

// Gráfico de asistencia por semana · SVG inline (sin librería de charts). La
// curva es ILUSTRATIVA hasta conectar la serie real. Server Component.
const W = 720;
const H = 200;
const PAD = 8;

function buildPaths(series: number[]) {
  const max = 100;
  const n = series.length;
  const step = (W - PAD * 2) / (n - 1);
  const pts: Array<{ x: number; y: number }> = series.map((v, i) => ({
    x: PAD + i * step,
    y: PAD + (1 - v / max) * (H - PAD * 2),
  }));
  const first = pts[0] ?? { x: PAD, y: H / 2 };
  const last = pts[pts.length - 1] ?? first;

  // Línea suave (segmentos con control horizontal en el punto medio).
  let line = `M ${first.x},${first.y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] ?? first;
    const b = pts[i] ?? first;
    const cx = (a.x + b.x) / 2;
    line += ` C ${cx},${a.y} ${cx},${b.y} ${b.x},${b.y}`;
  }
  const area = `${line} L ${last.x},${H} L ${first.x},${H} Z`;
  return { line, area, last };
}

export function AttendanceChart() {
  const { line, area, last } = buildPaths(ATTENDANCE_SERIES);

  return (
    <Card padding="lg" className="min-w-0">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">Asistencia por semana</h3>
          <p className="text-xs text-faint">Personas registradas en puerta</p>
        </div>
        {/* Período fijo (este mes). El switch Semana/Mes/Año llega cuando exista el
            endpoint de series por período; hasta entonces no mostramos tabs inertes. */}
        <span className="hidden rounded-full bg-surface-container px-3 py-1 text-xs font-medium text-muted sm:inline-block">Este mes</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 h-[200px] w-full">
        <defs>
          <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" y1={H * g} x2={W} y2={H * g} stroke="var(--color-line)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#attFill)" />
        <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r="4.5" fill="var(--color-brand)" stroke="#fff" strokeWidth="2" />
      </svg>

      <div className="mt-2 flex justify-between px-1 text-[11px] text-faint">
        {ATTENDANCE_LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </Card>
  );
}
