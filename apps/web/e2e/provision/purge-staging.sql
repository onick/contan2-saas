-- ============================================================================
-- purge-staging.sql · limpieza de datos E2E por prefijo (SOLO STAGING)
-- La corre el ORQUESTADOR, con OK explicito por accion, DESPUES de revisar el conteo.
--   docker exec -i <DB_STAGING> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v run="E2E-20261016-0930-ab12" < purge-staging.sql
-- Sin -v run=... purga TODOS los [E2E] (cualquier corrida).
-- Por defecto termina en ROLLBACK (solo muestra conteos). Para aplicar: -v apply=1
-- Scope: organizacion ccb; solo filas con prefijo "[E2E]" o email e2e+...@test.local.
-- NUNCA toca users.code reales ni filas sin prefijo.
-- ============================================================================
\if :{?run}
\else
\set run ''
\endif
\if :{?apply}
\else
\set apply 0
\endif

begin;

create temp table _e2e_org as select id from organizations where slug = 'ccb';
create temp table _e2e_act as
  select a.id from activities a, _e2e_org o
  where a.organization_id = o.id
    and (a.name like '[E2E] ' || :'run' || '%'
         -- REP-A25: el ciclo/categoria '[E2E] ...' vive en la actividad y aparece en
         -- /reports/categories y en los reportes de periodo; se va con la actividad.
         or a.category like '[E2E] ' || :'run' || '%');
create temp table _e2e_usr as
  select u.id from users u, _e2e_org o
  where u.organization_id = o.id
    and u.email like 'e2e+' || lower(:'run') || '%@test.local';

\echo '--- A borrar (conteos) ---'
select (select count(*) from _e2e_act)  as actividades,
       (select count(*) from _e2e_usr)  as visitantes,
       (select count(*) from attendance at where at.activity_id in (select id from _e2e_act)
                                            or at.user_id in (select id from _e2e_usr)) as asistencias,
       (select count(*) from invitations i where i.activity_id in (select id from _e2e_act)
                                            or i.user_id in (select id from _e2e_usr)) as invitaciones;

-- Dependientes primero.
delete from invitations i where i.activity_id in (select id from _e2e_act) or i.user_id in (select id from _e2e_usr);
delete from attendance at where at.activity_id in (select id from _e2e_act) or at.user_id in (select id from _e2e_usr);
delete from activities a where a.id in (select id from _e2e_act);
delete from users u where u.id in (select id from _e2e_usr);

-- Biblioteca (si existen las tablas en staging): titulos/ejemplares [E2E] y sitio E2E-Sitio.
-- Descomentar solo tras revisar con SELECT y con OK del owner (FKs: prestamos/reservas/inventarios primero).
-- delete from biblio_loans where item_id in (select i.id from biblio_items i join biblio_titles t on t.id = i.title_id where t.title like '[E2E]%');
-- ...

-- Cuenta aceptada desde la invitacion de prueba (reinicia AUTH-11): descomentar para re-sembrar el flujo.
-- update staff_members set deleted_at = now(), status = 'deleted'
--  where email = 'e2e-invitado@test.local' and organization_id in (select id from _e2e_org);

\echo '--- Estado final (transaccion) ---'
select (select count(*) from activities where name like '[E2E]%' or category like '[E2E]%') as actividades_e2e_restantes,
       (select count(distinct category) from activities where category like '[E2E]%') as ciclos_e2e_restantes,
       (select count(*) from users where email like 'e2e+%@test.local') as visitantes_e2e_restantes;

\if :apply
  \echo 'APLICANDO: COMMIT'
  commit;
\else
  \echo 'DRY-RUN: ROLLBACK (usar -v apply=1 para aplicar)'
  rollback;
\endif
