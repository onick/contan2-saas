'use client';

import { useEffect, useState } from 'react';

// Reloj en vivo de la pantalla welcome. Renderiza vacío en el primer paint
// (SSR/prerender) y setea la hora en el cliente para evitar mismatch de
// hidratación. Actualiza cada 10s (suficiente para HH:MM).
const TIME_FMT = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: true });
const DATE_FMT = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function KioskClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-center" aria-hidden={now === null}>
      <div className="text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-none tracking-tight tabular-nums text-[#f4f5f8]">
        {now ? TIME_FMT.format(now) : ' '}
      </div>
      <div className="mt-2 text-base text-[#a2a5b4] md:text-lg">
        {now ? cap(DATE_FMT.format(now)) : ' '}
      </div>
    </div>
  );
}
