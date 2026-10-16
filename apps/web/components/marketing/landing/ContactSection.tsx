// ContactSection · formulario nativo (sin JS): POST /api/contact. La validación
// HTML espeja ContactRequestSchema (packages/contracts): name 2–120,
// organization 2–160, email ≤255, message ≤2000, honeypot `fax`.
// Stub: el bloque D agrega el enhancement progresivo y el copy final.
import type { LandingContent } from '../../../content/landing.types';

export function ContactSection({ content }: { content: LandingContent['contact'] }) {
  return (
    <section id="contacto" aria-labelledby="contacto-titulo">
      <h2 id="contacto-titulo">{content.heading}</h2>
      <p>{content.body}</p>
      <form method="post" action="/api/contact">
        <label htmlFor="c-name">Nombre</label>
        <input id="c-name" name="name" type="text" required minLength={2} maxLength={120} autoComplete="name" />
        <label htmlFor="c-org">Organización</label>
        <input id="c-org" name="organization" type="text" required minLength={2} maxLength={160} autoComplete="organization" />
        <label htmlFor="c-email">Correo</label>
        <input id="c-email" name="email" type="email" required maxLength={255} autoComplete="email" />
        <label htmlFor="c-msg">Mensaje</label>
        <textarea id="c-msg" name="message" maxLength={2000} rows={4} />
        {/* Honeypot: oculto a humanos y a lectores de pantalla; los bots lo llenan. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px' }}>
          <label htmlFor="c-fax">No completar</label>
          <input id="c-fax" name="fax" type="text" tabIndex={-1} autoComplete="off" maxLength={200} />
        </div>
        <button type="submit">Enviar</button>
      </form>
    </section>
  );
}
