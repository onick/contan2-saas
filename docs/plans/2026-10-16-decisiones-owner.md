# Decisiones del owner · 2026-10-16

El owner delegó: "tienes mi ok para tomar las mejores decisiones" (tras la lista de 8 decisiones abiertas). Decisiones tomadas por el orquestador y su justificación. Referencias: `docs/plans/2026-10-16-qa-consolidado.md` (sección 6).

| # | Tema | Decisión | Justificación | Ejecución |
|---|---|---|---|---|
| 6.1 | RBAC en prod | **Hotfix API-only** `hotfix/rbac-prod-api` (a25688e + a895b03 + 934c3a6 + b4a479d). Rollback exacto: rama `release/prod-api-a25688e`. | Fuga de PII activa en prod; cambio acotado, sin migraciones ni contratos, 623 tests. El release completo espera a cerrar la ola de fixes y a las migraciones de Biblioteca. | Hecho hoy. |
| 6.3 | Qué ven operator y consulta | UI = API para escrituras y módulos cerrados (PR-5), **pero Reportes queda visible en solo lectura** (dashboard/KPIs sin botones de export) para operator y consulta, porque la API ya les sirve period-summary/categories. | Un operador de departamento necesita ver el dashboard de asistencia; las exportaciones siguen reservadas a owner/admin/puerta. Avisar al CCB del cambio de barra. | PR-9 (Reportes). |
| 6.4 | % de ocupación | **Una sola definición: personas en sala / aforo** en dashboard, Excel y PDF. | Es la que usa el dashboard y la que entiende el departamento (aforo se mide en personas). | PR-9. |
| 6.5 | KPI "check-ins hoy" | Cifra principal = **personas** (con acompañantes); secundaria = registros. Igual en consola, badge y dashboard. | Lo que importa en la puerta es cuánta gente entró. | PR-8b. |
| 6.6 | Excel mensual | **Reproducir el formato oficial del departamento**: hoja "Resumen Mensual" separada (pivote por tipo), listas ocultas y validación de datos (dropdowns). | Memoria "Formato Excel oficial del depto": v2 debe reproducirlo o mejorarlo; hoy les obliga a retrabajar. | PR-9. |
| 6.7 | Identidad de los PDF | Unificar al estilo del PDF de período (naranja de marca, logo en tarjeta blanca). | Coherencia de marca; el logo ilegible sobre marrón es un defecto. | PR-9. |
| 6.8 | "Renovar (+14 días)" | Sumar 14 días **al vencimiento vigente** (lo que dice la UI), con tope de 2 renovaciones. | La UI promete eso; renovar el mismo día no puede dar 0 días. | PR-3b. |
| 6.2 / 6.9 | Token de marca | Calcular el color de texto del CTA por luminancia del color del tenant (texto oscuro sobre #f39228) y un `--color-brand-text` oscurecido para texto naranja chico; mantener #e65100 como CTA en kiosko/escáner/landing. | Pasa AA sin obligar al tenant a elegir otro color. | PR-11. |
| 6.x | meta-viewport | **Escáner**: permitir zoom (es el teléfono del staff; WCAG 1.4.4). **Kiosko**: mantener zoom bloqueado y documentarlo como excepción de modo kiosko (una tablet pública no debe quedar ampliada). | Operación real del kiosko vs accesibilidad del staff. | PR-12b (una línea) + nota en a11y-baseline. |
| 6.19 | Logout del escáner | Cookie con TTL de 8 h → **revocación server-side ligera**: `token_version` por organización o lista de revocados con TTL; "Salir" invalida. | Un token robado hoy vale 8 h. | PR-15b. |
| 6.20 | RSVP-01 | Sembrar un token RSVP conocido en el seed de staging (en vez de dar SSH al runner). | Menos superficie; reproducible. | PR-14 (seed). |
| 6.21 | Check-in público sin sesión y QR en confirmación | Mantener el diseño del kiosko; **la confirmación muestra el QR solo si el visitante se identificó por código o es nuevo**; si llegó por sugerencia de nombre, muestra "Listo, [Nombre]" sin QR. | Cierra el vector "elijo a otra persona y veo su credencial" sin romper el flujo. | PR-15c. |
| Q1-05 | Oráculo de `/login/api/find` | Aceptar por ahora con el límite de 5/min; registrar como riesgo. Alternativa futura: enviar el enlace por correo. | Buscar el centro por correo es la función; sin confirmar no sirve. | Riesgo documentado. |
| Q1-03 | Host de tenant desconocido | Login **neutro** con marca contan2 (sin logo ni nombre del CCB). | Un tenant no puede heredar la identidad de otro. | PR-16. |
| Q1-01/02/04/06/07/09 | Endurecimiento de auth | Corregir todos. | S1 (logout) + S2. | PR-16. |
| Residuos [E2E] en staging | Purgar títulos/sitio de Biblioteca y bookings cancelados [E2E]; re-sembrar tokens de reset e invitación; limpiar `signup_verifications` de prueba. | Datos de prueba sin API de borrado; habilitan repetir AUTH-10/11. | Hoy, SQL acotado por prefijo. |
| Q6 Plataforma | Sigue bloqueada: el orquestador no puede sembrar un platform_admin (bloqueo del clasificador). | Requiere acción directa del owner (correr el bloque comentado del seed o dar credencial). | Pendiente del owner. |
| PR-13 tuteo | Se ejecuta al final de la ola para evitar conflictos. | Toca 219 + 110 líneas. | Tras PR-9/11/16. |
