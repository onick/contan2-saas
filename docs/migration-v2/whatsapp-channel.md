# Canal WhatsApp · credencial QR al teléfono del visitante

Estado: **construido en dry-run** (2026-06-11). Sin credenciales de Meta no se
envía nada y `credential_sent_at` no se marca. El día que el CCB tenga su
WhatsApp Business API, activar es solo setear env vars en `contan2-api-v2-*`.

## Cómo funciona

`deliverCredential` (kiosko, alta manual, reenviar, bulk) ahora entrega por
DOS canales con el mismo PNG:

- **Email** (Resend) si el visitante tiene correo — igual que siempre.
- **WhatsApp** (Meta Cloud API oficial) si dejó teléfono — `services/whatsapp.ts`:
  sube el PNG como media → manda la **plantilla pre-aprobada** con la imagen
  de cabecera y `{{1}}`=nombre, `{{2}}`=código.

`credential_sent_at` se marca si **algún** canal envió de verdad. Un visitante
solo-teléfono también recibe su credencial (antes quedaba sin nada).

Teléfonos: normalización a E.164 (`normalizePhoneRD`) — 10 dígitos con NPA
809/829/849 → `1…`; internacionales con `+`/`00` o con código de país → tal
cual; ambiguos → NO se envía (mejor que mandar al número equivocado). En logs
el teléfono va enmascarado y el token/PNG jamás se loguean.

## Activación (cuando lleguen las credenciales)

1. En Meta Business Manager (verificado) → WhatsApp → crear **plantilla**
   categoría *utility*, ej. nombre `credencial_qr`, idioma `es`:
   - Header: **imagen**
   - Body: `Hola {{1}}, esta es tu credencial del Centro Cultural. Presenta el
     código QR en la entrada. Tu código: {{2}}`
2. Env vars en la app api-v2 (staging primero, luego prod):

```
WHATSAPP_TOKEN=<token permanente del system user>
WHATSAPP_PHONE_NUMBER_ID=<id numérico del número emisor>
WHATSAPP_CREDENTIAL_TEMPLATE=credencial_qr   # opcional (default)
WHATSAPP_LANG=es                              # opcional (default)
```

3. Redeploy manual (auto-deploy OFF) y probar con un registro propio en el
   kiosko de staging.

## Costos / límites

- Meta cobra por conversación *utility* (~US$0.01–0.04 en RD). Volumen CCB →
  pocos dólares/mes.
- El número queda atado a la API (no sirve en la app normal de WhatsApp).
- Tier inicial: 1k conversaciones únicas/día (sube solo con uso).

## Pendiente futuro

- Invitaciones RSVP por WhatsApp (plantilla con botones URL) — reusar
  `whatsapp.ts`, solo falta la plantilla y el wiring en `deliverInvitations`.
