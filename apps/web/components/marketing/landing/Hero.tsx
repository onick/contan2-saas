// Hero · H1 único (el LCP es TEXTO: nada arranca con opacity 0) y la captura
// del panel, única imagen con fetchPriority alta. En <768 px se sirve un
// recorte dirigido (<picture>) generado con getImageProps.
import Image, { getImageProps } from 'next/image';
import type { LandingContent } from '../../../content/landing.types';
import { Cta } from './Cta';

const HERO_SIZES = '(min-width: 1280px) 1200px, (min-width: 768px) calc(100vw - 64px), 100vw';

export function Hero({ content }: { content: LandingContent['hero'] }) {
  const { image } = content;
  const mobile = image.mobileSrc
    ? getImageProps({ src: image.mobileSrc, alt: '', sizes: '100vw' }).props
    : null;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container">
        {content.eyebrow ? <p className="hero__eyebrow">{content.eyebrow}</p> : null}
        <h1 id="hero-title">{content.title}</h1>
        <p className="hero__lead">{content.subtitle}</p>
        <div className="hero__ctas">
          {content.ctas.map((c, i) => (
            <Cta key={c.label} cta={c} arrow={i === 0} />
          ))}
        </div>
      </div>
      <div className="hero__media">
        <div className="container">
          <figure className="frame frame--hero">
            <picture>
              {mobile ? <source media="(max-width: 767px)" srcSet={mobile.srcSet} sizes="100vw" /> : null}
              <Image
                src={image.src}
                alt={image.alt}
                sizes={HERO_SIZES}
                fetchPriority="high"
                loading="eager"
                decoding="async"
              />
            </picture>
          </figure>
        </div>
      </div>
    </section>
  );
}
