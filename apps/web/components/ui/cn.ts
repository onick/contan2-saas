import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// twMerge extendido con nuestros tokens de diseño para que no los descarte.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'text-color': [
        { text: [
          'brand', 'brand-fg', 'brand-text', 'brand-soft', 'brand-accent',
          'accent-text', 'accent-soft',
          'info-text', 'info-soft',
          'ink', 'muted', 'faint', 'page', 'surface', 'surface-container', 'subtle',
          'success-fg', 'success-bg', 'danger-fg', 'danger-bg', 'warning-fg', 'warning-bg',
          'focus',
          'brand-strong', 'on-primary-container', 'primary-container',
        ]},
      ],
      'bg-color': [
        { bg: [
          'brand', 'brand-fg', 'brand-text', 'brand-soft', 'brand-accent',
          'accent-text', 'accent-soft',
          'info-text', 'info-soft',
          'ink', 'muted', 'faint', 'line', 'page', 'surface', 'surface-container', 'subtle',
          'success-fg', 'success-bg', 'danger-fg', 'danger-bg', 'warning-fg', 'warning-bg',
          'brand-strong', 'on-primary-container', 'primary-container',
        ]},
      ],
      'border-color': [
        { border: [
          'brand', 'brand-fg', 'brand-text', 'brand-soft', 'brand-accent',
          'accent-text', 'accent-soft',
          'info-text', 'info-soft',
          'ink', 'muted', 'faint', 'line', 'page', 'surface', 'surface-container', 'subtle',
          'success-fg', 'success-bg', 'danger-fg', 'danger-bg', 'warning-fg', 'warning-bg',
          'focus', 'brand-strong',
        ]},
      ],
      'rounded': [
        { rounded: ['pill', 'field', 'card'] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Anillo de foco visible consistente para toda la UI.
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

// Variante para contenedores compuestos.
export const focusWithin =
  'focus-within:outline-none focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface';
