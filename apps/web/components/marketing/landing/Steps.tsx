// Steps · "Cómo funciona": numeración solo donde hay secuencia real.
import type { LandingContent } from '../../../content/landing.types';

export function Steps({ content }: { content: LandingContent['steps'] }) {
  return (
    <section id="como-funciona" className="section section--flush" aria-labelledby="steps-title">
      <div className="container">
        <div className="section__head">
          <h2 id="steps-title">{content.heading}</h2>
        </div>
        <ol className="steps">
          {content.items.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step__n" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
