// Portado de arc-library (https://github.com/kuratlielia/arc-library) · MIT © 2026 Elia Kuratli.
// Origen: registry/lib/use-today.ts @ b40c890 (2026-10-16). Adaptado a contan2: Tailwind v4 +
// tokens de marca por tenant, sin `motion` (CSS + prefers-reduced-motion), es-DO. Ver ../ATTRIBUTION.md.

import { useSyncExternalStore } from 'react';
import { DEFAULT_TZ, msUntilMidnight, todayYmd, type Ymd } from './ymd';

/**
 * "Hoy" (YMD) en la zona dada. En el servidor y durante la hidratación devuelve '' (así el HTML del servidor no
 * depende del reloj) y en el cliente pasa al día real. Se reprograma a la medianoche de la zona y al volver a la
 * pestaña, para que un tablero abierto toda la noche no se quede en el día anterior.
 */
export function useToday(timeZone: string = DEFAULT_TZ): Ymd | '' {
  return useSyncExternalStore(
    (notify) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { notify(); arm(); }, msUntilMidnight(timeZone) + 1000);
      };
      const wake = () => { notify(); arm(); };
      const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
      arm();
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', wake);
      return () => {
        if (timer) clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', wake);
      };
    },
    () => todayYmd(timeZone),
    () => '',
  );
}
