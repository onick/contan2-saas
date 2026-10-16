// pages/contacto/error.tsx · destino del form nativo (303) si el envío falla.
// Estática, noindex, sin runtime JS. El motivo (?motivo=…) no se lee: la página
// es la misma para todos y no muestra datos de la persona.
import Head from 'next/head';
import { landing } from '../../content/landing';

export const config = { unstable_runtimeJS: false };

export default function ContactoError() {
  const { contact } = landing;
  return (
    <>
      <Head>
        <title>No pudimos enviar tu mensaje · contan2</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">No pudimos enviar tu mensaje</h1>
        <p className="mt-4 text-lg text-muted">{contact.errorBody}</p>
        <p className="mt-3 text-muted">
          También puedes escribirnos a{' '}
          <a className="font-semibold text-brand-text underline underline-offset-4" href={`mailto:${contact.fallbackEmail}`}>
            {contact.fallbackEmail}
          </a>
          .
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/#contacto"
            className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 font-semibold text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Volver al formulario
          </a>
          <a
            href="/"
            className="inline-flex min-h-12 items-center rounded-full border border-line px-6 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Ir al inicio
          </a>
        </div>
      </main>
    </>
  );
}
