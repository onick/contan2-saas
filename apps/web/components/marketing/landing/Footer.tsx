// Footer · enlaces reales solo a destinos que existen. Privacidad y Términos
// van como texto con su nota hasta que haya documentos publicados.
import type { LandingContent } from '../../../content/landing.types';
import { Wordmark } from './Nav';

export function Footer({ content }: { content: LandingContent['footer'] }) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Wordmark />
            {content.tagline ? <p>{content.tagline}</p> : null}
          </div>
          {(content.groups ?? []).map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2>{g.title}</h2>
              <ul>
                {g.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <a href={l.href}>{l.label}</a>
                    ) : (
                      <span className="footer__soon">
                        {l.label}
                        {l.note ? <small> {l.note}</small> : null}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer__bottom">
          <span>{content.legal}</span>
          {content.origin ? <span>{content.origin}</span> : null}
        </div>
      </div>
    </footer>
  );
}
