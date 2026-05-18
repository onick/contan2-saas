# Rollback de un click — evento 2026-05-22

**Cuándo usar:** durante el evento real del CCB del viernes 22 de mayo.
**Objetivo:** restablecer la operación lo más rápido posible. Diagnóstico
profundo viene **después**, no durante el evento.

> **Acción nuclear universal** (si nada del resto funciona):
> revertir al SHA conocido bueno **`4c62e92`** mediante "Redeploy
> previous" en el panel de Coolify de la app `contan2-saas-app`.
> Tiempo estimado: 60–90 segundos.

---

## Punto de referencia conocido bueno

| Item | Valor |
|---|---|
| Commit corto | `4c62e92` |
| Commit completo | `4c62e92c9f6900b6f00b68e44b18827bfd179356` |
| Branch | `multitenant` |
| Capturado | 2026-05-18, app reportada como `running:healthy`, restart_count 0 |

---

## Accesos críticos durante la emergencia

| Recurso | URL |
|---|---|
| App pública (CCB) | https://ccb.contan2.com |
| Kiosko | https://ccb.contan2.com/kiosko |
| Scanner | https://ccb.contan2.com/scanner |
| Healthcheck | https://ccb.contan2.com/healthz |
| Coolify panel (login) | http://217.77.12.180:8000/login |
| Coolify app overview | http://217.77.12.180:8000/application/f3xck8spocf0o377y9w0vq6n |
| GitHub repo | https://github.com/onick/contan2-saas/commits/multitenant |
| Resend dashboard | https://resend.com/emails (login con cuenta del proyecto) |

**API tokens (NO compartir en logs ni chats públicos):** ver `backend/.env` local.

---

## Procedimiento general

Antes de hacer cualquier rollback:

1. **Capturar señal del error en 30 segundos**: una captura, un curl,
   un mensaje del staff. Lo que sea para reconstruir después.
2. **Avisar a Marcelino** si tú no eres Marcelino. La operación es del
   CCB, no se decide unilateralmente.
3. **Ejecutar el procedimiento del escenario** abajo.
4. **Verificar restablecimiento** con el smoke mínimo:
   ```
   curl -s https://ccb.contan2.com/healthz | jq .ok       # → true
   curl -s -o /dev/null -w '%{http_code}\n' https://ccb.contan2.com/kiosko   # → 200
   curl -s https://ccb.contan2.com/api/_tenant | jq .slug   # → "ccb"
   ```

---

## Escenario 1 — Kiosko no carga / pantalla en blanco

### Detección

- Staff del CCB reporta "no carga".
- Test rápido en otro dispositivo:
  ```
  curl -s -o /dev/null -w '%{http_code}\n' https://ccb.contan2.com/kiosko
  ```
  - 200 → no es el server, problema de red local del kiosko (chequear
    WiFi de la tablet).
  - 502/503 → app caída.
  - 5xx con cuerpo HTML extenso → error del runtime.
  - Timeout → red entre cliente y VPS.

### Acción

**Si HTTP 200 y kiosko local no carga:** problema del dispositivo, no
del server. Verificar conexión y refrescar pestaña con Ctrl+F5.

**Si HTTP 5xx o timeout consistente:**

1. Entrar a Coolify: http://217.77.12.180:8000/application/f3xck8spocf0o377y9w0vq6n
2. Tab **"Deployments"** → buscar el deployment de `4c62e92`
   (commit conocido bueno, ver "Punto de referencia").
3. Click **"Redeploy"** en ese deployment. **NO** click en "Force
   rebuild" — usar la imagen ya construida si existe.
4. Tiempo estimado: 60–90 segundos.
5. Mientras espera, mostrar mensaje al staff: *"El sistema se está
   actualizando, regreso en 1 minuto. Los visitantes pueden esperar o
   anotar nombre y email en papel mientras tanto."*

### Verificación post-rollback

```bash
curl -s https://ccb.contan2.com/healthz                       # ok:true
curl -s https://ccb.contan2.com/kiosko | head -c 200          # HTML válido
curl -s https://ccb.contan2.com/api/_tenant | jq .codePrefix  # "CCB"
```

Si tras 3 minutos sigue caído: **acción nuclear** — revertir a
`4c62e92` directamente en GitHub (force push de la branch a ese SHA)
y disparar redeploy manual. Solo Marcelino o quien tenga acceso a
GitHub.

---

## Escenario 2 — Emails no salen

### Detección

- Visitantes reportan que no llegan los correos.
- Logs de Coolify mostrarán líneas como:
  ```
  [email] error enviando a m***@gmail.com: <razón>
  ```
- Test directo:
  ```
  curl -s -X POST https://ccb.contan2.com/api/credentials/CCB-VPGUCM/send
  ```
  - 200 con `ok:true` → email salió desde nuestro lado; el problema
    está en Resend o en el inbox del visitante (spam, bounce).
  - 4xx/5xx → bloqueo en nuestro lado (rate limit, key inválida, etc).

### Causas frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| HTTP 429 | Rate limit (3 envíos/min por IP) | Esperar 1 minuto, no es bug. Si saturado por staff: pedirles que no insistan |
| HTTP 502 con "RESEND_API_KEY" en log | Key rotada o vacía | Verificar `RESEND_API_KEY` en Coolify env vars → re-pegar la del `.env` local |
| 200 OK pero no llegan | Resend marcó dominio en cuarentena, o bounce en alguna dirección | Login a https://resend.com y revisar el dashboard, especialmente "Suppressions" |
| 200 pero al user → spam | DKIM/SPF/DMARC ok pero contenido o reputación. No es bug de software | Pedir al user que mire spam |

### Acción inmediata durante el evento

**NO bloquees el evento.** Los visitantes pueden registrarse sin
recibir el email. La credencial se les envía después con el botón
"Reenviar credencial" del admin web.

Mensaje sugerido al staff: *"Si un visitante dice que no le llegó el
correo, pídele que se registre igual con su email; lo enviamos después
del evento."*

### Verificación post-fix

```bash
curl -s -X POST https://ccb.contan2.com/api/credentials/CCB-VPGUCM/send \
  | jq '{ok,id}'
# → { "ok": true, "id": "..." }
```

Marcelino verifica que llega a su inbox.

---

## Escenario 3 — Scanner devuelve 401 / sesión perdida masiva

### Detección

- Staff con el scanner reporta "me sacó". Pantalla pide PIN.
- Esto **es normal** cada ~12 horas (TTL de la sesión staff).
- Si ocurre a varios staff simultáneamente y NO acaba de pasar el
  TTL, puede ser cookie corrupta o cambio de `STAFF_PIN` env var.

### Acción

1. **Re-login con PIN.** El PIN por defecto del bootstrap es `2828`.
   Si Marcelino lo cambió, usar el que él haya definido.
2. Verificar valor de PIN en runtime con:
   ```
   curl -s -X POST https://ccb.contan2.com/api/staff/login \
     -H 'Content-Type: application/json' \
     -d '{"pin":"2828"}'
   ```
   - 200 → PIN sigue siendo 2828
   - 401 → PIN cambiado o vacío. Verificar `STAFF_PIN` en Coolify env
     vars de la app.

3. Si el PIN está bien y aun así no entra: revertir al deploy
   conocido bueno (escenario 1).

### Nota

Cada tablet/dispositivo debe loguearse independientemente. Si el
staff cambia de dispositivo, normal volver a meter el PIN.

---

## Escenario 4 — DB responde lento / errors 500 generalizados

### Detección

- Logs de Coolify con stack traces que mencionen `pg`, `pool`,
  `connection`, `timeout`.
- `/healthz` responde rápido (no toca DB) pero `/api/_tenant` o
  endpoints reales tardan mucho o devuelven 500.
- Latencias de los endpoints visiblemente altas (>5s).

### Acción

**NO reiniciar la app a ciegas.** Reiniciar mientras hay tráfico
puede empeorar (cold start del pool, reconnect storm).

1. **Diagnóstico read-only en Coolify** → tab "Logs" → buscar líneas
   con `error` y `pool`.
2. Si es saturación de conexiones: el problema NO se resuelve con
   revert — la causa puede ser un query lento en un endpoint nuevo.
   Identificar cuál y pausarlo si es posible.
3. Si los logs no muestran nada raro y solo es lentitud:
   - Verificar que Postgres no está en pausa en Coolify
     (panel del servicio postgres).
   - Verificar uso de disco del VPS: si el volumen está lleno, la DB
     se cae sola.
4. **Avisar a Marcelino antes de cualquier acción correctiva.** Esto
   no es un revert simple.

### Verificación

Si fue saturación temporal y se calma:
```
time curl -s https://ccb.contan2.com/api/_tenant > /dev/null
# < 1s ideal
```

### Si no se resuelve

Acción nuclear: redeploy de la app (resetea pool de conexiones del
backend). NO toca la DB. Si el problema persiste, el problema está
en Postgres, no en la app — coordinar con quien administra el VPS.

---

## Escenario 5 — Branding aparece roto en kiosko (logo no carga, colores incorrectos)

### Detección

- Kiosko abre pero el logo es el viejo, o los colores son los default
  (azul CCB legacy en lugar del turquesa `#0182a2`).
- En el HTML servido, falta el bloque `<style data-branding-ssr>`, o
  está con la paleta vieja.

### Causa probable

La caché LRU de `resolveTenant` (5 minutos) tiene una versión vieja.
O la sessionStorage del navegador del kiosko cacheó un tenant viejo.

### Acción

**Lado servidor:**

Si el SSR del HTML servido NO contiene los colores esperados:

```bash
curl -s https://ccb.contan2.com/kiosko | grep -o '<style data-branding-ssr>.\{0,120\}'
```

- Si contiene `#0182a2` → server OK, problema en el navegador.
- Si contiene azul viejo → caché del LRU. Forzar invalidación:
  hacer un PATCH dummy al branding (no cambia nada):
  ```bash
  curl -s -X PATCH https://ccb.contan2.com/api/org/branding \
    -H 'Content-Type: application/json' \
    -d '{}'
  ```
  (invalida la caché vía `invalidateTenantCache(slug)`).

- Si sigue mal: redeploy en Coolify (resetea proceso → resetea LRU).

**Lado navegador (tablet del kiosko):**

1. Cerrar la pestaña del kiosko.
2. Abrir DevTools (si la tablet lo permite) y borrar
   `sessionStorage` clave `_c2_tenant_v2`.
3. Si no se puede, **borrar caché del navegador** o usar modo incógnito.
4. Recargar el kiosko (`Ctrl+F5` o `Cmd+Shift+R`).

### Verificación

```bash
curl -s https://ccb.contan2.com/api/_tenant | jq '.primaryColor, .logoUrl'
# → "#0182a2", "/uploads/1778861352720-bf8e54ab45e6.svg"
```

---

## Acción nuclear universal

Si **cualquiera** de los escenarios anteriores no se resuelve en
~5 minutos:

1. **Coolify** → http://217.77.12.180:8000/application/f3xck8spocf0o377y9w0vq6n
2. Tab **Deployments** → encontrar el deployment de `4c62e92`
   (último deploy conocido sano).
3. Click **"Redeploy"** (NO "Force rebuild").
4. Esperar 60–90s. Verificar healthcheck.
5. Si aún falla: el problema NO es el código nuevo — es infraestructura.
   Avisar al sysadmin del VPS.

### Recuperar usuarios perdidos en data

Si por algún motivo se perdieron datos durante el incidente (ojalá no
pase, pero contingencia):

- El dump de Postgres que Marcelino debe haber generado el **jueves
  21 en la noche** se restaura siguiendo `backup-pre-event.md` en
  reverso. **Cualquier dato del viernes posterior al backup se pierde**
  → contactar a Marcelino antes de restaurar.
