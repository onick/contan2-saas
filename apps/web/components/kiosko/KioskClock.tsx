'use client';

import { useEffect, useState } from 'react';
import { kioskMono } from './ui';

// Reloj del welcome · tiempo fino gigante + AM/PM en superíndice + fecha mono
// (tracking ancho, mayúsculas), al nivel del kiosko v1. Renderiza vacío en el
// primer paint para evitar mismatch de hidratación; setea la hora en cliente.
const DATE_FMT = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

function parts(now: Date): { main: string; ampm: string } {
  const t = now.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true });
  const m = t.match(/^(\d{1,2}:\d{2})\s*([ap]\.?\s*m\.?)?/i);
  return {
    main: m ? m[1]! : t,
    ampm: m && m[2] ? m[2].replace(/[.\s]/g, '').toUpperCase() : '',
  };
}

export function KioskClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  const p = now ? parts(now) : { main: ' ', ampm: '' };
  const date = now ? DATE_FMT.format(now) : ' ';

  return (
    <div className="text-center" aria-hidden={now === null}>
      <div className="font-extralight leading-none tracking-[-0.04em] tabular-nums text-[#f4f5f8] text-[clamp(4.5rem,17vw,10.5rem)]">
        {p.main}
        {p.ampm ? (
          <span className="ml-2 align-baseline font-light text-[#a2a5b4] text-[clamp(2rem,6vw,4rem)]">{p.ampm}</span>
        ) : null}
      </div>
      <div style={kioskMono} className="mt-5 text-[13px] font-medium uppercase tracking-[0.32em] text-[#a2a5b4] md:text-[15px]">
        {date}
      </div>
    </div>
  );
}
