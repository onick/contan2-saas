import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enhanceContactForm, contactFormInlineScript } from './contact-form';

function mount(): HTMLFormElement {
  document.body.innerHTML = `
    <form id="contacto-form" method="post" action="/api/contact" data-ok="Mensaje enviado. Te responderemos pronto." data-err="No pudimos enviar tu mensaje." data-sending="Enviando…">
      <input name="name" value="Ana Prueba"><input name="organization" value="Centro">
      <input name="email" value="ana@example.com"><textarea name="message">Hola</textarea>
      <input name="fax" value="">
      <button type="submit">Enviar</button>
    </form>
    <div id="contacto-estado" role="status" aria-live="polite"></div>`;
  return document.getElementById('contacto-form') as HTMLFormElement;
}
const submit = (f: HTMLFormElement) => f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const live = () => document.getElementById('contacto-estado')!;

describe('enhanceContactForm', () => {
  let nativeSubmit: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    nativeSubmit = vi.fn();
    HTMLFormElement.prototype.submit = nativeSubmit as unknown as () => void;
  });

  it('envía JSON a /api/contact, anuncia éxito y resetea', async () => {
    const form = mount();
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    enhanceContactForm(form, { fetchFn });
    const resetSpy = vi.spyOn(form, 'reset');
    const ev = submit(form);
    expect(ev).toBe(false); // preventDefault
    await tick();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/contact');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Ana Prueba', organization: 'Centro', email: 'ana@example.com', message: 'Hola', fax: '',
    });
    expect(live().textContent).toBe('Mensaje enviado. Te responderemos pronto.');
    expect(live().getAttribute('data-state')).toBe('ok');
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(form.querySelector('button')!.disabled).toBe(false);
    expect(nativeSubmit).not.toHaveBeenCalled();
  });

  it('evita el doble envío mientras está en vuelo', async () => {
    const form = mount();
    let resolve!: (r: Response) => void;
    const fetchFn = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    enhanceContactForm(form, { fetchFn });
    submit(form);
    expect(form.querySelector('button')!.disabled).toBe(true);
    expect(live().textContent).toBe('Enviando…');
    submit(form);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    resolve(new Response('{"ok":true}', { status: 200 }));
    await tick();
    expect(form.querySelector('button')!.disabled).toBe(false);
  });

  it('4xx con error del servidor → lo anuncia, sin POST nativo', async () => {
    const form = mount();
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"error":"Recibimos varias solicitudes."}', { status: 429 }));
    enhanceContactForm(form, { fetchFn });
    submit(form);
    await tick();
    expect(live().textContent).toBe('Recibimos varias solicitudes.');
    expect(live().getAttribute('data-state')).toBe('error');
    expect(nativeSubmit).not.toHaveBeenCalled();
  });

  it('4xx sin cuerpo útil → texto genérico de data-err', async () => {
    const form = mount();
    enhanceContactForm(form, { fetchFn: vi.fn().mockResolvedValue(new Response('x', { status: 400 })) });
    submit(form);
    await tick();
    expect(live().textContent).toBe('No pudimos enviar tu mensaje.');
  });

  it('5xx → respaldo: POST nativo', async () => {
    const form = mount();
    enhanceContactForm(form, { fetchFn: vi.fn().mockResolvedValue(new Response('', { status: 502 })) });
    submit(form);
    await tick();
    expect(nativeSubmit).toHaveBeenCalledTimes(1);
  });

  it('error de red → respaldo: POST nativo', async () => {
    const form = mount();
    enhanceContactForm(form, { fetchFn: vi.fn().mockRejectedValue(new TypeError('fail')) });
    submit(form);
    await tick();
    expect(nativeSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('contactFormInlineScript', () => {
  it('es autocontenido, ejecutable y pesa <= 3 KB', async () => {
    const code = contactFormInlineScript();
    expect(new TextEncoder().encode(code).length).toBeLessThanOrEqual(3 * 1024);
    const form = mount();
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);
    new Function(code)();
    submit(form);
    await tick();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(live().getAttribute('data-state')).toBe('ok');
    vi.unstubAllGlobals();
  });

  it('sin formulario en la página no falla', () => {
    document.body.innerHTML = '';
    expect(() => new Function(contactFormInlineScript())()).not.toThrow();
  });
});
