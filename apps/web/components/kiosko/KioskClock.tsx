'use client';

import { useEffect, useState } from 'react';

// Reloj del welcome · tiempo fino gigante + AM/PM en superíndice + fecha
// "Martes, 13/10/2026" en text-brand-text. Usa la clase .num (Plex Mono +
// tabular-nums definida en globals.css). Sin cambiar el intervalo de 10 s.
const DATE_WEEKDAY = new Intl.DateTimeFormat('es-DO', { weekday: 'long' });
const DATE_NUMERIC = new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatDate(now: Date): string {
  const weekday = DATE_WEEKDAY.format(now);
  const numeric = DATE_NUMERIC.format(now);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${numeric}`;
}

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
  const date = now ? formatDate(now) : ' ';

  return (
    <div className="text-center" aria-hidden={now === null}>
      <div className="num font-extralight leading-none tracking-[-0.04em] text-ink text-[clamp(4.5rem,17vw,10.5rem)]">
        {p.main}
        {p.ampm ? (
          <span className="ml-2 align-baseline font-light text-muted text-[clamp(2rem,6vw,4rem)]">{p.ampm}</span>
        ) : null}
      </div>
      <div className="num mt-5 text-[13px] font-medium tracking-[0.32em] text-muted md:text-[15px]">
        {date}
      </div>
    </div>
  );
}
