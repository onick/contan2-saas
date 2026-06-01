// Join de clases (filtra falsy). Sin dependencias.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// Anillo de foco visible consistente para toda la UI. Consume --color-focus
// (globals.css), que sigue al brand del tenant. Offset sobre la superficie para
// separar el anillo del relleno (también legible en botones de marca).
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
