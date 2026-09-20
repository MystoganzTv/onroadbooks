# Fase 5: repositorio Drizzle y selección reversible

Se implementaron los 60 métodos de `Repository` y `AuthStore` en `src/lib/db/drizzle-store.ts`, con consultas nativas de Drizzle y sin dependencia runtime de Prisma dentro del adaptador. La aplicación puede usarlo mediante `DATA_SOURCE=neon` y `NEON_DATABASE_URL`. **No se cambiaron las variables de producción ni se desplegó el corte.**

## Comportamiento preservado

Se mantienen los contratos públicos, límites por negocio, permisos de equipos, contraseñas scrypt existentes, normalización de email, proyecciones financieras, espejos de gastos, facturas/pagos, liquidaciones de choferes, reservas y snapshots. Las cuatro transacciones que Prisma ejecutaba como Serializable conservan ese aislamiento. Las transacciones anidadas del smoke remoto utilizan savepoints dentro de una transacción exterior Serializable.

Los IDs existentes no se regeneran. Las nuevas filas usan UUID como texto; los IDs derivados de espejos conservan su formato. Los valores NUMERIC se escriben como cadenas decimales desde los inputs numéricos del dominio existente; el dominio continúa usando `number` como antes. Las fechas PostgreSQL DATE se manejan como cadenas ISO; los timestamps conservan Date/ISO y su precisión declarada. Los snapshots reabiertos vuelven a SQL NULL. Los upserts vacíos se resuelven con `ON CONFLICT DO NOTHING`, sin actualizar accidentalmente timestamps.

El índice administrativo obtiene conteos agrupados y últimas fechas de actividad sin exponer credenciales. El selector aplica un límite de errores que elimina SQL, parámetros, detalles PostgreSQL y causas privadas antes de entregar errores a handlers que muestran mensajes al usuario. Los errores de negocio se conservan.

La selección Neon sin URL válida falla explícitamente; no escribe en el archivo JSON como fallback. `DATA_SOURCE=postgres` mantiene Prisma y `DATA_SOURCE=json` mantiene desarrollo local. El healthcheck usa el backend seleccionado. Durante esta fase Auth y Storage continúan con su implementación anterior.

## Diferencia corregida al comparar implementaciones

El contrato existente de JSON exigía respetar `costsPosted:false` en cargas históricas. Prisma ignoraba el indicador al sincronizar gastos, y podía contabilizar esos costos al editar la carga. Se agregó la misma condición a Prisma y Drizzle; el contrato ahora pasa en las tres implementaciones. No se reescribieron los registros históricos almacenados.

Los tests ya no suponen que todos los gastos de combustible tienen el prefijo generado por JSON: verifican la relación explícita `expenseId`, preservando los IDs de producción. Los tests específicos de archivos JSON siguen ejecutándose en JSON; cuentas SQL tienen contratos propios porque un nuevo propietario debe crear su propio negocio, en lugar de adoptar la única empresa local del modo JSON.

## Verificación realizada

- TypeScript y ESLint sin errores; build Next.js completado.
- 463 pruebas unitarias existentes y nuevas, todas aprobadas.
- 46 contratos ejecutados contra Prisma y otros 46 contra Drizzle, cada uno con una base PostgreSQL local desechable creada desde las migraciones versionadas. Incluyen combustible, mantenimiento, costos históricos, camiones, documentos, deuda, choferes, pagos, permisos, creación/reinicio/borrado de cuentas y separación entre negocios.
- Dos registros concurrentes del mismo email dejan un solo usuario/negocio, sin negocio huérfano. Dos pagos concurrentes por el saldo completo generan un solo cobro.
- 17 pruebas de navegador existentes con JSON/local aprobadas.
- Una prueba de navegador adicional con Drizzle/PostgreSQL: registro, onboarding, rutas protegidas/principales, gasto persistido y comprobado directamente por SQL, otro negocio sin acceso al gasto, y nuevo login con contraseña.
- Reconciliación posterior al smoke: las 20 tablas y los 44 registros reales siguen coincidiendo exactamente entre Supabase y Neon, incluidos hashes, conteos por negocio y sumas. Evidencia privada: `copy-1789867597569-reconcile.json`.
- Smoke sobre Neon Development real: contraseñas, miembros/roles, dos negocios aislados, escritura/lectura financiera, snapshot de liquidación, reservas, reset y borrado. Todo dentro de una transacción que revierte, con comprobación posterior de ausencia del marcador de prueba. No se dejaron filas de prueba.

Comandos:

```bash
npm run typecheck
npm run lint
npm test
npm run test:database
npm run build
npm run test:e2e
npm run test:browser:database
npm run smoke:neon-repository
```

Los dos comandos de navegador deben ejecutarse **secuencialmente**: Next.js usa el mismo directorio `.next/dev`. Los contratos SQL necesitan herramientas PostgreSQL 17 locales y crean/retiran su propio servidor en loopback. El smoke Neon restringe su hostname al destino Development auditado. Sus errores no imprimen datos reales ni parámetros.

La prueba remota observó advertencias de deprecación de pg 8 sobre consultas simultáneas en una conexión y alias SSL. Las versiones están fijadas; actualmente el alias `require` valida el certificado como `verify-full`. Revisar esos cambios antes de actualizar pg a 9. No se desactivó TLS.

## Estado operativo y límites

OnRoadBooks y RBTGenius están activos; Bookliz permanece pausado con autorización explícita hasta terminar la migración completa. No se modificó RBTGenius. La alternancia inicial descrita en fase 4 ya no aplica.

Esta fase verifica el acceso a datos y conserva la autenticación actual; no certifica todavía Auth.js, Google sin Supabase, invitaciones propias ni R2. Tampoco implementa sincronización continua entre bases. Antes del corte se debe reconciliar nuevamente el origen, migrar las identidades/configuración pendientes y comprobar el despliegue completo. Después de aceptar escrituras en Neon, volver a Prisma exige reconciliar esas escrituras; cambiar solo la variable no es un rollback de datos.
