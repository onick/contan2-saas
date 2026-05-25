# Runbook · Sistema de autenticación

> Operación del sistema de auth del Sprint 1. Cubre setup inicial, casos
> de soporte comunes, y degradación segura.
>
> Última revisión: 2026-05-25

---

## Setup inicial (post-deploy del Sprint 1)

### 1. Verificar que las migraciones aplicaron

Tras el deploy a producción, las migraciones 014-019 corren automáticamente
en el boot del contenedor. Verificar en logs de Coolify:

```
[migrations] ✓ 014_staff_members
[migrations] ✓ 015_staff_sessions
[migrations] ✓ 016_staff_password_resets
[migrations] ✓ 017_platform_admins
[migrations] ✓ 018_platform_sessions
[migrations] ✓ 019_platform_password_resets
```

Si alguna falla → el contenedor crash-loopea. Investigar el SQL antes de
re-intentar.

### 2. Crear el platform admin (Marcelino)

Desde el VPS o tu máquina con acceso al backend en producción:

```bash
cd backend
DB_DRIVER=postgres DATABASE_URL=... \
  node scripts/seed-platform-admin.mjs \
    --email mfranciscomartinez@gmail.com \
    --name "Marcelino Francisco Martinez"
```

Output (a stdout) incluye la password temporal. Guárdala en tu password
manager. El email también va automáticamente al destinatario.

### 3. Crear el tenant owner (Karen del CCB)

```bash
cd backend
DB_DRIVER=postgres DATABASE_URL=... \
  node scripts/seed-tenant-owner.mjs \
    --org ccb \
    --email lopezsalvatory@gmail.com \
    --name "Karen López"
```

Mismo formato de output. Karen recibe email con su password temporal.

### 4. Configurar `admin.contan2.com` en Coolify

Para que el platform login funcione:
- Cloudflare: agregar registro A `admin.contan2.com` → IP del VPS
- Coolify: agregar `admin.contan2.com` a los dominios de la app
- Esperar Let's Encrypt (1-2 min)

### 5. Smoke E2E manual

1. Karen entra a `https://ccb.contan2.com/login`, ingresa su email +
   password temporal → debe redirigir a `/?must_change=1`. Cambia
   password. Entra al panel normal.
2. Marcelino entra a `https://admin.contan2.com/login` → mismo flow.
   Llega al platform-dashboard.
3. Probar forgot-password con un email random → no debe revelar si
   existe o no (siempre respuesta 200).
4. Probar el PIN viejo en `ccb.contan2.com` → todavía debe funcionar
   (deprecation period). Loggea en el panel.

---

## Casos de soporte

### "Olvidé mi password"

**Self-service (preferido):**
1. En `/login`, click "¿Olvidaste tu contraseña?"
2. Ingresa email
3. Revisa bandeja (y spam) — link válido 1h
4. Click en el link → form de nueva password

**Manual (solo si self-service falla):**
- Tenant owner: el super admin (Marcelino) puede resetear ejecutando el
  script `seed-tenant-owner.mjs --no-email` con una password nueva ad-hoc
  (próxima versión: endpoint `/api/platform/tenants/:id/reset-owner`).
- Super admin: solo otro super admin puede resetear. Mientras Marcelino
  sea el único, requiere intervención manual a la DB:
  ```sql
  -- Generar hash con argon2 (usar el shell de node)
  -- node -e "import('@node-rs/argon2').then(m => m.hash('newpass').then(h => console.log(h)))"
  UPDATE platform_admins
     SET password_hash = '$argon2id$...',
         must_change_password = TRUE,
         failed_attempts = 0,
         locked_until = NULL
   WHERE email = 'mfranciscomartinez@gmail.com';
  ```

### "Mi cuenta está bloqueada"

Causa: 5+ intentos fallidos en 15 min → lock escalado (30min / 1h / 24h).

**Esperar la duración del lock** (ver tabla en el spec).

**Desbloqueo manual** si urge:
```sql
UPDATE staff_members  -- o platform_admins
   SET failed_attempts = 0,
       locked_until = NULL,
       lock_level = 0
 WHERE email = '...';
```

### "Recibí un email de nuevo login que no fue yo"

Indica que alguien con credenciales válidas ingresó desde nueva IP. Acción
recomendada:
1. Cambiar password inmediatamente (sesión actual sigue válida, otras
   se invalidan al cambiar).
2. Revisar `GET /api/auth/sessions` para ver sesiones activas y revocar
   las desconocidas.

### "El email de recovery no llegó"

1. Verificar bandeja de spam.
2. Verificar que Resend no haya rebotado el email (dashboard Resend).
3. Confirmar que el email exista en `staff_members` (case-insensitive).

---

## Migración del PIN viejo (cronograma)

| Fase | Cuándo | Estado |
|---|---|---|
| T0 - Deploy | Día del merge | Sistema nuevo y PIN viejo conviven |
| T1 - Seed Marcelino + Karen | T0 + 1h | Cuentas reales creadas |
| T2 - Smoke validado | T0 + 3 días | Confirmación de que el nuevo flow funciona |
| T3 - Deprecation del PIN | T0 + 7 días | `/api/staff/login` retorna 410 Gone |
| T4 - Remove del código | T0 + 14 días | Cleanup del PIN legacy |

---

## Endpoints disponibles (referencia)

### Tenant (`/api/auth/*`)
- `POST /login` `{email, password, rememberMe?}`
- `POST /logout` (autenticado)
- `GET /me` (autenticado)
- `POST /forgot-password` `{email}`
- `POST /reset-password` `{token, newPassword}`
- `POST /change-password` `{currentPassword, newPassword}` (autenticado)
- `GET /sessions` (autenticado)
- `DELETE /sessions/:id` (autenticado, no la actual)

### Platform (`/api/platform/auth/*`)
Mismo set que tenant, pero contra `platform_admins`. Solo accesible desde
`admin.<root>`.

---

## Variables de entorno requeridas

Ya existentes en producción (no cambian):
- `DATABASE_URL` (Postgres)
- `RESEND_API_KEY` (para enviar emails)
- `ROOT_DOMAIN` = `contan2.com`
- `EMAIL_FROM` (sender verificado)

No hay nuevas variables — el Sprint 1 reusa todo lo existente.
