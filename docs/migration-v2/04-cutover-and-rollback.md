# 04 · Cutover y rollback

> Plan para mover tráfico del stack v1 (Express + Vanilla) al stack v2 (Fastify + Next.js) **sin downtime ni pérdida de datos**.
> Esta fase NO se ejecuta automáticamente. Requiere aprobación expresa del operador con todos los criterios cumplidos.

## Filosofía

- **Sin big-bang**. Cutover por subdomain / ruta / módulo, no de golpe.
- **Tráfico progresivo**. Empezamos con 1% canary, escalamos por horas.
- **Rollback siempre listo**. En cualquier punto, revertir DNS / Coolify a v1 < 5min.
- **DB es la fuente única**. Ambos stacks comparten Postgres → cero riesgo de divergencia.

## Pre-requisitos (TODOS deben estar ✓ antes de proponer cutover)

### Funcional
- [ ] Matriz de paridad funcional al 100% para los 10 módulos (`02-functional-parity-matrix.md`)
- [ ] CCB renderiza idéntico (visual + funcional) en v2 vs v1 — verificación por screenshot diff
- [ ] Kiosko v2 operativo con flujo completo welcome → confirmation
- [ ] Reportes PDF/Excel generados por worker producen output equivalente

### Seguridad
- [ ] Cero P0 abiertos
- [ ] Cero P1 abiertos
- [ ] RLS habilitado en todas las tablas tenant-aware
- [ ] Tests de aislamiento cross-tenant pasando

### Operacional
- [ ] Tests unit + integration + E2E pasan en CI
- [ ] Cobertura objetivo (auth 90%, attendance 85%, resto 70%) verificada
- [ ] Worker procesa 10,000 jobs sintéticos sin pérdida
- [ ] Storage R2 sincronizado, dual-write verificado por 7 días

### Datos
- [ ] Migrations probadas en staging contra snapshot fresco de prod
- [ ] Backup pre-cutover ejecutado y restaurado en staging exitosamente
- [ ] Conteo de filas en cada tabla critical match entre v1 y v2 lectura

### Plan
- [ ] Documento `04-cutover-and-rollback.md` revisado y aprobado
- [ ] Runbook de rollback paso-a-paso ejecutado en staging
- [ ] Ventana de despliegue acordada (horario bajo tráfico — para CCB: domingo madrugada)
- [ ] Operador disponible durante ventana + 24h post

## Estrategia de cutover

### Fase A — Soft launch con tenant interno (1 día)

1. Crear tenant `demo` en v2 (no afecta CCB).
2. Operador hace test runs completos: registro, check-in, RSVP, reportes, branding.
3. Si todo OK → siguiente fase.

### Fase B — Canary CCB read-only (4 horas)

1. Endpoints de lectura (`GET /api/users`, `GET /api/activities`, etc.) del v2 reciben 1% del tráfico via reverse proxy (Coolify route weighting o Cloudflare).
2. v2 NO escribe — solo lee.
3. Compare responses: v1 vs v2 deben ser idénticas (script de diff automatizado).
4. Si 1h sin discrepancias → escalar a 10%, 25%, 50%, 100% por hora.

### Fase C — Canary CCB write (24-48 horas)

1. Endpoints de escritura (POST/PUT/DELETE) del v2 reciben 1% del tráfico.
2. v2 escribe a la misma Postgres que v1.
3. Audit log doble-track: cada write se loguea con `source=v1|v2` para análisis.
4. Si 6h sin errores → escalar gradual igual que Fase B.
5. Si error rate v2 > v1 + 0.5% → rollback automático.

### Fase D — Frontend cutover (cuando back v2 ya es 100%)

1. Frontend v2 (Next.js) desplegado en subdomain `next.ccb.contan2.com`.
2. Operador y staff CCB lo prueban por 7 días en paralelo con el frontend viejo.
3. Si OK, redireccionar DNS de `ccb.contan2.com` al frontend v2.
4. Frontend v1 queda accesible via `legacy.ccb.contan2.com` por 30 días.

### Fase E — Retiro de v1 (mes 2 post-cutover)

1. Confirmar 30 días sin tráfico a v1.
2. Confirmar zero issues reportados.
3. Operador aprueba retiro.
4. Snapshot final del repo v1 → tag `v1-final-snapshot`.
5. Eliminar containers, código en branch `legacy/v1-archive`.

## Rollback procedures

### Rollback dentro de Fase B (read-only canary)

**Síntoma**: discrepancias > 0.1% en diff de responses.
**Acción**: cambiar peso del proxy a 0% v2. Tiempo: < 1 min via Coolify dashboard.
**Comunicación**: notificar al equipo, NO al usuario final (no hubo write impact).

### Rollback dentro de Fase C (write canary)

**Síntoma**: error rate v2 > umbral, o reportes de usuarios con datos incorrectos.
**Acción**:
1. Cambiar peso del proxy a 0% v2. < 1 min.
2. Auditar audit log: ¿qué writes hizo v2?
3. Si los writes fueron correctos → no hace falta restaurar.
4. Si hubo escrituras erróneas → restaurar tablas afectadas desde backup pre-Fase-C.
5. Re-verificar conteos de filas.

### Rollback de migrations DB

Toda migration v2 debe ser:
- **Idempotente**: aplicar dos veces no rompe.
- **Reversible**: tiene su contra-migration en `migrations/<n>-down.sql`.
- **Aditiva primero**: añadir columnas/tablas nuevas; nunca DROP destructivo hasta confirmar v2 estable.

Rollback de RLS:
```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DROP POLICY users_org_isolation ON users;
```

Rollback de columnas nuevas: dejar sin uso por v1 (que las ignora). No drop hasta retirar v1.

### Rollback total a v1

**Cuándo**: error catastrófico inesperado en v2 post-cutover completo.
**Acción**:
1. Coolify: redeploy de la app `contan2-saas-app` desde tag `v1-pre-cutover` (que existirá pre-cutover). < 5 min.
2. DNS: si hubo cambios, revertir a CNAME/A records previos. < TTL (300s).
3. Comunicar a tenants vía email + status page.
4. Post-mortem documentado en `docs/incidents/`.

## Verificación post-cutover

Para cada fase, ejecutar:

```bash
# 1. Conteo de filas críticas
psql -c "SELECT 'users' AS t, COUNT(*) FROM users UNION ALL
         SELECT 'activities', COUNT(*) FROM activities UNION ALL
         SELECT 'attendance', COUNT(*) FROM attendance UNION ALL
         SELECT 'staff_members', COUNT(*) FROM staff_members"

# 2. Smoke E2E
pnpm test:e2e:prod-readonly

# 3. Health checks
curl -fsSL https://ccb.contan2.com/healthz
curl -fsSL https://ccb.contan2.com/readyz

# 4. Sentry: error rate último 1h
# (check dashboard manual)

# 5. Latencia
# (Coolify metrics / observability platform)
```

Criterios de éxito por fase:
- 0 errores 5xx en API.
- Conteos de filas en match con baseline pre-fase.
- Latencia p95 < baseline + 20%.
- Cero reportes de usuario en canal #ccb-ops.

## Comunicación

Antes del cutover:
- Email a operadores del CCB con fecha y duración esperada.
- Mensaje en kiosko: "Mantenimiento programado: <fecha> · <horas>".

Durante:
- Status page interno con timeline de fases.
- Canal Slack/Discord operativo.

Después:
- Confirmación de éxito (o rollback) al equipo.
- Métricas comparativas v1 vs v2 (latencia, errors, conversion en RSVP, etc.) a 7 días, 30 días.

## Ventana sugerida (para CCB)

- **Día**: domingo (menor tráfico cultural).
- **Hora**: 03:00 a 07:00 AM hora local Santo Domingo.
- **Duración esperada de Fase B**: 4h.
- **Duración esperada de Fase C**: 24-48h (canary write).
- **Total ventana de monitoreo activo**: 7 días post-cutover.

## Quién aprueba qué

| Decisión | Aprueba |
|---|---|
| Inicio FASE 1 (hardening en migration branch) | Operador del producto |
| Merge migration → develop | Operador + revisión código |
| Deploy de FASE 1 a prod (rutas con auth) | Operador con ventana acordada |
| Inicio FASE 4 (vertical slices v2) | Operador del producto |
| Inicio cutover (Fase B canary) | Operador del producto + confirmación criterios |
| Cutover completo (Fase D) | Operador del producto + 7 días sin issues |
| Retiro v1 | Operador del producto |

Ninguna fase se inicia automáticamente. El operador es el gate.
