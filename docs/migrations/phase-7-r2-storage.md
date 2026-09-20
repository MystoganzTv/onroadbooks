# Fase 7: almacenamiento privado en Cloudflare R2

Estado: integración implementada, verificada localmente y certificada contra R2 real. Bucket privado, token restringido y lifecycle creados en Cloudflare el 20 de septiembre de 2026. Credenciales guardadas en `.env.local` con permisos 0600. Producción sigue usando Supabase Storage hasta completar OAuth y el corte coordinado. No se eliminó ningún recurso Supabase.

## Inventario actualizado

Una consulta de solo lectura al proyecto OnRoadBooks `uznuvzeghgwygpxjhqdz` encontró **un bucket privado, cero objetos, cero documentos y cero referencias a objetos ausentes**. El informe privado es `storage-1789883270864-audit.json` dentro del directorio de respaldos de la migración. No hay archivos existentes que copiar en este snapshot. Volver a ejecutar `npm run migrate:storage-audit` antes del corte; si aparecen objetos, deben copiarse y verificarse por contenido antes de cambiar de proveedor.

## Implementación

`DOCUMENT_STORAGE=r2` selecciona `R2DocumentStorage`. Exige `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET_NAME`; no cae a disco si falta configuración. El endpoint se construye desde el account ID de Cloudflare, sin URLs públicas ni endpoints arbitrarios. Las credenciales y el SDK permanecen server-side. Los adaptadores Supabase y local siguen disponibles para la transición.

Los paths y asociaciones `Document.storageKey` siguen usando el contrato existente. Para nuevos paths, la parte aleatoria usa UUID. Las escrituras R2 envían Content-MD5 y `If-None-Match: *`: un reintento solo puede reutilizar una key si coincide exactamente en bytes y tipo. No se sobrescriben objetos distintos. Un 404 se trata como ausente; los errores de permisos/conexión fallan y no se confunden con archivos inexistentes. Los errores no incluyen credenciales ni respuestas privadas del proveedor.

### Subidas a través de Next.js

Se conserva el límite de 10 MB. Para evitar superar el límite de cuerpo de Vercel, el navegador envía partes de hasta 2 MB a Next.js; el backend almacena temporalmente las partes en R2 y reconstruye el archivo final. Es un protocolo de la aplicación, no el multipart de S3.

1. `/api/documents/upload/prepare` comprueba sesión, negocio, rol, suscripción, entidad, MIME y tamaño; emite un ticket firmado que vence en 15 minutos.
2. `/api/documents/upload/part` verifica de nuevo sesión, propietario del ticket, negocio, rol y entidad. Lee el cuerpo con un límite estricto aunque no exista Content-Length y guarda una parte inmutable bajo `_pending/`.
3. `/api/documents/upload/complete` vuelve a comprobar la autorización, comprueba todas las partes y el tamaño total, crea el objeto final inmutable y registra los metadatos. Los reintentos no duplican Document. Las partes se retiran después de completar el objeto.

**Requisito de configuración:** regla de lifecycle de R2 que elimine objetos bajo `_pending/` después de un día. Así se retiran subidas abandonadas y partes cuyo cleanup haya fallado. No aplicar esa regla a documentos finales. Deshabilitar acceso público r2.dev y dominios públicos del bucket. La aplicación no requiere CORS de escritura porque el navegador solo envía bytes a Next.js.

### Descargas y borrado

Las URLs estables `/api/documents/{id}` se conservan. Next.js verifica la sesión y pertenencia al negocio antes de emitir una URL firmada de lectura de 60 segundos. Las descargas forzadas usan attachment y application/octet-stream; los nombres se limpian de caracteres de control y se codifican para Unicode. El borrado mantiene los permisos y validaciones existentes. Móvil conserva sus endpoints actuales y utiliza el mismo adaptador server-side.

El healthcheck admite R2 en producción y convierte la falta de configuración en estado degraded, sin un fallback silencioso.

## Pruebas

- 471 pruebas unitarias aprobadas, incluidas persistencia binaria/metadata, URLs firmadas, rechazos de sobrescritura, errores de autorización del proveedor, ensamblaje de 10 MB, reintentos, límites de lectura sin Content-Length y prohibición del simulador en producción.
- Cuatro pruebas de navegador con Auth.js, Drizzle/PostgreSQL y simulador S3 local aprobadas. Además de los flujos Auth anteriores: subida de 10 MB, bytes de descarga idénticos, URL sin firma rechazada por el simulador, otro negocio sin acceso, permisos revocados después de emitir el ticket, reintentos, intento de reemplazo, borrado y subida usando el componente real del navegador.
- TypeScript, ESLint y compilación Next.js aprobados.
- Las 17 pruebas de navegador JSON/local también aprobaron, verificando que el selector anterior conserva su comportamiento.

El simulador ejercita el protocolo S3 y los comandos firmados del SDK, pero **no certifica Cloudflare ni verifica criptográficamente las firmas recibidas**. Solo acepta credenciales ficticias, endpoint fijo de loopback y modo development sin Vercel. No utiliza archivos o credenciales de producción.

## Certificación remota preparada

`npm run certify:r2` comprueba el bucket configurado con un objeto de prueba de 10 MB bajo un prefijo UUID propio: subida por partes, comparación SHA-256, descarga firmada, rechazo de lectura S3 sin firma, rechazo de sobrescritura y limpieza del objeto/partes de prueba. No imprime secretos ni URLs firmadas. Debe complementarse con la revisión del acceso público y lifecycle en Cloudflare; la ausencia de acceso anónimo al endpoint S3 por sí sola no prueba que r2.dev esté deshabilitado.

El usuario completó el inicio de sesión de Cloudflare. R2 ya estaba habilitado en su cuenta; se creó `onroadbooks-documents` con clase Standard y ubicación Eastern North America. Se verificó que no tiene dominio personalizado ni URL pública r2.dev habilitada. Los identificadores de cuenta y bucket quedaron configurados en `.env.local`, sin cambiar el proveedor activo.

Después de la confirmación del usuario se creó el token de cuenta `onroadbooks-documents-app` (Object Read & Write, solo este bucket, sin vencimiento) y se activó la regla `onroadbooks-pending-expire-1d` (solo `_pending/`, expiración de un día). Cloudflare confirmó ambas operaciones. Las claves no se imprimieron en el chat.

La exportación de contenido no está disponible en Chrome y el primer editor local no respondió al guardado. La política del navegador rechazó el traslado mediante una URL de datos. Después de que el usuario pidió completar el guardado, se usó una alternativa directa: pegar en VS Code en modo restringido, guardar un archivo local con permisos privados e integrar sus dos valores en `.env.local`. Esta alternativa no incluye secretos en una URL ni imprime los valores en la salida. El archivo temporal se eliminó y la pantalla de creación de claves se cerró. No se cambió el plan ni se modificaron otros buckets.

`npm run certify:r2` aprobó contra el bucket real con acceso de red: subida por partes de 10 MB, comparación SHA-256 de bytes, descarga firmada, rechazo de lectura S3 sin firma, rechazo de sobrescritura y eliminación del objeto y partes de prueba. La primera ejecución desde el entorno sin acceso de red falló; la ejecución con red terminó con código 0. Evidencia local sin secretos: `/tmp/onroad-r2-live-certification.log`. El acceso público permanece deshabilitado, sin dominio personalizado, y el lifecycle `_pending/` de un día aparece habilitado en Cloudflare. No se activó `DOCUMENT_STORAGE=r2` en producción.

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser:storage
npm run test:e2e
npm run migrate:storage-audit
# Después de configurar el bucket privado y credenciales:
npm run certify:r2
```

Los comandos de navegador/build se ejecutan secuencialmente porque comparten `.next`. No activar R2 ni retirar Supabase hasta completar la certificación real, Auth.js/Google y las verificaciones de despliegue/corte.

Referencias utilizadas: [SDK S3 v3 para R2](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) y [compatibilidad S3 de R2](https://developers.cloudflare.com/r2/api/s3/api/), incluidas las escrituras condicionales y Content-MD5.
