# Known issues observados antes del evento 2026-05-22

Issues detectados durante el smoke del 2026-05-18. Ninguno bloquea el
evento. Esta semana no se arregla nada (modo conservador). Se anota
para tratar después del viernes.

Severidad:
- **info**: cosmético o de buena práctica
- **warn**: debe corregirse pronto, pero el evento se opera con esto
- **critical**: bloquea el evento → no hay ninguno

---

## 1. (warn) Endpoint `POST /api/credentials/:code/send` devuelve el email completo en la respuesta

**Observado:**
```json
{"ok":true,"id":"de0a86be-...","email":"mfranciscomartinez@gmail.com"}
```

El campo `email` del body de respuesta expone el destinatario en
claro. En los logs sí está enmascarado (`m***@gmail.com`), pero la
respuesta HTTP no.

**Impacto durante el evento:** ninguno operativo. Ningún cliente
externo está consumiendo esta API.

**Riesgo a futuro:** cuando se enchufe auth en Wave 1.1, este endpoint
queda detrás de roles owner+admin → solo internal users autenticados
ven la respuesta. Pero igual conviene enmascarar.

**Fix propuesto (post-viernes):** devolver
`{ ok: true, id, email: maskEmail(user.email) }` o simplemente
`{ ok: true, id }` — el caller (frontend admin) ya conoce el email
del user que disparó el envío.

---

## 2. (info) Endpoint `GET /api/public/users/suggest` enumera nombres por prefijo de email

**Observado:**
```
GET /api/public/users/suggest?q=mfranc
→ { "matches": [{"code":"CCB-VPGUCM","firstName":"Marcelino","lastName":"Francisco M.","visitCount":1}] }
```

Hoy es público con rate limit (15/min/IP). Es necesario para el
kiosko, que sugiere usuarios mientras escriben.

**Impacto durante el evento:** ninguno; es feature, no bug.

**Riesgo a futuro:** con rate limit + min 3 chars (ya implementado)
+ retorno de máximo 3 matches con cap a 4 chars cuando hay
ambigüedad, está acotado pero alguien con paciencia puede mapear
prefijos. No es enumeración masiva.

**No fix planificado.** Si en algún momento un tenant quiere
"opt-out" del autocomplete público, se agrega una columna
`organizations.disable_public_user_suggest`.

---

## 3. (info) Coolify expone `git_commit_sha: "HEAD"` literal, no resuelve el SHA real

**Observado:** `GET /api/v1/applications/<uuid>` devuelve
`"git_commit_sha": "HEAD"`, no el SHA que está corriendo.

**Impacto:** no hay forma 100% automática de saber qué SHA exacto
corre en producción solo desde la API de Coolify. Se confirma por
inferencia (último push a `multitenant` = lo desplegado, porque hay
webhook auto-deploy).

**Workaround durante el evento:** el SHA conocido bueno es `4c62e92`,
documentado en este runbook. Si surge duda, comparar el HTML del
kiosko con el del commit local — si las clases CSS y los selectores
nuevos están presentes, está corriendo `4c62e92`.

**Fix propuesto post-viernes:** agregar endpoint `/api/version` que
devuelva `{ commit: "$GIT_SHA", buildDate: "..." }`. El SHA se
inyecta como build arg al Dockerfile.

---

## 4. (info) Coolify `GET /api/v1/deployments?uuid=...` devuelve lista vacía

**Observado:** la API de Coolify v4 no expone el historial de
deployments vía este endpoint (al menos con el token actual y este
método). Devuelve `[]`.

**Impacto:** para auditar qué se desplegó y cuándo, hay que ir al
panel UI de Coolify (tab Deployments) en lugar de scriptear.

**No fix de nuestro lado.** Limitación de Coolify v4 / nuestra clave
sin permisos suficientes.

---

## 5. (info) Performance de `/api/credentials/:code.png` ~1.6s

**Observado:** generar y servir la credencial PNG toma 1.6s.

**Descomposición probable:**
- Cargar logoUrl SVG del volumen
- Generar QR (qrcode lib)
- Componer SVG y rasterizar con sharp
- No hay caché — cada llamada regenera

**Impacto durante el evento:** 1.6s por credencial es aceptable para
flujo manual. Si 50 visitantes piden simultáneamente la credencial,
se acumula carga. Pero en el flujo típico la credencial se ve una
vez por visitante (en email o tras check-in).

**Fix propuesto post-viernes:** caché en disk de credenciales
generadas (key = `<code>` + hash del branding + hash del logo). Cada
PNG vive en `/data/contan2/uploads/credentials/`. Cuando el branding
cambia (PATCH `/api/org/branding`), se purga el directorio.

---

## 6. (info) `pre-event-known-issues.md` no tiene Issues `critical`

Confirmado el smoke completo (puntos 2.1–2.9): nada crítico para el
evento.

---

## Confirmación humana pendiente para cerrar known-issues

- **Marcelino confirma recepción** del email de credencial disparado
  el 2026-05-18 a `mfranciscomartinez@gmail.com` (Resend ID
  `de0a86be-b69a-4f1e-b7f1-bb3e145b510d`).
  - Si llega bien → smoke punto 2.6 = ✅ y ningún issue nuevo.
  - Si llega a spam → registrar issue **info** sobre reputación de
    sender; no es bloqueante porque DMARC/DKIM/SPF están bien
    configurados.
  - Si NO llega después de 15 minutos → registrar issue **warn**
    y diagnosticar antes del viernes (revisar dashboard de Resend
    en https://resend.com/emails).
