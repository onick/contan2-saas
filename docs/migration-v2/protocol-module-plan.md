# Módulo Protocolo · plan (v2)

> Borrador 2026-06-11 · pendiente de validación de alcance con el usuario.

## Qué es

Gestión de **invitados especiales** del centro (autoridades, diplomáticos,
prensa, patrocinadores, directivos, artistas): designarlos, invitarlos
formalmente a actividades, confirmar asistencia, recibirlos con trato
diferenciado en puerta y reportar su asistencia. Es distinto del segmento
"VIP" actual (ese es automático por frecuencia ≥10 visitas); protocolo es una
**designación manual e institucional**.

## Principio de diseño

Cero sistemas paralelos: protocolo se monta SOBRE los rieles ya construidos —
`users` (identidad + credencial QR), `invitations` (RSVP con token, cupo
atómico, expiración), check-in console/scanner, emails branded (y WhatsApp
cuando haya credenciales de Meta), reportes.

## Modelo de datos (aditivo, cero impacto en v1)

1. **`protocol_profiles`** (tabla nueva · migración 029)
   - `user_id` FK→users (PK), `organization_id`, `category`
     (autoridad | diplomatico | prensa | patrocinador | directivo | artista | otro),
     `honorific` ("Sr. Embajador", "Dra."), `org_title` (institución y cargo),
     `notes`, `active`, `created_by`, timestamps.
   - La persona sigue siendo un `user` normal: mismo código/QR/historial.
2. **`invitations.kind`** (columna nueva con DEFAULT 'audience' · migración 030)
   - 'audience' | 'protocol'. v1 inserta con columnas explícitas → el default
     la hace invisible para v1 (verificar INSERTs de v1 antes de aplicar).
   - `invitations.plus_ones` (int default 0): acompañantes autorizados; al
     confirmar, el cupo descuenta 1+plus_ones (mismo patrón companions del
     kiosko).

## PRs (mismo pipeline: chico, CI 8/8, staging, verificación)

- **PR-1 · DB + contratos**: migraciones 029/030 (staging primero, con OK),
  schema.ts + parity test, schemas zod.
- **PR-2 · API protocolo**: CRUD de designaciones (owner/admin; audit
  `protocol.designated/updated/removed`), listado con filtro por categoría,
  e invitar lote de protocolo a una actividad (reusa el motor RSVP con
  `kind='protocol'` y `plus_ones`; email con plantilla más formal).
- **PR-3 · UI /app/protocolo**: directorio de protocolo (categorías, buscar,
  designar desde un visitante existente o crear uno nuevo con el flujo de
  usuarios), editar/desactivar. Item nuevo en el sidebar (grupo Audiencia).
- **PR-4 · Protocolo en la actividad**: en el detalle, junto a "Invitar
  audiencia", panel "Invitar protocolo" (selección por categoría, acompañantes
  por invitado) + bloque de seguimiento separado (confirmados/pendientes).
- **PR-5 · Puerta**: al escanear o buscar en check-in a un invitado de
  protocolo → banner distintivo ("PROTOCOLO · Sr. Embajador X · +2
  acompañantes") con prioridad visual; lista de protocolo del evento
  imprimible/exportable para la puerta.
- **PR-6 · Reporte**: sección de protocolo en el reporte por actividad
  (invitados/confirmados/asistieron, por categoría).

## Decisiones abiertas (confirmar antes de PR-1)

1. **Categorías**: ¿las propuestas sirven o Protocolo del CCB usa otras?
2. **Acompañantes**: ¿se autorizan por invitación (+N por invitado)? ¿máximo?
3. **Puerta**: ¿basta el banner en scanner/check-in o hace falta una vista
   dedicada "puerta de protocolo"?
4. **Asientos**: ¿se necesita asignación de asientos/filas reservadas? (No
   incluido en este plan; sería una fase 2.)
5. **Quién gestiona**: asumo owner/admin (operator solo ve el banner en puerta).
