# Fase 2: base paralela Neon + Drizzle

Fecha: 2026-09-19.

## Estado

El armazón local está implementado y no cambia el backend activo. Prisma sigue leyendo `DATABASE_URL`/`DIRECT_URL`; el nuevo cliente Drizzle lee únicamente `NEON_DATABASE_URL`, y Drizzle Kit prefiere `NEON_DIRECT_URL` para migraciones. Ninguno de los dos nombres tiene fallback hacia las variables actuales.

La fase 2 está verificada contra Neon real. Se creó `onroadbooks-neon` mediante Vercel Marketplace, plan `free_v3`, región `iad1`, con Neon Auth desactivado. Proyecto Neon: `muddy-cloud-35104103`; base: `neondb`. La integración se conectó únicamente al entorno Development de `onroadbooks`, con prefijo `NEON_`.

Las URLs pooled y directa están en `.env` (ignorado por Git y con permisos 0600). Vercel mantiene `NEON_DATABASE_URL`, `NEON_DATABASE_URL_UNPOOLED` y el alias `NEON_DIRECT_URL` en Development. No se creó schema ni se copiaron datos. La integración instaló también las guías oficiales `neon` y `neon-postgres` en `.agents/skills` y actualizó `skills-lock.json`.

## Decisiones implementadas

- `drizzle-orm` usa `node-postgres` (`pg`) contra el endpoint pooled de Neon. El adaptador existente contiene transacciones interactivas y operaciones `Serializable`; el driver HTTP de Neon no cubre ese contrato.
- La conexión se crea de forma perezosa. Importar o compilar la aplicación sin variables Neon no abre sockets ni cambia el almacenamiento actual.
- El pool se reutiliza mediante `globalThis` para evitar conexiones duplicadas por recargas de desarrollo. Tiene máximo de cinco conexiones, timeout de conexión de cinco segundos y libera clientes inactivos a los diez segundos.
- En fase 2, `src/db/schema/index.ts` quedó vacío de forma deliberada. La fase 3 ya añadió las tablas, enums, relaciones, índices y CHECK; ver [resultado de fase 3](phase-3-drizzle-schema.md).
- No se añadió un selector Drizzle a `src/lib/db/index.ts`. Hacerlo antes de tener un repositorio compatible permitiría activar un backend incompleto.

## Archivos y comandos

| Elemento | Propósito |
| --- | --- |
| `drizzle.config.ts` | Configuración estricta de PostgreSQL, schema y salida de migraciones |
| `src/db/connection-url.ts` | Validación y separación de URLs runtime/migraciones |
| `src/db/index.ts` | Pool y cliente Drizzle solo servidor, además del healthcheck transaccional |
| `src/db/schema/index.ts` | Entrada del futuro schema Drizzle |
| `scripts/neon-smoke.ts` | SELECT real en una transacción read-only con aislamiento Serializable |
| `src/lib/__tests__/neon-connection.test.ts` | Evita cruces entre URLs y rechaza configuración ausente/inválida |

Comandos añadidos:

```bash
npm run db:drizzle:generate
npm run db:drizzle:check
npm run db:drizzle:migrate
npm run smoke:neon
```

`db:drizzle:generate` y `db:drizzle:migrate` no deben ejecutarse contra un destino compartido hasta que la fase 3 produzca y revise el schema SQL.

## Verificación remota completada

- `npm run smoke:neon`: correcto contra `neondb`, mediante Drizzle y el endpoint pooled. Se corrigió el `await` de nivel superior del script para hacerlo ejecutable con el formato CommonJS del proyecto.
- Conexiones pooled y directa: SELECT dentro de `BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY`, seguido de `ROLLBACK`; ambas devolvieron aislamiento `serializable`, modo read-only `on` y cero tablas en `public`.
- Ambas conexiones confirmaron TLS cifrado y certificado autorizado desde el socket del cliente. `pg_stat_ssl` describe el tramo interno de Neon y no certifica el TLS entre este cliente y el proxy.
- Las credenciales no se imprimieron ni se añadieron a archivos versionados.

La fase 3 ya tradujo y aplicó el schema en Neon; los conteos de cero tablas anteriores documentan el estado previo a esa fase. La comprobación remota del origen Supabase continúa pendiente; Vercel muestra su integración actual como `Suspended`.

La reversión local de esta fase consiste en retirar los archivos `src/db`, `drizzle.config.ts`, el smoke, sus scripts/variables y las cuatro dependencias nuevas. No existe reversión de datos porque esta fase no escribe ninguno.
