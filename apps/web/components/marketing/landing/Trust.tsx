// Trust · confianza y datos: solo lo que está en funcionamiento hoy.
import { Database, Lock, QrCode, UserCheck, type LucideIcon } from 'lucide-react';
import type { LandingContent } from '../../../content/landing.types';

const ICONS: Record<NonNullable<LandingContent['trust']['items'][number]['icon']>, LucideIcon> = {
  lock: Lock,
  database: Database,
  qr: QrCode,
  'user-check': UserCheck,
};

export function Trust({ content }: { content: LandingContent['trust'] }) {
  return (
    <section className="section trust" aria-labelledby="trust-title">
      <div className="container trust__grid">
        <div>
          <h2 id="trust-title" className="h2">
            {content.heading}
          </h2>
          {content.note ? <p className="trust__note">{content.note}</p> : null}
        </div>
        <ul className="trust__list">
          {content.items.map((it) => {
            const Icon = it.icon ? ICONS[it.icon] : null;
            return (
              <li key={it.title} className="trust__item">
                <h3>
                  {Icon ? <Icon aria-hidden="true" size={20} strokeWidth={2} /> : null}
                  {it.title}
                </h3>
                <p>{it.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
