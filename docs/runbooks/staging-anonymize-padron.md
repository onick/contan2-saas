# Anonimizar el padrón de staging (REP-A08 · decisión P3)

1. Solo staging: `scp scripts/staging/anonymize-padron.sql` al VPS y, con respaldo previo, `psql -U postgres -d postgres -v confirm=STAGING -f anonymize-padron.sql`. Lo corre una persona; nunca CI.
2. Reemplaza nombres por `Visitante NNNN`, correos por `vNNNN@anon.local`, teléfonos por `809-555-NNNN` (también contactos de reservas de sala y notas libres de protocolo). **Conserva `users.code`**, ids y toda la asistencia.
3. Guardas: aborta sin `-v confirm=STAGING`, si `current_database()` no es `postgres` o si alguna organización tiene dominio propio verificado; todo en una transacción con verificación final.
4. Idempotente: re-correrlo deja el mismo resultado (la numeración sale del orden por organización y código; filas nuevas pueden correr el número).
5. Después: GET `period.xlsx` y `activity/<id>.xlsx` con las sesiones del harness; no debe aparecer ningún `@` real ni teléfono real. No hay rollback: restaurar desde el respaldo si hiciera falta.
