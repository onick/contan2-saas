'use client';

// YearRegisterDownload · descarga del libro anual "Registro_Actividades_Culturales"
// (12 hojas Ene–Dic + Resumen Mensual con TOTAL ANUAL + listas ocultas para los
// dropdowns). Apunta al BFF /app/reportes/api/year. Montar solo para roles que
// exportan (owner/admin/puerta), igual que MonthlyRegisterCard.

import { useEffect, useState } from 'react';
import { Download, Table2 } from 'lucide-react';
import { Card, cn, focusRing } from '../ui';

const DR_TZ = 'America/Santo_Domingo';
const yearInDR = (): number => Number(new Intl.DateTimeFormat('en-CA', { timeZone: DR_TZ, year: 'numeric' }).format(new Date()));

export function YearRegisterDownload({ className }: { className?: string }) {
  // Año UTC al renderizar (servidor = cliente, sin hydration mismatch); el efecto lo lleva al de RD.
  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  useEffect(() => { setYear(yearInDR()); }, []);
  const years = Array.from({ length: 6 }, (_, i) => year - i);
  const href = `/app/reportes/api/year?year=${year}`;

  return (
    <Card padding="lg" className={className}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15.5px] font-bold tracking-tight text-ink">
            <Table2 size={16} strokeWidth={2} className="text-brand-text" /> Libro anual (formato registro)
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Descarga el año completo en el formato del departamento: una hoja por mes (Ene–Dic), la hoja «Resumen Mensual» con el total anual y listas desplegables en Tipo y Programa.
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Año</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className={cn('rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink', focusRing)}>
              {years.map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>
          </label>
          <a href={href} className={cn('inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-brand-fg hover:brightness-95', focusRing)}>
            <Download size={16} strokeWidth={1.9} /> Descargar libro anual
          </a>
        </div>
      </div>
    </Card>
  );
}
