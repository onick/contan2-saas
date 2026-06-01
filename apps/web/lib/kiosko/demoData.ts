// Datos LOCALES de la experiencia kiosko (/kiosko). 100% demo: sin API, sin
// escrituras, sin Resend, sin QR real. Cuando se cablee el slice público de
// api-v2, esto se reemplaza por GET /api/v2/public/activities y el POST de
// check-in (PR de escrituras, aparte). La forma imita la respuesta pública de
// v1 (publicActivity / publicUser) para que el swap sea directo.

export type KioskScreen =
  | 'welcome'
  | 'activities'
  | 'identify'
  | 'code'
  | 'new'
  | 'confirmation';

export interface KioskActivity {
  id: string;
  name: string;
  category: string;
  date: string;
  location: string;
  capacity: number;
  enrolled: number;
}

export interface KioskVisitor {
  firstName: string;
  lastName: string;
  code: string;
  visitCount: number;
  isNew: boolean;
  // Niños acompañantes asociados al ADULTO responsable (este visitante). Un solo
  // código/QR cubre al grupo; los menores NO reciben credencial propia
  // (privacidad/consentimiento) pero SÍ cuentan para el aforo. Regla de producto:
  // todo ADULTO se registra con identidad propia (su código/correo); sólo los
  // niños van como acompañantes. En la DB real (PR de escrituras) →
  // attendance.companions_children (SMALLINT DEFAULT 0, aditivo: v1 lo ignora).
  companionsChildren: number;
}

// Cabezas que ocupa este registro (el adulto responsable + sus niños). Es lo que
// descuenta del cupo. partySize = 1 + companions_children (no hay adultos acomp.).
export function partySize(v: Pick<KioskVisitor, 'companionsChildren'>): number {
  return 1 + v.companionsChildren;
}

// Actividades disponibles (status activo, con cupo) como las vería el visitante.
export const KIOSK_ACTIVITIES: KioskActivity[] = [
  { id: 'a1', name: 'Tertulia: Poesía dominicana contemporánea', category: 'Tertulia', date: 'Hoy · 7:00 p.m.', location: 'Sala de lectura', capacity: 60, enrolled: 13 },
  { id: 'a2', name: 'Concierto: Los Congos de Villa Mella', category: 'Concierto', date: 'Hoy · 8:00 p.m.', location: 'Auditorio principal', capacity: 220, enrolled: 189 },
  { id: 'a3', name: 'Cine Foro: Memoria del Caribe', category: 'Cine', date: 'Mañana · 6:30 p.m.', location: 'Sala audiovisual', capacity: 80, enrolled: 41 },
  { id: 'a4', name: 'Exposición: Trazos de la cordillera', category: 'Exposición', date: 'Todo el día', location: 'Galería este', capacity: 150, enrolled: 96 },
];

// Visitante demo "ya registrado" para ilustrar la búsqueda por código/email.
// El kiosko reconoce este código/email; cualquier otro se trata como no hallado.
export const KIOSK_KNOWN_VISITOR: KioskVisitor = {
  firstName: 'María',
  lastName: 'Reyes',
  code: 'CCB-7F3K2P',
  visitCount: 4,
  isNew: false,
  companionsChildren: 0,
};

export const KIOSK_KNOWN_EMAIL = 'maria.reyes@example.com';

// === Código de visitante (continuidad con v1) ===================================
// El kiosko NO emite códigos reales: eso es escritura en DB y vive en el slice
// público de api-v2 (PR de escrituras), que usa @contan2/codes —el port byte-fiel
// del generador de v1— para que la SECUENCIA continúe exactamente y los QR/
// credenciales existentes sigan siendo válidos. @contan2/codes importa
// `node:crypto`, así que no es browser-safe y no se puede usar en este client.
//
// Para que el código mostrado en el demo tenga la MISMA forma/algoritmo que v1
// (paridad visual), replicamos `composeCode` de @contan2/codes:
//   <PREFIX>-<ts2><4 chars>  ·  ts2 = base36(Date.now()).slice(-2)  ·  4 chars
//   del mismo ALPHABET tomados de la entropía. Idéntico salvo la fuente de bytes
//   (acá crypto.getRandomValues del navegador; en v1/api-v2, randomBytes(4)).
// Es presentación: el valor real lo asigna el servidor al persistir.
export const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Núcleo determinista (mismo shape que composeCode) para poder testearlo pineado.
export function composeDemoCode(prefix: string, nowMs: number, bytes: Uint8Array): string {
  const ts2 = nowMs.toString(36).toUpperCase().slice(-2);
  let rand = '';
  for (let i = 0; i < 4; i += 1) rand += ALPHABET.charAt((bytes[i] ?? 0) % 36);
  return `${prefix}-${ts2}${rand}`;
}

// Acuña un código demo en el navegador con el algoritmo de v1 (sólo presentación).
export function mintDemoCode(prefix = 'CCB'): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  return composeDemoCode(prefix, Date.now(), bytes);
}
