'use client';

// RelativeTime — SSR: muestra fechaHora; tras montar muestra haceTiempo.
// Evita hydration mismatch porque el texto puede diferir entre servidor y cliente
// según cuándo se hidrata.

import { useEffect, useState } from 'react';
import { fechaHora, haceTiempo } from '../../lib/format';

export interface RelativeTimeProps {
  at: string | Date;
  className?: string;
}

export function RelativeTime({ at, className }: RelativeTimeProps) {
  const iso = typeof at === 'string' ? at : at.toISOString();
  const fh = fechaHora(iso);
  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    setRelative(haceTiempo(iso));
  }, [iso]);

  return (
    <time dateTime={iso} title={fh} className={className}>
      {relative ?? fh}
    </time>
  );
}
