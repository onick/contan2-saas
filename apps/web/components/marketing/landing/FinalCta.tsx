// FinalCta · banda oscura de cierre. Envuelve la ContactSection (bloque D), que
// aporta el encabezado, el formulario y el correo alternativo.
import type { LandingContent } from '../../../content/landing.types';
import { ContactSection } from './ContactSection';

export function FinalCta({ content }: { content: LandingContent['contact'] }) {
  return (
    <div className="night final-cta">
      <div className="container">
        <ContactSection content={content} />
      </div>
    </div>
  );
}
