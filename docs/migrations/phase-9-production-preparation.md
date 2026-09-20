> Registro histórico de preparación. El corte ya se completó; el estado vigente y sus pruebas están en [fase 10](phase-10-supabase-retirement.md). Las instrucciones pendientes de abajo describen el momento anterior al corte.

# Preparación de producción

El 20 de septiembre de 2026 se creó un despliegue con configuración Production y `--skip-domain`. No se promovió ni se movió el tráfico. Las 14 variables de la migración ya están persistidas exclusivamente en Production; Preview/Development conservan sus valores anteriores.

- Despliegue preparado: `dpl_4jAqeUoBJhVSxobUReyUvVtonNUP`.
- URL: `https://onroadbooks-oqgli3ebo-mystodevs-projects.vercel.app`.
- Destino: Neon principal `br-mute-paper-awpwo56b`, no la rama temporal del preview.
- Selectores: `DATA_SOURCE=neon`, `AUTH_PROVIDER=authjs`, `DOCUMENT_STORAGE=r2`.
- Google y R2: credenciales existentes de OnRoadBooks, privadas en servidor.
- AUTH_SECRET, Stripe, cron y Resend: heredados de la configuración Production existente, sin descargarlos ni reemplazarlos.
- Sesiones web previas: ventana de compatibilidad hasta el 27 de septiembre a las 19:00 UTC; cada petición vuelve a verificar el usuario en Neon. Los tokens móviles conservan el secreto existente y su vencimiento original.
- Se ejecutaron las tres migraciones Drizzle ya aplicadas, la verificación del catálogo/journal y el build. Resultado READY.
- `/api/health` del despliegue preparado devolvió HTTP 200 con application/database/storage/billing/auth en `ok`.
- La lista efectiva de subida pasó: 570 archivos, los 97 archivos de aplicación incluidos y archivos privados excluidos.

La inspección posterior confirmó que Production sigue en `dpl_AN58XdHb2LYMWJq3Lyh6TEDg7HHm`. `onroadbooks.com`, `www.onroadbooks.com` y `onroadbooks.vercel.app` permanecen en el sitio previo; el alias automático `onroadbooks-mystodevs-projects.vercel.app` apunta a la versión preparada. La protección sigue en `all_except_custom_domains`.

## Respaldo remoto

El usuario autorizó explícitamente guardar la conexión de Neon principal como secreto cifrado `NEON_DIRECT_URL` en `MystoganzTv/onroadbooks`. Se configuró ese secreto sin modificar los anteriores. La variable del respaldo programado sigue sin cambiar, por lo que el respaldo nocturno continúa en Supabase hasta el corte.

La ejecución manual del workflow permite elegir Neon y omitir el correo. Se inició `35531385263` sobre la rama de migración con `data_source=neon` y `send_email=false`; terminó correctamente: dump cifrado de 22 tablas, descifrado y lectura con pg_restore verificados; el paso de correo se omitió. No se guardan archivos de respaldo como artifacts en este repositorio público. La ejecución nocturna anterior de Supabase `35512266109` terminó correctamente.

## Corte por realizar

1. CI `35531362843` completo y aprobado: tipos/lint/unitarias, Prisma/Postgres, Drizzle/Auth.js/R2 y navegador/build. Respaldo Neon remoto aprobado.
2. Pausar temporalmente el tráfico Production de OnRoadBooks, drenar peticiones y reconciliar/resguardar datos, identidades y almacenamiento con el origen sin escrituras.
3. Variables persistentes de Vercel preparadas y verificadas. Falta integrar el PR y cambiar el selector del respaldo GitHub de forma coordinada con el corte; conservar valores previos para recuperación.
4. Promover el despliegue preparado, reanudar y verificar Google, sesiones, lectura/escritura, documentos y móvil.
5. Cuando la nueva versión esté certificada, retirar la dependencia de Supabase y reactivar Bookliz. RBTGenius queda excluido.

Pausar el proyecto Vercel devuelve 503 al tráfico de producción; reanudarlo no requiere redeploy. Referencia operativa: [Managing projects](https://vercel.com/docs/projects/managing-projects). No se ha pausado Vercel durante esta preparación.

## Bloqueo operativo de la pausa

`vercel project pause onroadbooks --scope mystodevs-projects --json` devolvió `interactive_confirmation_required`: la CLI exige que el usuario ejecute la orden en una terminal interactiva y escriba el nombre del proyecto. No se aplicó la pausa y no se intentó eludir esa confirmación mediante otra API. La configuración nueva no modifica el despliegue activo: solo afecta nuevos despliegues. No fusionar el PR ni desplegar main hasta completar la ventana del corte.

Comando manual pendiente:

```bash
vercel project pause onroadbooks --scope mystodevs-projects
```

Cuando solicite el nombre, introducir `onroadbooks`. Después continuar con el bloqueo temporal de escrituras al origen, el respaldo final y la reconciliación, antes de promover y reanudar. No se ha abierto ninguna transacción de bloqueo en Supabase.

Respaldo local previo al corte: `pre-cutover-neon/onroadbooks-20260920T191003Z.dump.enc` dentro del directorio privado de migración. Se restauró íntegramente en PostgreSQL 18 desechable y coincidieron las 20 tablas, tres identidades Google, tabla de invitaciones y journal Drizzle. No sustituye la reconciliación final bajo pausa.
