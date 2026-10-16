// ContactSection · formulario de contacto (mockup landing-v2 §9). Server
// Component puro: form NATIVO `POST /api/contact` (funciona sin JS; la ruta
// responde 303 a /contacto/enviado|error). Un script inline ≤3 KB
// (lib/marketing/contact-form) lo mejora: fetch JSON + región aria-live.
// La validación HTML espeja ContactRequestSchema (packages/contracts):
// name 2–120, organization 2–160, email ≤255, message ≤2000 (opcional),
// honeypot `fax`.
// Contrato visual con FinalCta (bloque B): esta sección es hija directa de
// `.final-cta .container`; sus hijos directos son h2, p, p y form, y
// `styles/landing.css` (.final-cta …) aporta banda oscura, grilla 5fr/6fr,
// tarjeta blanca del formulario, inputs y botón. Nada de colores sueltos aquí:
// todo sale de los tokens con alcance `.landing`.
import type { LandingContent } from '../../../content/landing.types';
import { contactFormInlineScript } from '../../../lib/marketing/contact-form';
import { Button } from '../../ui/Button';

const FORM_ID = 'contacto-form';
const LIVE_ID = 'contacto-estado';

const hint = 'mt-1.5 block text-sm text-[var(--color-landing-muted)]';
const control = 'block w-full';

export function ContactSection({ content }: { content: LandingContent['contact'] }) {
  const okText = `${content.successTitle.replace(/[.!?\s]+$/, '')}. ${content.successBody}`;
  return (
    <section id="contacto" aria-labelledby="contacto-titulo">
      <h2 id="contacto-titulo">{content.heading}</h2>
      <p>{content.body}</p>
      <p>
        ¿Prefieres el correo? Escríbenos a{' '}
        <a href={`mailto:${content.fallbackEmail}`}>{content.fallbackEmail}</a>
      </p>

      <form
        id={FORM_ID}
        method="post"
        action="/api/contact"
        data-live={LIVE_ID}
        data-ok={okText}
        data-err={content.errorBody}
        data-sending="Enviando…"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-name">Nombre</label>
            <input
              id="c-name" name="name" type="text" required minLength={2} maxLength={120}
              autoComplete="name" placeholder="Tu nombre y apellido" className={control}
            />
          </div>
          <div>
            <label htmlFor="c-org">Institución</label>
            <input
              id="c-org" name="organization" type="text" required minLength={2} maxLength={160}
              autoComplete="organization" placeholder="Centro, museo o fundación" className={control}
            />
          </div>
        </div>
        <div>
          <label htmlFor="c-email">Correo</label>
          <input
            id="c-email" name="email" type="email" required maxLength={255}
            autoComplete="email" placeholder="nombre@institucion.org" className={control}
          />
        </div>
        <div>
          <label htmlFor="c-msg">
            Mensaje <span className="font-normal text-[var(--color-landing-muted)]">(opcional)</span>
          </label>
          <textarea
            id="c-msg" name="message" maxLength={2000} rows={4} aria-describedby="c-msg-hint"
            placeholder="Qué tipo de actividades organizan y cuántas personas reciben al mes"
            className={control}
          />
          <span id="c-msg-hint" className={hint}>Hasta 2,000 caracteres.</span>
        </div>
        {/* Honeypot: fuera de pantalla, fuera del orden de tabulación y oculto a lectores de pantalla. */}
        <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="c-fax">No completar</label>
          <input id="c-fax" name="fax" type="text" tabIndex={-1} autoComplete="off" maxLength={200} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <Button type="submit" variant="primary" size="lg" className="min-h-12 rounded-full disabled:opacity-60">
            Solicitar una demo
          </Button>
          <p className="text-sm text-[var(--color-landing-muted)]">Usaremos estos datos solo para responder a tu solicitud.</p>
        </div>
        {/* Región viva: el script inline escribe aquí el resultado (éxito o error). */}
        <div
          id={LIVE_ID}
          role="status"
          aria-live="polite"
          className="min-h-6 text-base font-semibold data-[state=error]:text-[var(--color-brand-strong)]"
        />
      </form>
      <script dangerouslySetInnerHTML={{ __html: contactFormInlineScript(FORM_ID) }} />
    </section>
  );
}
