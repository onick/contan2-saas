import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { BrandingEditor, type BrandingInitial } from '../../../components/identidad/BrandingEditor';
import { SectionHeader } from '../../../components/ui';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getAdminGate } from '../../../lib/auth/session';

// Identidad REAL: editor de marca (nombre/logo/colores/sidebar) contra
// api-v2 (PATCH /org/branding) vía BFF, con preview en vivo + contraste AA. Sin
// datos demo ni dominio/DNS. owner/admin editan; operator ve en solo lectura.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Identidad',
  description: 'Marca de la organización: nombre, logo, colores y menú',
};

const FALLBACK: BrandingInitial = { name: 'Centro Cultural', logoUrl: null, credentialLogoUrl: null, primaryColor: '#e65100', secondaryColor: '#ff6f00', sidebarTheme: 'brand' };

export default async function IdentidadPage() {
  const branding = await getTenantBranding();
  const gate = await getAdminGate();
  const initial: BrandingInitial = gate.status === 'ok'
    ? { name: gate.branding.name, logoUrl: gate.branding.logoUrl, credentialLogoUrl: gate.branding.credentialLogoUrl, primaryColor: gate.branding.primaryColor, secondaryColor: gate.branding.secondaryColor, sidebarTheme: gate.branding.sidebarTheme }
    : FALLBACK;
  const canEdit = gate.status === 'ok' && (gate.staff.role === 'owner' || gate.staff.role === 'admin');

  return (
    <AppShell branding={branding} title="Identidad" activeKey="identidad">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Identidad" subtitle="La marca de tu organización aplicada en toda la plataforma" />
        </div>
        <div className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
          <BrandingEditor initial={initial} canEdit={canEdit} />
        </div>
      </div>
    </AppShell>
  );
}
