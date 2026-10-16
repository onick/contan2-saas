// lib/marketing/contact-form.ts · mejora progresiva del formulario de contacto.
//
// La landing no se hidrata (unstable_runtimeJS:false), así que esta función se
// inyecta como <script> inline (ver contactFormInlineScript). Reglas:
//  · AUTOCONTENIDA: se serializa con Function.prototype.toString, por lo que no
//    puede referenciar nada fuera de su cuerpo ni usar async/await ni helpers
//    de transpilación (ES5 + promesas).
//  · Los textos viajan en data-* del <form> (data-ok, data-err, data-sending).
//  · Sin JS, o si el fetch falla por red / 5xx, el formulario hace el POST
//    nativo a /api/contact (que responde 303 a /contacto/enviado|error).

export type EnhanceContactOptions = {
  /** Sólo para tests. Por defecto, window.fetch. */
  fetchFn?: typeof fetch;
};

export function enhanceContactForm(form: HTMLFormElement, opts?: EnhanceContactOptions): void {
  var d = form.dataset;
  var live = document.getElementById(d.live || 'contacto-estado');
  var btn = form.querySelector('button[type=submit]') as HTMLButtonElement | null;
  var send = (opts && opts.fetchFn) || fetch;
  if (!live || !btn) return;
  var button = btn;
  var region = live;

  function say(text: string, state: string): void {
    region.textContent = text;
    region.setAttribute('data-state', state);
  }
  function free(): void {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
  // Respaldo: POST nativo (no dispara el evento submit, no hay bucle).
  function native(): void {
    HTMLFormElement.prototype.submit.call(form);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    say(d.sending || '', 'sending');
    var data: Record<string, string> = {};
    new FormData(form).forEach(function (v, k) {
      data[k] = String(v);
    });
    send('/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }).then(
      function (r) {
        if (r.ok) {
          form.reset();
          say(d.ok || '', 'ok');
          free();
        } else if (r.status < 500) {
          r.json().then(
            function (j) {
              return j && typeof j.error === 'string' ? j.error : '';
            },
            function () {
              return '';
            },
          ).then(function (m) {
            say(m || d.err || '', 'error');
            free();
          });
        } else {
          native();
        }
      },
      native,
    );
  });
}

/** Código del <script> inline: busca el form y lo mejora. */
export function contactFormInlineScript(formId = 'contacto-form'): string {
  return `(function(){var f=document.getElementById(${JSON.stringify(formId)});if(f)(${enhanceContactForm.toString()})(f)})()`;
}
