# Compras nativas de OnRoad Books

Starter (`com.mystodev.onroadbooks.starter.monthly`) y Pro
(`com.mystodev.onroadbooks.pro.monthly`) son suscripciones mensuales del grupo
22418234. La app obtiene precio y moneda desde StoreKit. Fleet no se ofrece.

## Activación

Configurar como secretos de servidor en Vercel Production:
`APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`.
Configurar `APPLE_SANDBOX_ACCOUNT_EMAILS` con correos de cuentas exclusivas de
revisión/TestFlight. No habilitar datos reales para compras de prueba.
Sin las claves, la API mantiene las compras desactivadas.

Aplicar la migración Drizzle 0018 mediante el pipeline habitual. Se verificó en
una rama temporal de producción `br-holy-hill-aw6twvtv`, con caducidad automática
el 28 de septiembre de 2026. Conservó los registros de las 22 tablas existentes.
El script `scripts/apple-billing-migration-smoke.ts` reproduce la comprobación
contra un host de rama explícito, sin modificar el `.env` de producción.

En App Store Connect → App Information → App Store Server Notifications,
configurar **Version 2**, producción y sandbox:
`https://onroadbooks.com/api/apple/notifications`.
Comprobar una notificación TEST y una compra sandbox antes del envío a revisión.
La primera entrega debe incluir la app, el grupo y ambas suscripciones.

## Verificación y límites

- El dispositivo verifica StoreKit y envía el JWS autenticado por sesión.
- El servidor usa la biblioteca oficial de Apple y sus raíces públicas, con
  comprobaciones de certificados en línea. No acepta recibos locales de Xcode.
- Un UUID aleatorio por negocio vincula la compra mediante `appAccountToken`.
  No se envía email ni ID interno a Apple. Una restauración no transfiere cuentas.
- Cada recibo y notificación vuelve a consultar App Store Server API dentro de
  un bloqueo compartido con Stripe. Un recibo antiguo no deshace un reembolso.
- `ApplePurchase` conserva las asociaciones históricas. La actualización del
  plan y la asociación se confirman en una transacción SQL.
- StoreKit finaliza la transacción después de la confirmación del servidor.
  Los errores dejan transacciones pendientes para restaurar o reintentar.
- Las renovaciones usan notificaciones V2; abrir la cuenta también reconcilia
  el estado, como máximo una vez por minuto. El vencimiento firmado limita
  escrituras aunque una notificación se retrase. Los datos siguen consultables.
- Las suscripciones web y de Apple se gestionan en su proveedor. No se ofrecen
  nuevas compras de Apple mientras exista una suscripción/checkout web activo.
- Eliminar una cuenta no cancela los cobros de Apple: la pantalla ofrece el
  panel nativo para cancelar antes. La eliminación invalida su token de compra.

## Pruebas

`npm test` cubre firmas falsas, producto, grupo, entorno, cuenta, vencimiento,
revocación y período de gracia. `npm run test:database` ejecuta contratos reales
contra PostgreSQL temporal con Prisma y Drizzle, incluyendo entregas repetidas,
restauración entre negocios, reembolsos, upgrades y conflictos con Stripe.

El esquema Xcode `OnRoadBooksStoreKit` usa únicamente el catálogo local de
`mobile/UnitTests/OnRoadBooks.storekit`; no se empaqueta en el archivo Release.
Sus pruebas sustituyen HTTP mediante una sesión URLProtocol exclusiva y prueban
compra, restauración, errores de servidor, cuenta incorrecta y Ask to Buy.
Ejecutar con iOS 18.2: el runtime 26.5 presenta el fallo conocido de Apple
[FB22237318](https://developer.apple.com/forums/thread/826971). Si no puede
activar StoreKit local, la suite falla antes de intentar comprar.

Estas pruebas locales no equivalen a una transacción validada con App Store
Server API real. Registrar esa comprobación y el número de build cuando se
complete la configuración de las credenciales.

Validación de la build 4: 577 pruebas de servidor, 75 contratos PostgreSQL por
adaptador (Prisma y Drizzle), 6 pruebas nativas en iOS 18.2, TypeScript, ESLint y
compilación web correctos. Archivo Release firmado, sin catálogo StoreKit local.
Captura para revisión: `mobile/AppStore/SubscriptionReview/native-plans.png`.
