# Fase 9: verificación y preview aislado

Estado al 20 de septiembre de 2026: Google real y R2 certificados previamente; invitación real entregada y aceptada en esta etapa. Preview autorizado y desplegado; certificación funcional y Google OAuth HTTPS aprobados. Producción permanece en su configuración anterior; Supabase sigue disponible.

## Invitación real

`npm run certify:authjs-invitations -- --send-one-live-email --to <destinatario-autorizado> --report <ruta-absoluta-nueva>` exige un destinatario autorizado y un archivo nuevo para evitar reenvíos accidentales. No se ejecuta desde CI. Requiere `.env.local` con la clave Resend, herramientas PostgreSQL 17+ y que ningún otro Next dev use este checkout.

La ejecución real envió exactamente un correo mediante `inviteAuthUser`. Resend confirmó entrega. PostgreSQL y Next.js fueron temporales: se comprobaron aceptación, sesión HttpOnly, dashboard, contraseña scrypt, rol/negocio, login y rechazos de origen ajeno, contraseña incorrecta y reutilización. La base y los tokens temporales se eliminaron al finalizar. Informe sin secretos: `/tmp/onroad-authjs-live-invitation-20260920.json`.

## Preview desplegado

- Proyecto Vercel existente: `onroadbooks`, con protección `all_except_custom_domains` conservada.
- Proyecto Neon existente: `muddy-cloud-35104103`.
- Rama temporal: `codex-migration-verification-20260920` (`br-cool-voice-awsmqv6a`), hija de `main`; expira el 21 de septiembre a las 12:52 EDT.
- La copia se comprobó mediante SQL de solo lectura: 20 tablas de negocio, tres asociaciones Google y tres migraciones Drizzle.
- Configuración privada preparada en `/tmp/onroad-migration-preview-env.json`, permisos 0600. No reemplaza `.env.local` ni configura variables compartidas de Vercel.
- Auth.js tiene un secreto exclusivo para este preview. Google/R2 usan las credenciales existentes de OnRoadBooks; el correo y Stripe quedan desactivados en el preview preparado. Las conexiones heredadas a Supabase quedan vacías en esa configuración.
- Preview READY: `dpl_BCh4b53AGrJWvd3SUK539Ha6jr81`, URL `https://onroadbooks-27yrqzx3h-mystodevs-projects.vercel.app`. Alias de prueba asignado: `https://onroadbooks-migration-check.vercel.app`.
- El callback Google del alias se guardó tras la autorización del usuario. El flujo real HTTPS abrió el dashboard del negocio existente EPS Logistics LLC. Los cuatro callbacks anteriores permanecen intactos.

La revisión automática bloqueó inicialmente la transmisión de credenciales. Después de describir Neon/Google/R2/Auth.js, el destino Vercel y el alcance exclusivo del preview, el usuario respondió «go» y la misma operación fue autorizada. Se transmitieron únicamente las variables seleccionadas como overrides del despliegue, sin modificar las variables compartidas del proyecto. Los valores se tomaron del entorno del proceso y no se incluyeron en argumentos de línea de comandos ni en el código subido.

La compilación remota terminó en READY sin errores. El healthcheck verificó base y almacenamiento (`ok`); su estado global es `degraded` porque correo y facturación están desactivados en esta configuración de prueba. No equivale a una certificación completa de configuración para producción.

## Paquete de subida

El dry run inicial descubrió que `.vercelignore` permitía incluir `.env`, el ledger E2E y exportaciones locales. Se corrigió para excluir credenciales, datos/exportaciones, artefactos de prueba, archivos comprimidos y el cliente Prisma generado (lo reconstruye `postinstall`). La comprobación usa la lista efectiva de `vercel deploy --dry --json`, no solo los patrones escritos. Los archivos privados no se subieron.

## Pendiente para certificar el corte

1. Preview y alias creados; pruebas funcionales desplegadas aprobadas (informe adjunto).
2. Google HTTPS aprobado, con las protecciones de Vercel y los callbacks anteriores conservados.
3. Lectura/escritura, documentos, móvil y aislamiento aprobados en el despliegue. Cron y Stripe probados con servicios simulados; falta certificar su configuración de producción sin envíos ni cargos adicionales.
4. Preparar respaldo y reconciliación final bajo una ventana sin escrituras. Configurar destino y backup GitHub de forma coordinada.
5. Activar y certificar producción; retirar Supabase únicamente después. Bookliz permanece pausado hasta entonces y RBTGenius queda excluido.

## Comprobaciones finales de esta etapa

475 pruebas unitarias aprobadas, lint, build y TypeScript aprobados. La lista corregida de subida incluye los 97 archivos de `src/app`, incluidas 30 rutas móviles, y excluye credenciales, datos locales y motores generados. `git diff --check` pasó.

## Incidencia detectada y corregida durante el preview

La primera compilación (`dpl_9KgsPGXcnnrgeXSqcKbegtErfjj3`) estaba READY, pero la verificación móvil encontró HTML en lugar de JSON. La lista efectiva de subida confirmó que el patrón sin ancla `mobile` excluía tanto la carpeta iOS como `src/app/api/mobile`. Se corrigieron `/mobile`, `/data`, `/outputs` y `/src/generated` para limitar las exclusiones a la raíz. El segundo despliegue está READY y el alias apunta a él.

Se añadió `npm run verify:deploy-files -- <manifest.json>` para comprobar la lista efectiva del dry run: prohíbe archivos privados y exige todos los archivos reales de `src/app`. El manifiesto corregido pasó con 567 archivos antes de añadir este verificador. La primera prueba fallida retiró sus dos negocios temporales y confirmó que los datos originales de la rama no cambiaron.

Se verificó que la protección del proyecto sigue siendo `all_except_custom_domains`. La URL del preview sin credenciales redirige (302), mientras la CLI autenticada accede a la aplicación. Producción conserva `dpl_AN58XdHb2LYMWJq3Lyh6TEDg7HHm`; ninguno de los previews fue promovido.

## Resultado funcional del preview corregido

Informe: [phase-9-preview-report.json](phase-9-preview-report.json). Se aprobaron registro de dos negocios temporales; redirección de usuarios anónimos; dashboard, cargas, gastos, camión y configuración; cookie Auth.js Secure/HttpOnly; rechazos de contraseña incorrecta y origen ajeno; handoff móvil PKCE, intercambio y dashboard; gasto persistido en Neon y aislamiento entre negocios; documento de 10 MB a través de Vercel en cinco partes; descarga privada con firma de 60 segundos y bytes idénticos; rechazo de lectura sin firma; eliminación efectiva de R2; logout/login; y revocación web/móvil al eliminar la cuenta temporal.

R2 devuelve 400 para la URL sin firma, frente al 403 del simulador. La prueba real comprueba rechazo no exitoso, sin exigir el código propio del simulador. Esa diferencia solo afectó una expectativa del verificador, no requirió modificar la aplicación. Las verificaciones pendientes de almacenamiento/sesión se completaron en una ejecución acotada sobre el mismo despliegue, conservando los resultados previos de móvil y datos.

Los negocios, usuarios, gastos, documentos y partes R2 de prueba fueron retirados. Se compararon huellas de las 20 tablas antes y después de cada ejecución y se confirmó que todas las filas originales de la rama permanecen idénticas. No se enviaron correos adicionales, no se hicieron cargos y no se escribieron datos en la rama principal ni en Supabase. TypeScript y `git diff --check` aprobaron después de agregar el verificador del manifiesto; la compilación remota corregida está READY.

Google en localhost y la entrega real de invitaciones están certificados (fase 6). Google en el preview HTTPS también aprobó el flujo real el 20 de septiembre. Una comparación posterior de solo lectura confirmó que las 20 tablas y 44 registros del preview coinciden con Neon principal y que las tres asociaciones Google coinciden con Supabase, sin crear usuarios duplicados. Evidencia sin datos personales: [phase-9-google-data-report.json](phase-9-google-data-report.json). Una reconciliación independiente confirmó que los 44 registros de Supabase siguen coincidiendo con Neon principal (`copy-1789930877161-reconcile.json`, privado). El corte de producción y la retirada de Supabase siguen pendientes.
