import { redirect } from 'next/navigation';

// Raíz ESTÁTICA. El ruteo por host lo decide proxy.ts ANTES de llegar acá:
//   contan2.com/ → rewrite a /landing (HTML pre-renderizado)
//   admin.*/     → /platform
//   tenant/      → /login
// Si esta página llega a ejecutarse (hosts no cubiertos por el proxy), el
// destino seguro es el login. Sin headers() ni force-dynamic a propósito.
export default function Home() {
  redirect('/login');
}
