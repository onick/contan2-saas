import { redirect } from 'next/navigation';

// Raíz del host del tenant (ccb.contan2.com/) → directo al LOGIN del panel
// (decisión del usuario 2026-06-12: la raíz del tenant es la puerta del
// equipo, no una página pública). Si ya hay sesión, el login/middleware lo
// lleva a /app. Las superficies públicas del tenant viven en /kiosko y
// /scanner; el marketing vive en contan2.com (host aparte).
export const dynamic = 'force-dynamic';

export default function Home(): never {
  redirect('/login');
}
