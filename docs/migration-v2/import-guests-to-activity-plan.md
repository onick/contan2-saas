# Importar lista de invitados a una actividad · plan (v2)

> Borrador 2026-06-15. Caso real: actividad "por invitación" con una lista
> concreta de ~127 personas (37 con email, 90 sin email). Hay que poder
> agregarlas como lista de invitados de ESA actividad, fácil, en un paso.

## El problema (dos trabas del sistema actual)

1. **Invitar es por SEGMENTO, no por lista arbitraria.** El panel "Invitar
   audiencia" elige candidatos de un segmento/afinidad. No hay forma de invitar
   "exactamente estas 127 personas de mi archivo".
2. **Los sin email se excluyen.** `invite-candidates` filtra `noEmail` (el RSVP
   asume mandar el link por correo). 90 de los 127 no tienen email → hoy no se
   podrían invitar.

El endpoint base `POST /activities/:id/invitations {userIds}` SÍ acepta una
lista arbitraria de usuarios EXISTENTES. Falta el puente: de un ARCHIVO (gente
que puede no existir aún, con o sin email) → usuarios → invitaciones.

## La solución: "Importar lista de invitados"

Un flujo que combina lo ya construido (import de usuarios + invitaciones RSVP):
sube un archivo → las personas quedan como lista de invitados de la actividad,
en un paso. Reutiliza casi todo; poco código nuevo.

### UX
- En el **detalle de la actividad** (junto a "Invitar audiencia"/"Protocolo"):
  botón **"Importar lista de invitados"**.
- Elegir archivo (mismo CSV/Excel + misma plantilla del import de usuarios).
- **Vista previa** (sin escribir nada), clasificada PARA ESTA actividad:
  - `nuevo + invitar` — no está en el padrón → se crea y se invita
  - `existente + invitar` — ya está en el padrón (por email) → se invita, NO se
    tocan sus datos
  - `ya invitado` — ya está en la lista de esta actividad → se omite
  - `inválido` — sin nombre → se reporta
  - aviso "posible doble" por nombre (para los sin email, igual que el import)
- **Confirmar** → crea los usuarios faltantes (sin sobreescribir) + agrega a
  TODOS a la lista de invitados de la actividad.
- La lista resultante se ve en el bloque **Invitaciones** del detalle (ya existe):
  enviados/confirmados/sin responder, con cancelar.

### Manejo de los SIN EMAIL (clave del caso)
- Entran a la lista igual (invitación creada, estado `pending`), solo que no
  reciben el link por correo. En la puerta se los recibe por nombre.
- La invitación admite `user_id` sin email; el token existe pero no se envía.

### Reutiliza (poco código nuevo)
- `users-import.ts` (parse CSV/Excel + clasificación + crear sin sobreescribir).
- `activity-invitations.ts` (crear invitación con token/estado/seguimiento).
- `InvitationsSection` (la lista de invitados ya se muestra y se gestiona).
- Puerta: "llegada de reserva" del check-in ya marca presente al invitado que
  llega; el staff busca por nombre a los sin email.
- Export del padrón → también se podrá exportar la lista de invitados (futuro).

## Decisiones (CERRADAS · 2026-06-15)

1. **Sin email entran a la lista**: SÍ. Quedan como invitados `pending` sin
   recibir correo; se reciben en puerta por nombre.
2. **Email de invitación**: NO se envía al importar (solo arma la lista). Los
   que tengan email se invitan por correo después, con el botón aparte.
3. **Puerta**: INFORMATIVO. El check-in marca "en la lista / no está" pero NO
   bloquea. (Modo estricto = fase 2, no ahora.)

## PRs
- **PR-1 (API)**: `POST /activities/:id/import-guests?commit=false|true`
  (multipart, owner/admin). Reusa parser + crea usuarios faltantes + crea
  invitaciones para TODAS las filas válidas. Preview clasifica por actividad.
  Opción `sendEmail`. Audit `activity.guests_imported`.
- **PR-2 (Web)**: botón + drawer "Importar lista de invitados" en el detalle de
  la actividad; la lista se ve en el bloque Invitaciones existente.
- **PR-3 (opcional)**: realce en el check-in — al buscar a alguien en una
  actividad por invitación, mostrar "está/no está en la lista".

## No se pierde, pero queda fuera del import básico
Tratamiento (Sra/Dr) y cargo de la lista de Santo Domingo no van al padrón;
para esos invitados de protocolo, designarlos en el módulo Protocolo (guarda
honorífico + cargo) e invitarlos con "Invitar protocolo".
