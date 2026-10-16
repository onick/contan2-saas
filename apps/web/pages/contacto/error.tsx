// pages/contacto/error.tsx · destino del form nativo (303) si el envío falla.
// Estática, noindex, sin runtime JS.
import Head from 'next/head';
import { landing } from '../../content/landing';

export const config = { unstable_runtimeJS: false };

export default function ContactoError() {
  const { contact } = landing;
  return (
    <>
      <Head>
        <title>No pudimos enviar tu mensaje</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold">No pudimos enviar tu mensaje</h1>
        <p className="mt-3 text-muted">{contact.errorBody}</p>
        <p className="mt-3 text-muted">
          También puedes escribirnos a{' '}
          <a className="font-medium text-brand-text underline" href={`mailto:${contact.fallbackEmail}`}>
            {contact.fallbackEmail}
          </a>
          .
        </p>
        <a href="/#contacto" className="mt-6 inline-block font-medium text-brand-text underline">Volver al formulario</a>
      </main>
    </>
  );
}
