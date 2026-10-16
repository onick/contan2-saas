// LandingPage · Server Component PURO (sin 'use client', sin hooks): el HTML se
// pre-renderiza en build y se sirve sin runtime JS. Compone las secciones del
// mockup aprobado (2026-10-16). ContactSection y SeoHead son de otros bloques.
import type { LandingContent } from '../../../content/landing.types';
import { schibsted } from '../../../lib/marketing/landing-font';
import { Faq } from './Faq';
import { FinalCta } from './FinalCta';
import { Footer } from './Footer';
import { Hero } from './Hero';
import { Modules } from './Modules';
import { Nav } from './Nav';
import { Problem } from './Problem';
import { ProofBar } from './ProofBar';
import { Steps } from './Steps';
import { Trust } from './Trust';

export function LandingPage({ content }: { content: LandingContent }) {
  return (
    <div className={`landing ${schibsted.variable}`}>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <Nav content={content.nav} />
      <main id="contenido">
        <Hero content={content.hero} />
        <ProofBar content={content.proof} />
        {content.problem ? <Problem content={content.problem} /> : null}
        <Modules content={content.modules} />
        <Steps content={content.steps} />
        <Trust content={content.trust} />
        <Faq content={content.faq} />
        <FinalCta content={content.contact} />
      </main>
      <Footer content={content.footer} />
    </div>
  );
}
