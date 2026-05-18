# Backup pre-evento — Marcelino ejecuta el jueves 21 may en la noche

**Objetivo:** tener un `pg_dump` reciente, físicamente FUERA del VPS,
para poder restaurar si algo grave sucede durante o después del
evento del viernes 22.

**Quien ejecuta:** Marcelino, desde su laptop. NO Claude desde Coolify.
**Cuándo:** jueves 21 en la noche (lo más tarde posible para minimizar
ventana de pérdida en caso de restauración).

---

## 1. Pre-requisitos en la laptop de Marcelino

Verifica una sola vez:

```bash
# Tener pg_dump client. Si usa macOS:
brew install postgresql@16

# Verificar versión cliente (debe ser 16+ para garantizar compat):
pg_dump --version
# pg_dump (PostgreSQL) 16.x.x
```

> Si la versión del cliente es menor que la versión del server
> Postgres, `pg_dump` puede emitir warnings o fallar. Mejor cliente
> 16+ por las dudas.

---

## 2. Obtener `DATABASE_URL` desde Coolify

**Importante:** nunca pegues este valor en chat, log, ni archivo que
sincronice a la nube sin cifrar. Es la llave de la DB de producción.

1. Login al panel: http://217.77.12.180:8000/login
2. Aplicación: `contan2-saas-app`
   (UUID `f3xck8spocf0o377y9w0vq6n`)
3. Tab **Environment Variables**
4. Localiza `DATABASE_URL`. Copia el valor.
5. **Importante:** la URL probablemente apunte a un host interno de
   Coolify (e.g., `postgresql://user:pass@coolify-postgres-NNN:5432/db`).
   Eso NO es accesible desde tu laptop directamente.

### 2.1 Si la URL es interna del network Coolify

Hay dos formas:

**Opción A — Exponer el puerto temporalmente** (recomendada para esta
operación puntual):

1. En Coolify, tab del servicio Postgres (no la app) → "Network" →
   "Exposed ports" → agregar mapeo `5432:5432`. Apply.
2. Espera a que el servicio reinicie (segundos).
3. Reemplaza el host de la `DATABASE_URL` por `217.77.12.180`:
   - Original: `postgresql://user:pass@coolify-postgres-XXXX:5432/db`
   - Externa: `postgresql://user:pass@217.77.12.180:5432/db`
4. **Después de hacer el dump**, vuelve a Coolify y **quita** el
   exposed port. La DB no debe quedar pública.

**Opción B — Túnel SSH** (más seguro pero requiere acceso SSH al VPS,
y `fail2ban` activo bloquea intentos fallidos):

```bash
# Solo si Marcelino tiene la llave SSH del VPS y está coordinado con
# el sysadmin (recordatorio: el VPS aloja también silex-pms; no
# improvises).
ssh -L 15432:localhost:5432 root@217.77.12.180

# En otra terminal, mientras el túnel está abierto:
export DATABASE_URL='postgresql://user:pass@localhost:15432/db'
# luego pg_dump como abajo
```

> **Recomendación:** opción A para minimizar riesgo de bloqueo SSH.
> Y mover la base ratoneable a privada apenas termine el dump.

---

## 3. Ejecutar `pg_dump`

```bash
# Ajusta DATABASE_URL al valor de Coolify (no la dejes hardcoded en
# .bash_history; usa una shell sin history o exporta env por una sola
# sesión).
read -s -p "DATABASE_URL: " DATABASE_URL
export DATABASE_URL

# Carpeta para dumps:
mkdir -p ~/contan2-backups
cd ~/contan2-backups

# Dump en formato custom (-Fc) con compresión nivel 6.
# Esto es lo que pg_restore necesita; mucho más práctico que -Fp.
STAMP=$(date +%Y%m%d-%H%M%S)
DUMPFILE="contan2-${STAMP}.dump"

pg_dump --no-owner --no-acl -Fc -Z 6 -f "$DUMPFILE" "$DATABASE_URL"

echo "Hecho. Archivo: $(pwd)/$DUMPFILE"
ls -lh "$DUMPFILE"
```

**Tamaño esperado:** con los datos actuales del CCB (~80 usuarios, 2
actividades, ~80 asistencias) el dump debe estar entre 100 KB y 2 MB.
Si sale mucho más grande, no es alarmante (puede ser por inflación
de índices); si sale 0 bytes o falla, ver troubleshooting abajo.

---

## 4. Verificar el dump

```bash
# Listar contenido del dump sin restaurar:
pg_restore --list "$DUMPFILE" | head -40

# Esperado: ver líneas como
#  - SCHEMA - public
#  - TABLE DATA - public organizations
#  - TABLE DATA - public users
#  - TABLE DATA - public activities
#  - TABLE DATA - public attendance
#  ...
```

Si la lista es vacía o solo tiene metadata sin TABLE DATA, **el dump
está malo, repetir**.

---

## 5. Guardar el dump FUERA del VPS

Opciones (cualquier una, idealmente dos):

1. **Carpeta local** en la laptop de Marcelino. Backup mínimo.
2. **Disco externo / USB** cifrado.
3. **iCloud / Google Drive** carpeta privada. (Tu cuenta personal, no
   compartida.) Si es ahí, cifra el archivo antes:
   ```bash
   gpg --symmetric --cipher-algo AES256 "$DUMPFILE"
   # Pedirá passphrase, generará "$DUMPFILE.gpg".
   # Sube el .gpg, NO el .dump plano.
   ```

**NO** lo subas a un canal de Slack, Discord, o repositorio Git.

---

## 6. Después del dump

1. **Si usaste Opción A** (puerto expuesto): regresa a Coolify y
   quita el `5432:5432` exposed port. Verifica que el servicio
   Postgres NO esté accesible desde Internet:
   ```bash
   # Desde tu laptop:
   nc -vz 217.77.12.180 5432
   # → "Connection refused" o similar. Si conecta, el puerto sigue
   #   abierto y hay riesgo.
   ```
2. Apunta en tu agenda dónde dejaste el dump y cuándo expira tu
   recordatorio (puedes borrarlo a los 30 días si no hubo incidente).

---

## 7. Restaurar (solo si hay incidente real)

Esto **NO** se hace durante el evento sin coordinar. Es para
contingencias post-evento.

```bash
# Verifica primero qué tabla quieres recuperar. Restaurar TODO el
# dump pisa datos posteriores al backup → pierdes lo del evento.

# Restaurar tabla específica (ejemplo: users):
pg_restore --no-owner --no-acl \
  --table=users \
  --data-only \
  -d "$NUEVA_DATABASE_URL" \
  "$DUMPFILE"

# Restaurar TODO (peligroso, solo si la DB está vacía o destruida):
pg_restore --no-owner --no-acl \
  --clean --if-exists \
  -d "$NUEVA_DATABASE_URL" \
  "$DUMPFILE"
```

**Antes de cualquier `pg_restore --clean`** que pise datos vivos:
hacer otro dump del estado actual roto, por las dudas. Reglas duras:
DB sagrada, no se hace destructive sin doble check humano.

---

## Troubleshooting

### `pg_dump: error: connection to server at "..." failed`

- Verifica que el host de `DATABASE_URL` es alcanzable desde tu laptop
  (`ping <host>` y `nc -vz <host> 5432`).
- Si usaste opción A: confirma que expusiste el puerto en Coolify.
- Si usaste opción B: confirma que el túnel SSH está activo.

### `pg_dump: error: server version: X; pg_dump version: Y`

- Tu cliente es más viejo que el server. `brew install postgresql@16`
  e usa `/opt/homebrew/opt/postgresql@16/bin/pg_dump` explícito.

### `permission denied` o `role does not exist`

- La URL que copiaste apunta a un user sin permisos suficientes.
  Verifica en Coolify que estás copiando la URL principal de Postgres
  (no una de read-only u otro user).

### El archivo final es muy pequeño (<1 KB)

- `pg_dump` falló en silencio. Revisa con `pg_restore --list`. Si está
  vacío, repite con `-v` (verbose) y captura el error.

---

## Resumen para Marcelino (versión corta)

```bash
# 1. Expone puerto en Coolify (postgres service → network → 5432:5432)
# 2. Copia DATABASE_URL pero reemplaza el host por 217.77.12.180
# 3. En la laptop:
mkdir -p ~/contan2-backups && cd ~/contan2-backups
export DATABASE_URL='postgresql://...@217.77.12.180:5432/...'
STAMP=$(date +%Y%m%d-%H%M%S)
pg_dump --no-owner --no-acl -Fc -Z 6 -f "contan2-${STAMP}.dump" "$DATABASE_URL"
pg_restore --list "contan2-${STAMP}.dump" | head    # verificar
# 4. Vuelve a Coolify y quita el puerto expuesto
# 5. Guarda el .dump en disco externo o cifrado en cloud personal
```

**Total tiempo estimado:** 10–15 minutos incluyendo el ida y vuelta
de exponer puerto.
