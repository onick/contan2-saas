// Modules · seis módulos apilados (sin tabs ni JS). Imágenes con next/image,
// import estático (width/height automáticos) y carga diferida.
import Image from 'next/image';
import { Check } from 'lucide-react';
import type { LandingContent, LandingModule } from '../../../content/landing.types';

/** Lado de la captura y tratamiento visual por módulo (según el mockup). */
const LAYOUT: Record<LandingModule['id'], { flip?: boolean; wide?: boolean; composite?: boolean }> = {
  kiosko: {},
  puerta: { flip: true, composite: true },
  audiencias: { composite: true },
  protocolo: { flip: true },
  reportes: { wide: true, composite: true },
  identidad: {},
};

const SIZES = '(min-width: 1280px) 740px, (min-width: 1024px) 62vw, 100vw';
const SIZES_WIDE = '(min-width: 1280px) 1200px, (min-width: 768px) calc(100vw - 64px), 100vw';

function ModuleImage({ item, wide, composite }: { item: LandingModule; wide?: boolean; composite?: boolean }) {
  const img = (
    <Image
      src={item.image.src}
      alt={item.image.alt}
      sizes={wide ? SIZES_WIDE : SIZES}
      loading="lazy"
      decoding="async"
      className={composite ? 'composite' : undefined}
    />
  );
  return (
    <div className={wide ? 'canvas canvas--tall reveal' : 'canvas reveal'}>
      {composite ? img : <figure className="frame">{img}</figure>}
    </div>
  );
}

export function Modules({ content }: { content: LandingContent['modules'] }) {
  return (
    <section id="producto" className="section section--flush" aria-labelledby="modules-title">
      <div className="container">
        <div className="section__head">
          <h2 id="modules-title">{content.heading}</h2>
          <p className="section__intro">{content.intro}</p>
        </div>
        <div className="modules">
          {content.items.map((item) => {
            const l = LAYOUT[item.id];
            const cls = ['module', l.flip ? 'module--flip' : '', l.wide ? 'module--wide' : ''].filter(Boolean).join(' ');
            return (
              <article key={item.id} className={cls} aria-labelledby={`m-${item.id}`}>
                <div className="module__text">
                  <div>
                    <p className="module__name">{item.kicker}</p>
                    <h3 id={`m-${item.id}`}>{item.title}</h3>
                    <p className="module__body">{item.body}</p>
                  </div>
                  <ul className="ticks">
                    {item.bullets.map((b) => (
                      <li key={b}>
                        <Check aria-hidden="true" size={20} strokeWidth={2.2} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <ModuleImage item={item} wide={l.wide} composite={l.composite} />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
