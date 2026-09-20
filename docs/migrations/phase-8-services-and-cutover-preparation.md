# Fase 8 y preparación operativa del corte

Estado: auditoría de servicios completada y backup preparado en código. Preview aislado desplegado en fase 9; sin corte de producción ni retirada de Supabase. Google OAuth real ya funciona en localhost (fase 6) y R2 aprobó su certificación remota (fase 7); la invitación real fue entregada y certificada (fase 6); el preview protegido está en verificación (fase 9).

## Servicios observados

El conector de Supabase devolvió una lista vacía de Edge Functions para OnRoadBooks `uznuvzeghgwygpxjhqdz`. La auditoría SQL posterior, en transacción de solo lectura, encontró:

- Cero rutinas de aplicación en public, excluyendo funciones instaladas por extensiones.
- Cero triggers propios en public/auth y cero vistas en public.
- Cero tablas publicadas de public en Realtime.
- Cero políticas en public/storage; el aislamiento de negocio permanece en la aplicación y las tablas Supabase ya estaban protegidas por RLS/hardening.
- Sin extensión pg_cron ni jobs de cron en la base.
- Solo schemas de plataforma/public. Extensiones: pg_stat_statements, pgcrypto, plpgsql, supabase_vault y uuid-ossp; ninguna lógica de negocio depende de RPC de esas extensiones.

Evidencia privada: `services-1789906681773-audit.json` en el directorio de respaldos. El script reproducible es `npm run migrate:services-audit`. No lee cuerpos de funciones, argumentos de triggers, secretos Vault ni comandos de jobs.

No hay funciones o canales propios que trasladar a otro servicio. El cron de gastos mensuales ya vive en Next.js/Vercel y el webhook Stripe ya entra por Next.js; ambos usan Repository/AuthStore y, por tanto, el backend seleccionado. Se conservan sus URLs y horarios. No se enviaron correos ni se hicieron cobros reales durante estas pruebas.

## Despliegue y migraciones

`scripts/vercel-build.mjs` ahora valida un plan determinista antes de ejecutar comandos:

- Fuera de Vercel Production: solo build, sin migraciones automáticas.
- `DATA_SOURCE=postgres` o selección legacy por defecto: Prisma migrate, hardening y verificación existentes, luego build.
- `DATA_SOURCE=neon`: valida URLs PostgreSQL de Neon, endpoint directo y misma base/endpoint para runtime/migraciones; ejecuta Drizzle migrate, verificación Drizzle y build. No ejecuta Prisma sobre Neon.
- Selecciones JSON/desconocidas en producción fallan explícitamente.

`db:drizzle:verify` reconstruye las migraciones versionadas en schemas temporales dentro de una transacción y compara columnas, enums, constraints e índices de public/onroad_auth con lo desplegado. Comprueba hashes/timestamps del journal y que PUBLIC no tenga acceso al schema privado Auth. Revierte los schemas temporales incluso si falla. No depende de Supabase ni de Prisma.

La verificación ya pasó sobre Neon real: 20 tablas de negocio, 2 de autenticación y 3 migraciones. Los tests locales aplican ahora el migrador Drizzle real; comprueban también que una columna inesperada o un hash alterado sean rechazados. Las migraciones de producción deben seguir siendo compatibles con la versión anterior: una migración aplicada no se deshace automáticamente si el build falla.

## Backups y CI

El workflow de backup instala PostgreSQL 18 y selecciona el origen mediante la variable de repositorio `DATA_SOURCE` (postgres por defecto). Neon exige el secreto `NEON_DIRECT_URL`. No se cambiaron todavía esos valores en GitHub. Los archivos permanecen cifrados y fuera del repositorio; no se publicó ningún backup ni se ejecutó el envío de correo.

La verificación del archivo exige las dos tablas Auth y el journal en los respaldos Neon. Se volvió a verificar el archivo cifrado de la fase 6, con 22 tablas. `PG_BIN` explícito no cae silenciosamente a otra instalación si falla, y los errores de herramientas PostgreSQL no imprimen argumentos/credenciales. El dump Neon exige cliente 18 o superior.

CI tiene un job nuevo con PostgreSQL 18 desechable: contratos Prisma/Drizzle y navegador con Auth.js/R2 simulado. Los jobs legacy permanecen durante la transición. El workflow está preparado en el checkout, pero aún no se ha ejecutado en GitHub.

## Validación local

- 474 pruebas unitarias aprobadas.
- Contratos SQL: 47 aprobados en Drizzle; 46 aprobados y uno omitido en Prisma. Incluyen detección de deriva de esquema y journal.
- Cinco pruebas de navegador aprobadas con PostgreSQL desechable y R2 simulado: autenticación, aislamiento, documentos de 10 MB, cron e idempotencia de webhooks Stripe. Las firmas inválidas se rechazan y los eventos de otro entorno se ignoran.
- Typecheck, lint y build aprobados. La simulación local no sustituye la certificación pendiente con Google real. R2 se certificó después contra Cloudflare (fase 7).
- Esquema de Neon real y respaldo cifrado de 22 tablas verificados, sin cambiar datos de negocio remotos.

## Corte pendiente

1. Invitación real completada y entregada. Google/OAuth real ya se comprobó en localhost; verificarlo también en el despliegue de prueba. R2 ya tiene bucket privado, lifecycle `_pending/` de un día y certificación real aprobada; mantener sus claves solo en configuración de servidor.
2. Validar un despliegue de prueba con una base aislada y los proveedores reales. Un preview no ejecuta migraciones automáticamente.
3. En una ventana sin escrituras al origen, generar respaldo final y reconciliar otra vez datos, identidades y objetos. La copia actual no es replicación continua; si el origen cambió, no basta con alternar variables.
4. Preparar las variables del destino y del backup GitHub juntas. Mantener AUTH_SECRET y los IDs; conservar el origen y respaldos para recuperación.
5. Verificar login, roles, móvil, lectura/escritura, documentos, Stripe, cron y un respaldo nuevo después del cambio. Después de aceptar escrituras en Neon, un rollback a Supabase requiere reconciliar esas escrituras.
6. Solo después retirar dependencias/configuración Supabase de OnRoadBooks, pausar su origen y reactivar Bookliz. RBTGenius queda excluido de todas las operaciones.
