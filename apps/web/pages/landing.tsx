// pages/landing.tsx · landing pública de contan2.com. Se sirve en `/` (el proxy
// hace rewrite por host). HTML pre-renderizado en build, SIN runtime JS
// (decisión A0 del spike: unstable_runtimeJS = false → 0 scripts de /_next).
// Nunca poner tests dentro de pages/: todo archivo acá es una ruta.
import { LandingPage } from '../components/marketing/landing/LandingPage';
import { SeoHead } from '../components/marketing/landing/SeoHead';
import { landing } from '../content/landing';
import { buildLandingSeo } from '../lib/marketing/seo';

export const config = { unstable_runtimeJS: false };

const seo = buildLandingSeo(landing);

export default function Landing() {
  return (
    <>
      <SeoHead seo={seo} />
      <LandingPage content={landing} />
    </>
  );
}
