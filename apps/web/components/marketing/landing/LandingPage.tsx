// LandingPage · Server Component PURO (sin 'use client', sin hooks): el HTML se
// pre-renderiza en build y se sirve sin runtime JS. Stub: el bloque B lo
// reemplaza por las secciones del mockup aprobado.
import Image from 'next/image';
import type { LandingContent } from '../../../content/landing.types';
import { fraunces } from '../../../lib/marketing/fonts';
import { ContactSection } from './ContactSection';

export function LandingPage({ content }: { content: LandingContent }) {
  const { hero, modules, faq, contact } = content;
  return (
    <>
      <header>
        <nav aria-label="Principal">
          {content.nav.links.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
          <a href={content.nav.login.href}>{content.nav.login.label}</a>
          <a href={content.nav.primary.href}>{content.nav.primary.label}</a>
        </nav>
      </header>
      <main>
        <section>
          <p>{hero.eyebrow}</p>
          <h1 className={fraunces.className}>{hero.title}</h1>
          <p>{hero.subtitle}</p>
          <Image
            src={hero.image.src}
            alt={hero.image.alt}
            fetchPriority="high"
            loading="eager"
            sizes="(min-width: 768px) 768px, 100vw"
          />
        </section>
        <section id="producto">
          <h2>{modules.heading}</h2>
          <p>{modules.intro}</p>
          {modules.items.map((m) => (
            <article key={m.id}>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
            </article>
          ))}
        </section>
        <section id="preguntas">
          <h2>{faq.heading}</h2>
          {faq.items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>
        <ContactSection content={contact} />
      </main>
      <footer>
        <p>{content.footer.legal}</p>
      </footer>
    </>
  );
}
