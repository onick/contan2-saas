// ContactSection · formulario de contacto (mockup landing-v2 §9). Server
// Component puro: form NATIVO `POST /api/contact` (funciona sin JS; la ruta
// responde 303 a /contacto/enviado|error). Un script inline ≤3 KB
// (lib/marketing/contact-form) lo mejora: fetch JSON + región aria-live.
// La validación HTML espeja ContactRequestSchema (packages/contracts):
// name 2–120, organization 2–160, email ≤255, message ≤2000 (opcional),
// honeypot `fax`.
import type { LandingContent } from '../../../content/landing.types';
import { contactFormInlineScript } from '../../../lib/marketing/contact-form';
import { Button } from '../../ui/Button';

const FORM_ID = 'contacto-form';
const LIVE_ID = 'contacto-estado';

const label = 'mb-1.5 block text-sm font-semibold text-[#f4f3f1]';
const control =
  'block w-full rounded-[10px] border border-[#8a8f96] bg-white px-3.5 py-3 text-base text-[#16181d] ' +
  'placeholder:text-[#5b5f66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff7a2e]';
const hint = 'mt-1.5 block text-sm text-[#a9adb4]';

export function ContactSection({ content }: { content: LandingContent['contact'] }) {
  const okText = `${content.successTitle.replace(/[.!?\s]+$/, '')}. ${content.successBody}`;
  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="bg-[#16181d] py-20 text-[#f4f3f1] md:py-28">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 md:grid-cols-2 md:gap-16 md:px-8">
        <div>
          <h2 id="contacto-titulo" className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            {content.heading}
          </h2>
          <p className="mt-5 max-w-[46ch] text-lg text-[#a9adb4]">{content.body}</p>
          <p className="mt-6 text-[#a9adb4]">
            ¿Prefieres el correo? Escríbenos a{' '}
            <a className="font-semibold text-[#ff7a2e] underline underline-offset-4" href={`mailto:${content.fallbackEmail}`}>
              {content.fallbackEmail}
            </a>
          </p>
        </div>

        <div>
          <form
            id={FORM_ID}
            method="post"
            action="/api/contact"
            className="grid gap-5"
            data-live={LIVE_ID}
            data-ok={okText}
            data-err={content.errorBody}
            data-sending="Enviando…"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="c-name" className={label}>Nombre</label>
                <input
                  id="c-name" name="name" type="text" required minLength={2} maxLength={120}
                  autoComplete="name" placeholder="Tu nombre y apellido" className={control}
                />
              </div>
              <div>
                <label htmlFor="c-org" className={label}>Institución</label>
                <input
                  id="c-org" name="organization" type="text" required minLength={2} maxLength={160}
                  autoComplete="organization" placeholder="Centro, museo o fundación" className={control}
                />
              </div>
            </div>
            <div>
              <label htmlFor="c-email" className={label}>Correo</label>
              <input
                id="c-email" name="email" type="email" required maxLength={255}
                autoComplete="email" placeholder="nombre@institucion.org" className={control}
              />
            </div>
            <div>
              <label htmlFor="c-msg" className={label}>
                Mensaje <span className="font-normal text-[#a9adb4]">(opcional)</span>
              </label>
              <textarea
                id="c-msg" name="message" maxLength={2000} rows={4} aria-describedby="c-msg-hint"
                placeholder="Qué tipo de actividades organizan y cuántas personas reciben al mes"
                className={`${control} min-h-28 resize-y`}
              />
              <span id="c-msg-hint" className={hint}>Hasta 2,000 caracteres.</span>
            </div>
            {/* Honeypot: fuera de pantalla, fuera del orden de tabulación y oculto a lectores de pantalla. */}
            <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
              <label htmlFor="c-fax">No completar</label>
              <input id="c-fax" name="fax" type="text" tabIndex={-1} autoComplete="off" maxLength={200} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#c44400] px-6 text-base font-semibold text-white hover:bg-[#b33d00] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff7a2e] disabled:opacity-60"
              >
                Solicitar una demo
              </Button>
              <p className="text-sm text-[#a9adb4]">Usaremos estos datos solo para responder a tu solicitud.</p>
            </div>
          </form>
          {/* Región viva: el script inline escribe aquí el resultado (éxito o error). */}
          <div
            id={LIVE_ID}
            role="status"
            aria-live="polite"
            className="mt-5 min-h-6 text-base font-semibold text-[#f4f3f1] data-[state=error]:text-[#ffb59a]"
          />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: contactFormInlineScript(FORM_ID) }} />
    </section>
  );
}
