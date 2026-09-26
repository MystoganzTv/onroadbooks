# Auditoría de lanzamiento — 26 de septiembre de 2026

**Dictamen inicial (antes de las correcciones):** la web tiene una base suficiente para una beta privada supervisada; no aprobaría todavía un lanzamiento público con cobros. Corregir primero la sincronización de Stripe, completar recuperación de acceso y establecer protección verificable contra intentos repetidos. Después, cerrar la versión con pruebas completas y un commit reproducible.

## Correcciones solicitadas después de la auditoría

Los hallazgos de abajo describen el estado original. La corrección que acompaña este documento incorpora:

- **Stripe:** lectura del estado vigente dentro de un bloqueo transaccional por negocio; lectura y escritura comparten conexión/transacción. Los eventos repetidos o atrasados no restauran snapshots antiguos. Una suscripción anterior no desplaza una sustituta vigente. Los fallos se devuelven a Stripe para reintento.
- **Recuperación:** enlace público desde login, pantallas en inglés/español, correo transaccional por Resend, token aleatorio de 256 bits, hash almacenado, caducidad de 30 minutos y consumo único atómico. Un enlace nuevo sustituye al anterior. El token viaja en el fragmento del enlace y se retira del historial al abrirlo. La respuesta de solicitud no revela si existe la cuenta; cuentas de Google conservan su vía de acceso.
- **Revocación:** cambiar contraseña incrementa una versión de autenticación. Las sesiones previas de Auth.js, cookies heredadas, tokens móviles y códigos de handoff dejan de ser válidos. La migración conserva las sesiones existentes hasta que se cambia su contraseña.
- **Abuso:** límites en PostgreSQL por cuenta/IP, compartidos entre instancias y entre login web/móvil y el callback directo de Auth.js. También cubren registro, invitaciones y recuperación. Los identificadores se almacenan como HMAC; el servicio falla cerrado cuando el almacenamiento no está disponible.
- **Pruebas:** se actualizaron las expectativas antiguas de Today y de la ubicación de Where is my money. Se añadieron pruebas de concurrencia, caducidad, replay, revocación, callbacks directos, respuestas 429 y eventos Stripe firmados sobre proveedores locales simulados. Verificación local final: 556 pruebas unitarias, 69 contratos por cada backend SQL (Prisma y Drizzle), 24 pruebas web con 1 omisión intencional de Fleet y 11 pruebas integradas Auth.js/Drizzle/Stripe/R2 aprobadas; tipos, lint y comprobación de migraciones correctos. El commit, CI y despliegue identificados se registran en el informe final.

Esto cierra la implementación de los cuatro puntos solicitados. No convierte las pruebas con proveedores simulados en una certificación de cobros reales, recepción de correo ni restauración de documentos. Las validaciones con servicios reales conservan su alcance original. Las dos diferencias de producto se corrigieron después, como se indica a continuación.

## Corrección de coherencia web/iOS

- Retirada completa de owner statements en las superficies del producto: landing y planes EN/ES, pantalla/acciones web y pestaña/repositorio nativo. `/settlements` y `/reports/settlements` redirigen a Reports; el endpoint móvil retirado responde 410 tras autenticar y 401 sin sesión. Los snapshots y movimientos históricos permanecen intactos; los pagos de choferes son independientes.
- La calculadora iOS usa un solo flujo de oferta. Se retiraron rate context, costos operativos asignados, deuda asignada y objetivo personalizado. La ganancia del viaje y sus umbrales utilizan costos directos; los gastos registrados del mes aparecen abajo como referencia, sin reparto por milla. Web y API comparten los valores iniciales y el filtro mensual por camión.
- Validación: 558 pruebas unitarias, 25 pruebas de navegador aprobadas y una omisión intencional de Fleet; tipos y lint sin errores. Las pruebas comprueban que la API retirada no altera el historial y que el gasto mensual cambia sin cambiar la ganancia del viaje. iOS compila para simulador Debug y dispositivo Release sin firma.
- Alcance de entrega: desplegar el backend no reemplaza los binarios de iOS ya instalados. La interfaz móvil requiere distribuir/instalar una build nueva. El endpoint conserva valores neutrales para los campos antiguos para que esas versiones sigan decodificando la respuesta.

## Alcance y método

Revisión del árbol de trabajo actual, producción onroadbooks.com (despliegue `dpl_64nEjaMyoU3hzUDGLEsRBHxXZUbg`), flujos de navegador locales con datos aislados, autenticación/autorización, cálculo y persistencia financiera, facturación, respaldo y coherencia del producto. Revisión estática del cliente iOS; no se ejecutó una certificación del binario móvil. No se modificaron registros financieros de producción, se efectuaron cobros ni se enviaron mensajes de prueba. Esta revisión no es un pentest exhaustivo ni una prueba de carga.

## Evidencia positiva

| Comprobación | Resultado y límite |
| --- | --- |
| Pruebas unitarias | 549 aprobadas, 0 fallidas; ejecutadas sobre el árbol de trabajo actual. |
| Lint | `npm run lint` sin errores. |
| Tipos y compilación | Typecheck y build del último despliegue correctos. |
| Navegador completo | 23 aprobadas, 1 fallida por expectativa obsoleta, 1 omitida intencionalmente por Fleet oculto. JSON/local/legacy auth; no equivale a probar todos los proveedores de producción. |
| Dependencias | `npm audit --omit=dev`: 0 avisos conocidos el día de la auditoría. No es una garantía de ausencia de vulnerabilidades. |
| Salud de producción | `/api/health` devuelve 200 y application/database/storage/billing/auth en `ok`. Database 101 ms y storage 161 ms en esa solicitud. Billing/auth verifican principalmente configuración, no una compra ni OAuth completos. |
| Solicitudes anónimas | `/dashboard` redirige a login; documentos, mobile/dashboard y cron sin credenciales responden 401. |
| CI del repositorio | Último CI en commit `a13c6d5` correcto. Los cambios locales publicados posteriormente todavía no están en ese commit. |
| Contratos SQL/auth/storage | Suite de CI de hoy aprobó Postgres y Neon/Drizzle/Auth.js/R2 sobre entornos de prueba. |
| Backup de hoy | Trabajo programado aprobó dump, cifrado, verificación y envío. Confirma éxito del trabajo y aceptación del envío; no una restauración completa realizada hoy ni recepción humana. |
| Logs | La consulta de 5xx de las últimas 24 horas devolvió 0 entradas. La muestra de 30 logs de nivel error mostraba avisos de compatibilidad SSL de PostgreSQL, no incidentes equivalentes a 30 solicitudes fallidas. |

CI: https://github.com/MystoganzTv/onroadbooks/actions/runs/36253692660

Base de datos: https://github.com/MystoganzTv/onroadbooks/actions/runs/36251643612

Backup: https://github.com/MystoganzTv/onroadbooks/actions/runs/36243680579

## Hallazgos antes de un lanzamiento abierto

### 1. Prioridad alta: eventos antiguos de Stripe pueden revertir el estado de acceso

`src/app/api/stripe/webhook/route.ts:65` entrega directamente el snapshot de los eventos `customer.subscription.*` a `syncStripeSubscription`. `src/lib/billing.ts:75` actualiza la suscripción sin comprobar vigencia del evento ni conciliar el estado actual con Stripe. Tampoco protege frente a un evento atrasado de otra suscripción del mismo customer.

**Reproducción:** ejecuté la función real sobre un repositorio JSON temporal y datos ficticios. Primero se sincronizó `canceled`; después un snapshot anterior `active`. Resultado: `CANCELED → ACTIVE`. Es una reproducción local de la lógica, no un incidente observado en una cuenta real. La inversión contraria también puede retirar acceso a un cliente que ya pagó.

Stripe documenta que no garantiza orden de entrega: https://docs.stripe.com/webhooks#event-ordering

**Cierre:** conciliar con el estado vigente de Stripe, controlar la suscripción autorizada del workspace y evitar carreras/reintentos que restauren estados antiguos. Probar orden invertido, cancelación seguida de nueva alta y entregas duplicadas. Un simple orden por `event.created` no basta: eventos diferentes pueden compartir segundo.

### 2. Prioridad alta: no hay recuperación de contraseña para cuentas con email

La página pública `/login` ofrece Google y email/password, pero no recuperación. La búsqueda de rutas, acciones y componentes tampoco encontró un flujo de restablecimiento. `src/components/auth/auth-card.tsx:197` pasa directamente al botón de acceso. La vinculación automática de una cuenta existente con Google se rechaza deliberadamente en `src/lib/auth/identity-store.ts`; por tanto Google no sustituye la recuperación de una cuenta creada con contraseña.

**Impacto:** un cliente que olvida su contraseña queda sin un mecanismo de autoservicio para recuperar sus libros.

**Cierre:** recuperación mediante token de un solo uso con caducidad, respuestas que no revelen si existe la cuenta, protección contra abuso y política de revocación de sesiones.

### 3. Prioridad alta: protección contra intentos repetidos no acreditada

No encontré limitación de intentos por IP/cuenta en `src/app/api/auth/login/route.ts`, `src/auth.ts:42`, `src/app/api/auth/setup/route.ts` ni `src/app/api/mobile/login/route.ts`. La única limitación específica encontrada en la app corresponde al escaneo de rate confirmations. La consulta de configuración activa de firewall de este proyecto devolvió `Config not found (404)`; esto no demuestra ausencia de la protección general de Vercel, pero tampoco acredita una regla para estos endpoints.

**Cierre:** protección consistente y persistente para login, registro, invitaciones y futuro reset; comprobar todas las vías de autenticación. No se realizaron ataques de fuerza bruta contra producción.

### 4. Prioridad de lanzamiento: producción y versión del repositorio no coinciden todavía

El último commit es `a13c6d5`; existen cambios publicados sin commit/push y dos archivos nuevos de la calculadora sin seguimiento. La suite completa falla en `e2e/critical-flows.spec.ts:1245` porque espera nueve valores de las tarjetas Today eliminadas. El fallo no demuestra un error financiero: demuestra que la prueba no refleja el producto actual y que el resto de ese caso se interrumpe.

**Cierre:** actualizar la prueba según el comportamiento acordado, volver a ejecutar la suite completa, guardar todos los cambios de la versión y desplegar un commit identificado. No se cambió la prueba durante esta auditoría para hacerla pasar.

## Coherencia y alcance del producto

### Statements: retirada parcial

Se quitó Saved statements de Reports y su ruta redirige correctamente, pero `/settlements` conserva la interfaz Owner Settlements y sus acciones. La landing pública aún dice “Half-month settlements and reserve buckets are live” y anuncia “Close and save half-month financial summaries”. El catálogo lo mantiene en `src/lib/plans.ts:94`, con traducciones equivalentes. Este punto pertenece a la limpieza incompleta de cambios anteriores.

**Cierre:** resolver el retiro completo de la función de dueño y sus promesas comerciales; conservar la integridad de los movimientos históricos y distinguirlos de las liquidaciones de choferes.

### Web e iOS ya no presentan la misma calculadora

La web usa overhead y debt service en cero para mostrar solo lo que deja el viaje (`src/components/calculator/calculator-panel.tsx:110`) y gastos del mes como referencia. El endpoint móvil sigue enviando overhead y deuda por milla (`src/app/api/mobile/calculator/route.ts:149`) y el cliente iOS conserva “Allocated operating costs”, beneficio después de asignaciones y deuda (`mobile/Sources/OnRoadBooks/Features/Calculator/LoadCalculatorView.swift:243`). También conserva el selector de rate context.

No implica que el beneficio directo tenga que diferir; sí que las respuestas y conceptos presentados al mismo dueño son distintos. Lanzaría primero la web; no declararía paridad ni preparación conjunta de iOS sin alinear y probar ese flujo.

### Respaldo de documentos pendiente de acreditar

El backup verificado cubre base de datos. `docs/operations.md:224` aclara que los bytes de R2 requieren una copia aparte. No se encontró evidencia de una restauración independiente de recibos/documentos en esta revisión. Restaurar la base de datos no recupera un archivo eliminado de R2.

**Cierre:** definir y probar recuperación de documentos además del SQL. El respaldo de base de datos exitoso no debe presentarse como recuperación completa del servicio.

## Validaciones que siguen pendientes

- Compra de suscripción, webhook, acceso, fallo de pago, cancelación y portal de cliente con Stripe, en un entorno de pruebas representativo. No se realizó ningún cobro.
- Confirmar correspondencia entre los precios/webhook de producción y la cuenta correcta de Stripe. Health solo certifica que hay variables. Se intentó revisar el panel sin secretos: la sesión disponible abrió EPS Logistics LLC, cuyo catálogo activo estaba vacío; no se pudo acreditar que sea la cuenta enlazada por la aplicación. No se concluye que los precios de la app falten por ese resultado.
- La revisión automática rechazó `vercel env pull` a un archivo temporal por copiar secretos de producción. No se ejecutó ni se buscó extraerlos por otro medio. Se continuó con nombres de variables y lectura de UI sin revelar claves.
- Entrega real de recuperación de contraseña (función ahora implementada y probada con datos desechables), nueva sesión Google y notificaciones operativas. No se pulsó Run operations check porque también envía un correo; presencia de configuración no equivale a entrega verificada.
- Restauración completa Neon/auth/documentos y carga concurrente representativa. Las certificaciones históricas del 20 de septiembre son evidencia previa, no pruebas repetidas hoy.

## Orden recomendado

1. Corregir Stripe y cerrar recuperación/protección de acceso.
2. Completar la retirada de statements y hacer coincidir landing, planes y web.
3. Actualizar la prueba obsoleta, completar suite y publicar una versión identificada en Git.
4. Certificar cobro/cancelación y recuperación de datos/documentos.
5. Abrir una beta pequeña, supervisada y centrada en la web; después ampliar el lanzamiento.

La prioridad ya no es añadir más funciones ni pulir pequeños detalles visuales: es asegurar acceso, cobro, recuperación y una versión consistente.
