// pages/_app.tsx · único import global de las páginas Pages Router: el CSS
// aislado de la landing (NO el globals.css del admin).
import type { AppProps } from 'next/app';
import '../styles/landing.css';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
