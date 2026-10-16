// pages/contacto/enviado.tsx · destino del form nativo (303) tras un envío OK.
// Estática, noindex, sin runtime JS.
import Head from 'next/head';
import { landing } from '../../content/landing';

export const config = { unstable_runtimeJS: false };

export default function ContactoEnviado() {
  const { contact } = landing;
  return (
    <>
      <Head>
        <title>{contact.successTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold">{contact.successTitle}</h1>
        <p className="mt-3 text-muted">{contact.successBody}</p>
        <a href="/" className="mt-6 inline-block font-medium text-brand-text underline">Volver al inicio</a>
      </main>
    </>
  );
}
