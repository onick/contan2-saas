// apps/api-v2/src/services/whatsapp.ts · canal WhatsApp (Meta Cloud API,
// oficial) para entregar la credencial QR al teléfono del visitante. Mismo
// contrato honesto del email: SIN credenciales de Meta → DRY-RUN ({ skipped },
// nada se marca); CON ellas → sube el PNG como media y manda la PLANTILLA
// pre-aprobada con la imagen de cabecera. Best-effort: nunca lanza. El
// teléfono se loguea ENMASCARADO; el transporte es inyectable para tests.
//
// Para activar (cuando el CCB tenga el WhatsApp Business verificado):
//   WHATSAPP_TOKEN=<token permanente del system user>
//   WHATSAPP_PHONE_NUMBER_ID=<id numérico del número emisor>
//   WHATSAPP_CREDENTIAL_TEMPLATE=<nombre de la plantilla aprobada · default credencial_qr>
//   WHATSAPP_LANG=<código de idioma de la plantilla · default es>
// La plantilla debe tener: HEADER de imagen + BODY con {{1}}=nombre, {{2}}=código.

export interface WhatsAppUser {
  code: string;
  firstName: string;
  phone: string | null;
}

export type WhatsAppResult =
  | { sent: true; id?: string }
  | { skipped: true; reason: string }
  | { sent: false; error: string };

export interface WhatsAppTransport {
  uploadMedia(png: Buffer): Promise<{ id?: string; error?: string }>;
  sendTemplate(to: string, template: string, lang: string, components: unknown[]): Promise<{ id?: string; error?: string }>;
}

export interface WhatsAppDeps {
  transport?: WhatsAppTransport;
  token?: string;
  phoneNumberId?: string;
  template?: string;
  lang?: string;
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

// Normaliza a E.164 SIN '+' (formato del Cloud API). Reglas honestas para el
// tenant ancla (RD): 10 dígitos con NPA dominicano → +1; ya-internacional
// (con '+'/'00' o 11-15 dígitos) → tal cual. Lo ambiguo devuelve null (mejor
// no mandar que mandar al número equivocado).
const RD_NPAS = new Set(['809', '829', '849']);

export function normalizePhoneRD(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const intl = trimmed.startsWith('+') || trimmed.startsWith('00');
  let d = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && RD_NPAS.has(d.slice(0, 3))) return `1${d}`;
  if (d.length === 11 && d.startsWith('1') && RD_NPAS.has(d.slice(1, 4))) return d;
  if (intl && d.length >= 8 && d.length <= 15) return d;
  if (d.length >= 11 && d.length <= 15) return d; // trae código de país
  return null;
}

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

// Transporte real contra el Graph API de Meta (fetch nativo).
export function graphTransport(token: string, phoneNumberId: string): WhatsAppTransport {
  return {
    async uploadMedia(png: Buffer) {
      try {
        const form = new FormData();
        form.set('messaging_product', 'whatsapp');
        form.set('type', 'image/png');
        form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'credencial.png');
        const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/media`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: form,
        });
        const body = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
        if (!res.ok || !body?.id) return { error: body?.error?.message ?? `media upload HTTP ${res.status}` };
        return { id: body.id };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
    async sendTemplate(to, template, lang, components) {
      try {
        const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: { name: template, language: { code: lang }, components },
          }),
        });
        const body = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }>; error?: { message?: string } } | null;
        if (!res.ok) return { error: body?.error?.message ?? `send HTTP ${res.status}` };
        return { id: body?.messages?.[0]?.id };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

export async function sendWhatsAppCredential(
  user: WhatsAppUser,
  png: Buffer,
  deps: WhatsAppDeps = {},
): Promise<WhatsAppResult> {
  if (!user.phone) return { skipped: true, reason: 'sin teléfono' };
  const to = normalizePhoneRD(user.phone);
  if (!to) return { skipped: true, reason: 'teléfono no normalizable' };

  const token = deps.token ?? process.env.WHATSAPP_TOKEN;
  const phoneNumberId = deps.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!deps.transport && (!token || !phoneNumberId)) {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp-dev] credencial ${user.code} para ${maskPhone(to)} lista — faltan WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID`);
    return { skipped: true, reason: 'sin credenciales de WhatsApp' };
  }

  const template = deps.template ?? process.env.WHATSAPP_CREDENTIAL_TEMPLATE ?? 'credencial_qr';
  const lang = deps.lang ?? process.env.WHATSAPP_LANG ?? 'es';
  const transport = deps.transport ?? graphTransport(token as string, phoneNumberId as string);

  try {
    const media = await transport.uploadMedia(png);
    if (!media.id) return { sent: false, error: media.error ?? 'media upload sin id' };
    const r = await transport.sendTemplate(to, template, lang, [
      { type: 'header', parameters: [{ type: 'image', image: { id: media.id } }] },
      { type: 'body', parameters: [
        { type: 'text', text: user.firstName },
        { type: 'text', text: user.code },
      ] },
    ]);
    if (r.error) return { sent: false, error: r.error };
    return { sent: true, id: r.id };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
