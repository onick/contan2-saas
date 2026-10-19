'use client';

// Estado de las descargas del dashboard: cuál se está generando ("Generando…"), el último error legible y un aviso
// de "listo" para lectores de pantalla. Una sola descarga a la vez (el PDF tarda 2-6 s; evita doble clic).

import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { downloadReport, DownloadError } from './downloadReport';

export interface Downloads {
  busy: string | null;
  error: string | null;
  done: string | null;
  /** Genera y baja el informe. Devuelve true si salió bien. */
  run: (key: string, href: string) => Promise<boolean>;
  /** onClick para un <a href>: clic normal = descarga en la página; clic con modificador = comportamiento nativo. */
  linkClick: (key: string, href: string) => (e: MouseEvent<HTMLElement>) => void;
  clearError: () => void;
}

export function useDownloads(): Downloads {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const lock = useRef(false);

  const run = useCallback(async (key: string, href: string) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(key); setError(null); setDone(null);
    try {
      const { filename } = await downloadReport(href);
      setDone(`Descarga lista: ${filename}`);
      return true;
    } catch (e) {
      setError(e instanceof DownloadError ? e.message : 'No pudimos generar el informe. Reintenta en unos segundos.');
      return false;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }, []);

  const linkClick = useCallback((key: string, href: string) => (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void run(key, href);
  }, [run]);

  const clearError = useCallback(() => setError(null), []);
  return { busy, error, done, run, linkClick, clearError };
}
