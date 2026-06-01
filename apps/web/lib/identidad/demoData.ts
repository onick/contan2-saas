// Datos LOCALES de la pantalla Identidad (/app/identidad). Estáticos: el guardado
// real se cablea con /api/v2/org/branding. Valores demo del tenant CCB.

export interface SidebarPreset {
  key: 'marca' | 'oscuro' | 'claro';
  label: string;
  active: boolean;
}

export const BRAND = {
  primary: '#e65100',
  accent: '#ff6f00',
};

// Paleta derivada del primario (claro → oscuro) para muestra.
export const BRAND_PALETTE = ['#ffe0c2', '#ffb877', '#ff8f3d', '#e65100', '#a33700'];

export const SIDEBAR_PRESETS: SidebarPreset[] = [
  { key: 'marca', label: 'Marca', active: true },
  { key: 'oscuro', label: 'Oscuro', active: false },
  { key: 'claro', label: 'Claro', active: false },
];

export const IDENTITY = {
  displayName: 'Centro Cultural Banreservas',
  legalName: 'Fundación Cultural Banreservas, Inc.',
  subdomain: 'ccb.contan2.com',
  customDomain: 'cultura.banreservas.com',
  domainVerified: true,
  dns: {
    type: 'TXT',
    host: '_contan2.cultura.banreservas.com',
    value: 'contan2-verify-8f7a2c9c1b7d',
  },
  email: {
    fromName: 'Centro Cultural Banreservas',
    replyTo: 'hola@cultura.banreservas.com',
  },
};
