// Problem · "Hoy" frente a "Con contan2", sin tarjetas ni íconos decorativos.
import type { LandingContent } from '../../../content/landing.types';

export function Problem({ content }: { content: NonNullable<LandingContent['problem']> }) {
  return (
    <section className="section" aria-labelledby="problem-title">
      <div className="container">
        <div className="section__head">
          <h2 id="problem-title">{content.heading}</h2>
        </div>
        <div className="compare">
          <div className="compare__labels" aria-hidden="true">
            <span>{content.labels.before}</span>
            <span>{content.labels.after}</span>
          </div>
          <ul>
            {content.rows.map((r) => (
              <li key={r.before} className="compare__row">
                <p className="compare__before" data-label={`${content.labels.before} · `}>
                  {r.before}
                </p>
                <p className="compare__after">{r.after}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
