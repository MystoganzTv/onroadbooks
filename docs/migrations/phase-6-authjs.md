# Fase 6: Auth.js e identidades propias

Estado: implementación y pruebas locales/Neon completadas; Google OAuth real certificado en localhost con Auth.js y Neon Development. La invitación real también está certificada; el despliegue/corte siguen pendientes. Producción sigue usando el proveedor anterior. No se ha retirado Supabase.

## Identidad y sesiones

`AUTH_PROVIDER=authjs` activa Auth.js 5.0.0-beta.32 con Credentials y Google. Credentials verifica los hashes scrypt existentes; no cambia contraseñas ni IDs. La sesión JWT cifrada dura el mismo período que antes y revalida que el usuario exista. La autorización obtiene negocio y rol de la base, no del perfil Google ni del token. El borrado de usuario invalida el acceso web y móvil.

La migración `0002_auth-identities-invitations.sql` agrega el schema privado `onroad_auth` y sus tablas Identity/Invitation, con restricciones de unicidad, expiración y FK con borrado en cascada. No modifica las 20 tablas de negocio. Está aplicada en Neon Development. Se importaron las tres identidades Google auditadas desde el inventario cifrado: cada subject conserva el User.id y Business.id existentes. El importador comprueba email, negocio e identidad y falla ante asociaciones incompatibles.

Google exige email verificado y usa PKCE, state y nonce. Un subject ya vinculado conserva su cuenta aunque Google cambie su email. No se vinculan propietarios existentes solo por coincidencia de email; las cuentas migradas se enlazan mediante el inventario de identidades. Un miembro pendiente puede aceptar su invitación con el Google verificado correspondiente, conservando su rol.

Las cookies web anteriores quedan deshabilitadas por defecto en modo Auth.js. Una ventana de transición opcional usa la fecha fija `AUTH_LEGACY_SESSION_UNTIL`; nunca se prolonga en cada petición ni recupera una sesión antigua cuando ya hay una cookie Auth.js. Los bearer y handoff PKCE de móvil conservan su contrato y revalidación de pertenencia.

En producción se exige `AUTH_URL` HTTPS y un `AUTH_SECRET` estable de al menos 32 caracteres. El secreto existente tiene otros usos (móvil/tickets), por lo que no debe rotarse incidentalmente.

## Invitaciones

Se generan tokens aleatorios de 32 bytes; solo su SHA-256 se almacena, con vencimiento de 24 horas. Un reenvío reemplaza el token anterior. La aceptación consume el token y establece la contraseña/joinedAt en una transacción: expirados, usados o miembros ya incorporados no pueden reutilizarlo para cambiar su contraseña. Los roles y negocios siguen siendo los asignados por el propietario.

El enlace lleva el token en el fragmento URL; el navegador lo retira al mostrar el formulario de contraseña. Las credenciales privadas nunca llegan al cliente. Los endpoints propios verifican el origen y Auth.js maneja su protección OAuth/CSRF. Resend sustituye el envío administrativo de Supabase cuando se activa Auth.js. El dominio onroadbooks.com está verificado para envío. La certificación real posterior está documentada abajo.

## Google: configuración y certificación real

Se agregaron y guardaron los callbacks siguientes al cliente existente **OnRoad Books Web**, del proyecto Google Cloud **OnRoadBooks**, conservando el callback Supabase para rollback:

- `https://onroadbooks.com/api/auth/callback/google`
- `https://onroadbooks.vercel.app/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google`

Después de la autorización específica del usuario, se recuperaron `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET` del cliente existente y se guardaron en `.env.local` con permisos 0600. La exportación completa de la página, rechazada anteriormente por revisión automática, no se repitió. Se usó lectura de los campos con salida censurada y guardado directo mediante el editor local; se eliminó el archivo temporal y se cerró el diálogo sin guardar cambios en Supabase. No se creó ni rotó un secreto de Google.

La prueba real detectó que el botón todavía dependía de `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Se corrigieron login y registro: el servidor calcula disponibilidad según el proveedor activo y pasa solo un booleano a los componentes cliente. Auth.js requiere sus dos variables privadas; el proveedor legacy conserva su variable pública. Una prueba de regresión cubre ambos modos y configuraciones incompletas.

El flujo real registró `/api/auth/google/oauth` → `/api/auth/callback/google` → `/api/auth/complete` y terminó en el dashboard existente. Los códigos, tokens y secretos no se incluyeron en la salida; el log de desarrollo se guardó con permisos privados. Se verificaron también login por contraseña y logout. La reconciliación posterior confirmó 20 tablas y 44 filas idénticas al origen, sin nuevas cuentas de negocio; informe `copy-1789922211150-reconcile.json` en el directorio privado de respaldos.

## Verificaciones realizadas

- TypeScript, ESLint y build Next.js aprobados.
- 466 pruebas unitarias aprobadas.
- Contratos SQL: Prisma 46 aprobados/1 omitido; Drizzle 47 aprobados.
- 17 pruebas de navegador JSON/legacy aprobadas, verificando la reversibilidad del selector.
- 3 pruebas de navegador Drizzle/Auth.js: registro y persistencia, aislamiento entre negocios, login/logout, contraseña incorrecta, cookie HttpOnly, CSRF, handoff móvil PKCE, revocación por borrado y aceptación/replay de invitaciones con contraseña.
- Contrato Auth ejecutado también sobre Neon Development real dentro de una transacción revertida; comprobación posterior de ausencia de datos temporales.
- Schema público verificado tras aplicar Auth: 20 tablas, 270 columnas, 22 enums, 42 FK, 3 CHECK y 68 índices preservados.
- Reconciliación de las 20 tablas y 44 registros de negocio posterior a las pruebas: coinciden exactamente con Supabase. Informe privado `copy-1789870573510-reconcile.json`.

Actualización de certificación: Google real completado en localhost; 475 pruebas unitarias, lint, build y typecheck aprobados después de corregir el botón. La entrega real de invitaciones también está certificada; falta validar el despliegue antes del corte.

## Respaldo y restauración

`scripts/backup-database.ts` ahora selecciona `NEON_DIRECT_URL` cuando `DATA_SOURCE=neon` e incluye `public`, `onroad_auth` y `drizzle`. La verificación exige las dos tablas de autenticación además de las 20 de negocio. El formato cifrado ORBK1 y la lectura de respaldos anteriores se conservan.

Se creó el archivo privado `neon-auth/onroadbooks-20260920T022315Z.dump.enc` (85.646 bytes) dentro del directorio de respaldos de esta migración. Se descifró y restauró en PostgreSQL 18 temporal, con socket privado, verificando los manifiestos de las 20 tablas, las tres asociaciones Google contra el inventario cifrado, cero invitaciones pendientes y las tres migraciones Drizzle. Se retiró la base temporal al terminar.

Neon usa PostgreSQL 18.6; el cliente 17 instalado no puede generar su dump. La prueba utilizó herramientas PostgreSQL 18 temporales y verificadas. Antes de activar el backup programado sobre Neon hay que provisionar herramientas 18 y configurar `PG_BIN`; no apuntar un job permanente a `/tmp`. Esta preparación operativa queda para el corte y no modifica el backup actual de Supabase.

## Próximos pasos

Verificar OAuth en el despliegue de prueba; volver a reconciliar datos y verificar el despliegue antes de retirar Supabase. R2 ya aprobó la certificación remota (fase 7) y healthcheck/build/jobs están preparados (fase 8). No se cambiaron variables de producción; posteriormente se desplegó un preview aislado (fase 9). Bookliz permanece pausado según la autorización del usuario hasta terminar; RBTGenius no se modificó.

El 20 de septiembre se volvió a comprobar en Resend que `onroadbooks.com` está verificado y habilitado para envío. Existe `RESEND_API_KEY` en Vercel Production, con tipo `sensitive`. La revisión automática rechazó descargar el conjunto completo de variables de producción por exceder el alcance necesario; no se ejecutó esa descarga. Se consultaron después metadatos sin descifrar y el endpoint individual de esa variable: no devolvió un valor recuperable y no se alteró `.env.local` ni producción. Será necesaria una clave de envío disponible, preferiblemente limitada a este dominio.

## Certificación real de invitaciones (20 de septiembre)

Con la confirmación del usuario se creó `OnRoadBooks Auth Invitations`, restringida a Sending access para `onroadbooks.com`. Se guardó como `RESEND_API_KEY` en `.env.local` con permisos 0600; las claves existentes permanecen vigentes. Los perfiles de Playwright fijan la variable vacía para impedir envíos accidentales.

`scripts/certify-authjs-invitations.ts` exige destinatario explícito, `--send-one-live-email` y un archivo de informe nuevo; no forma parte de CI. Crea PostgreSQL local desechable, aplica las migraciones, arranca Next.js con Auth.js y llama a `inviteAuthUser` real exactamente una vez. Solo el proceso de certificación dispone de la clave de envío; la aplicación temporal no puede enviar correos adicionales.

La prueba aprobó envío real (HTTP 200), aceptación por el endpoint real, cookie Auth.js HttpOnly, dashboard autenticado, conservación de negocio/rol VIEWER, contraseña scrypt, login posterior, rechazo de contraseña incorrecta, rechazo de origen ajeno y de reutilización, y consumo del token. Resend confirmó `delivered` para el mensaje `01a0bfb7-9d3d-7714-9c95-5faf8a9c934e`. Solo se envió el correo autorizado al usuario; no se modificó su cuenta en Neon Development ni en producción. El enlace local quedó consumido y la base temporal fue retirada.

Informe sin secretos: `/tmp/onroad-authjs-live-invitation-20260920.json`. La comprobación posterior de TypeScript pasó. No se cambiaron variables remotas de producción.
