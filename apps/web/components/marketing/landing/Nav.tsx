// Nav · encabezado fijo: wordmark, anclas, "Iniciar sesión" y CTA primario.
import type { LandingContent } from '../../../content/landing.types';
import { Cta } from './Cta';

export function Wordmark() {
  return (
    <a className="wordmark" href="/" aria-label="contan2, inicio">
      contan<b>2</b>
    </a>
  );
}

export function Nav({ content }: { content: LandingContent['nav'] }) {
  return (
    <header className="nav">
      <div className="container nav__row">
        <Wordmark />
        <nav className="nav__links" aria-label="Secciones">
          {content.links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="nav__actions">
          <a className="nav__login" href={content.login.href}>
            {content.login.label}
          </a>
          <Cta cta={content.primary} size="sm" />
        </div>
      </div>
    </header>
  );
}
