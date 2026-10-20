'use client';

// apps/web/components/checkin/LiveClock.tsx · reloj local de la consola de check-in
// (hora de la tablet de recepción, con segundos). Tick de 1 s que re-renderiza SOLO
// este componente: la consola no se entera. "Ahora" solo existe en el cliente: el SSR
// y el primer render del cliente pintan el mismo placeholder y la hora real entra
// tras montar (evita el error de hidratación #418).

import { useEffect, useState } from 'react';

export const CLOCK_PLACEHOLDER = '--:--:--';

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);
  const text = now ? now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : CLOCK_PLACEHOLDER;
  return (
    <div className="text-right leading-tight">
      <p data-testid="checkin-clock" className="num text-[22px] font-medium tabular-nums tracking-tight text-ink md:text-[26px]">{text}</p>
      <p className="text-[12px] text-faint">Hora local</p>
    </div>
  );
}
