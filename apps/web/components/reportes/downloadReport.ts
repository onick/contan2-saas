// Descarga de informes SIN salir de la página (REP-A17). Antes todo era <a href>: un 400/403/429/502 navegaba a un
// JSON crudo. Acá se hace fetch → blob → <a download>; si falla, se lanza un DownloadError con un mensaje legible.

export class DownloadError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'DownloadError';
    this.status = status;
  }
}

/** Nombre de archivo de `Content-Disposition` (filename* tiene prioridad sobre filename). */
export function filenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd);
  if (star) { try { return decodeURIComponent(star[1]!.trim()); } catch { /* cae a filename */ } }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(cd);
  return plain ? plain[1]!.trim() : null;
}

const FALLBACK: Record<number, string> = {
  401: 'Tu sesión venció. Vuelve a iniciar sesión para descargar.',
  403: 'No tienes permiso para descargar este informe.',
  429: 'Demasiados reportes en poco tiempo. Espera un momento y vuelve a intentar.',
};

async function messageFor(res: Response): Promise<string> {
  // 5xx: el cuerpo puede ser de un proxy (HTML); texto propio.
  if (res.status >= 500) return 'No pudimos generar el informe. Reintenta en unos segundos.';
  if (res.status === 401) return FALLBACK[401]!;
  let apiMsg: string | null = null;
  try {
    const j = await res.json();
    if (j && typeof j.error === 'string' && j.error.trim()) apiMsg = j.error.trim();
  } catch { /* sin cuerpo JSON */ }
  return apiMsg ?? FALLBACK[res.status] ?? 'No pudimos generar el informe. Revisa los filtros e intenta de nuevo.';
}

export async function downloadReport(href: string): Promise<{ filename: string }> {
  let res: Response;
  try {
    res = await fetch(href, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new DownloadError('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }
  if (!res.ok) throw new DownloadError(await messageFor(res), res.status);

  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get('content-disposition')) ?? 'informe';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // El navegador ya tomó el blob; se libera un instante después.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename };
}
