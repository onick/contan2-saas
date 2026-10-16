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
        <title>{`${contact.successTitle} · contan2`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{contact.successTitle}</h1>
        <p className="mt-4 text-lg text-muted">{contact.successBody}</p>
        <p className="mt-3 text-muted">
          Si necesitas algo antes, escríbenos a{' '}
          <a className="font-semibold text-brand-text underline underline-offset-4" href={`mailto:${contact.fallbackEmail}`}>
            {contact.fallbackEmail}
          </a>
          .
        </p>
        <a
          href="/"
          className="mt-8 inline-flex min-h-12 w-fit items-center rounded-full bg-brand px-6 font-semibold text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Volver al inicio
        </a>
      </main>
    </>
  );
}
