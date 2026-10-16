// apps/web/lib/marketing/fonts.ts · ÚNICA definición de la fuente de marca del
// embudo público (landing + SignupModal). Fraunces es PLACEHOLDER: el mockup
// aprobado puede cambiarla; al hacerlo se cambia solo este archivo.
// Mantener la lista de pesos/estilos mínima: cada variante suma un woff2 y el
// presupuesto permite ≤2 precargados (≤80 KB).
import { Fraunces } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  // Solo estilo normal: sumar 'italic' agrega un 2.º woff2 precargado y rompe el
  // presupuesto (≤80 KB entre todas las fuentes precargadas). Si el mockup
  // pide itálica, medir con scripts/landing/budget.mjs.
  style: ['normal'],
  display: 'swap',
});
