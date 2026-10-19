import { describe, it, expect, afterEach, vi } from 'vitest';
import { downloadReport, DownloadError, filenameFromDisposition } from './downloadReport';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

const bin = (headers: Record<string, string> = {}) =>
  new Response(new Blob(['x']), { status: 200, headers: { 'content-type': 'application/pdf', ...headers } });
const err = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubUrl() {
  const create = vi.fn(() => 'blob:fake');
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { create, revoke, click };
}

describe('filenameFromDisposition', () => {
  it('lee filename="…" y filename*=UTF-8', () => {
    expect(filenameFromDisposition('attachment; filename="informe_2026-10.pdf"')).toBe('informe_2026-10.pdf');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''Cine%20Cl%C3%A1sico.xlsx")).toBe('Cine Clásico.xlsx');
    expect(filenameFromDisposition(null)).toBeNull();
  });
});

describe('downloadReport', () => {
  it('éxito: baja el blob con el nombre del servidor y no navega', async () => {
    const { create, revoke, click } = stubUrl();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bin({ 'content-disposition': 'attachment; filename="informe.pdf"' })));
    const r = await downloadReport('/app/reportes/api/period?kind=pdf&from=a&to=b');
    expect(r.filename).toBe('informe.pdf');
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:fake'), { timeout: 2000 });
  });

  it('429 → DownloadError con mensaje legible (usa el de la API)', async () => {
    stubUrl();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(429, { error: 'Demasiados reportes en poco tiempo. Espera un momento.' })));
    await expect(downloadReport('/x')).rejects.toMatchObject({ name: 'DownloadError', status: 429, message: 'Demasiados reportes en poco tiempo. Espera un momento.' });
  });

  it('429 sin cuerpo JSON → mensaje por defecto', async () => {
    stubUrl();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(downloadReport('/x')).rejects.toThrow(/Espera un momento/);
  });

  it('400 muestra el mensaje de la API; 403, 401 y 5xx tienen su texto', async () => {
    stubUrl();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(err(400, { error: 'Rango demasiado amplio (máx 366 días). Acota el período.' })));
    await expect(downloadReport('/x')).rejects.toThrow('Rango demasiado amplio');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(err(403, { error: 'No tienes permiso para generar reportes.' })));
    await expect(downloadReport('/x')).rejects.toThrow('No tienes permiso');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(err(401, {})));
    await expect(downloadReport('/x')).rejects.toThrow(/sesión/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(err(502, { error: 'upstream <html>' })));
    await expect(downloadReport('/x')).rejects.toThrow(/No pudimos generar el informe/);
  });

  it('error de red → DownloadError sin status', async () => {
    stubUrl();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const e = await downloadReport('/x').catch((x) => x);
    expect(e).toBeInstanceOf(DownloadError);
    expect(e.message).toMatch(/conexión/);
  });
});
