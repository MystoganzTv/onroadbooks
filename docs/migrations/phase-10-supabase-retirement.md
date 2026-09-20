# Fases 9–10: corte y retirada de Supabase

Estado: corte a producción completado el 20 de septiembre de 2026; retirada final del SDK preparada y pendiente de publicar.

## Corte certificado

- Pausa manual de Vercel confirmada por el usuario y respuesta 503 verificada.
- Bloqueo temporal de escrituras en las 20 tablas del origen y las identidades mientras se realizó el respaldo y la conciliación final.
- 44 registros en 20 tablas, tres identidades Google y asociaciones conservados. Cero documentos/objetos en el origen: no había archivos que transferir.
- Respaldo final cifrado `onroadbooks-20260920T192100Z.dump.enc`, restaurado íntegramente en PostgreSQL 18 desechable. Los archivos y mapas de identidad permanecen en el directorio privado externo al repositorio.
- Despliegue `dpl_4jAqeUoBJhVSxobUReyUvVtonNUP` promovido. `onroadbooks.com` responde con Neon principal, Auth.js y R2; todos los componentes de `/api/health` están en `ok`, incluso con Supabase pausado.
- Google OAuth real abrió el negocio existente. La sesión web previa sobrevivió al corte y se verificó un nuevo inicio de sesión Google tras cerrar sesión.
- El informe [de producción](phase-9-production-report.json) confirma contraseñas, cookies seguras, móvil, aislamiento entre negocios, documento privado de 10 MB con igualdad de bytes, borrado de documentos, logout y revocación por eliminación de usuario. Fixtures eliminadas y filas originales intactas.
- PR #1 integrado: `ae6c8221b1c2620f95328cda043b1e9b0a883b17`.
- GitHub Actions usa `DATA_SOURCE=neon` y el secreto autorizado `NEON_DIRECT_URL`. Respaldo manual de main `35532269095` aprobado, sin envío de correo. El respaldo programado conserva su entrega habitual.
- Supabase OnRoadBooks está `INACTIVE`. Bookliz fue restaurado y alcanzó `ACTIVE_HEALTHY`. RBTGenius no se modificó.

## Retirada del código

Se eliminan ambos paquetes Supabase, clientes administrativos/server, adaptador de Storage, intercambio antiguo de tokens Google y aceptación de sesiones de invitación antiguas. Google continúa por OAuth Auth.js; las invitaciones usan tokens propios de un solo uso y Resend. Los enlaces antiguos muestran un error y permiten solicitar otra invitación; no crean identidades por correo sin verificar.

Los uploads R2 siguen pasando por Next.js en partes acotadas. La CSP deja de autorizar conexiones Supabase y Google GSI. La eliminación de cuentas/miembros conserva cascadas de identidades/invitaciones y revocación mediante consulta del usuario en cada petición. El selector de almacenamiento rechaza proveedores desconocidos.

Se conservan Prisma/PostgreSQL y JSON como implementaciones de referencia para pruebas/local. Los scripts de migración, archivos SQL y los inventarios históricos no son dependencias del servicio activo.

## Validación de la retirada

- Tipos y lint aprobados; 473 pruebas unitarias.
- 47 contratos por cada backend SQL (Prisma y Drizzle), sobre bases desechables.
- 17 pruebas de navegador del producto.
- Cinco flujos de navegador Drizzle/Auth.js/R2: datos y roles, sesiones/móvil/revocación, invitaciones de un uso, documentos de 10 MB, Stripe/cron e idempotencia.
- Build local aprobado. CI, publicación final y verificación tras publicar se registrarán al completarse.

## Operación posterior

El `AUTH_SECRET` de producción se conserva. Las cookies web anteriores se aceptan hasta el 27 de septiembre de 2026 a las 19:00 UTC; los tokens móviles conservan su vencimiento original. No se debe volver a Supabase mediante un simple rollback de código: Neon ya acepta escrituras posteriores al corte.

Los previews necesitan su propia rama Neon y configuración Auth.js/R2. El preview de certificación usa una rama temporal que expira el 21 de septiembre a las 12:52 EDT; no es una base permanente de desarrollo. No usar credenciales de producción para pruebas.

La pausa preserva el origen y sus respaldos para recuperación. No se ha eliminado permanentemente el proyecto Supabase ni se ha cancelado ninguna organización o integración compartida.
