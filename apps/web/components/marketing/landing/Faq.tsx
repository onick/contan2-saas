// Faq · <details> nativo: se abre y cierra sin JavaScript.
import type { LandingContent } from '../../../content/landing.types';

export function Faq({ content }: { content: LandingContent['faq'] }) {
  return (
    <section id="preguntas" className="section faq" aria-labelledby="faq-title">
      <div className="container faq__grid">
        <div className="faq__aside">
          <h2 id="faq-title" className="h2">
            {content.heading}
          </h2>
          {content.aside ? (
            <p>
              {content.aside.before} <a href="#contacto">{content.aside.linkLabel}</a> {content.aside.after}
            </p>
          ) : null}
        </div>
        <div className="faq__list">
          {content.items.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <span className="plus" aria-hidden="true" />
              </summary>
              <p className="answer">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
