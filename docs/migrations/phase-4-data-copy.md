# Fase 4: copia de Supabase a Neon

Copia confirmada el 19 de septiembre de 2026; reconciliación posterior a la interrupción completada el 20 de septiembre (UTC). **44 registros en 20 tablas, sin diferencias de contenido, conteos por negocio ni sumas numéricas.** Es una copia de desarrollo: no se ha desplegado el cambio de backend. La fase 5 añadió después el selector Drizzle, todavía sin activarlo en producción.

## Origen recuperado y esquema verificado

Origen: `uznuvzeghgwygpxjhqdz` (OnRoadBooks, Supabase PostgreSQL 17). Destino: proyecto Neon `muddy-cloud-35104103`, base `neondb`, solo Development. Supabase rechazó inicialmente reanudar por el límite de dos proyectos gratuitos activos. El usuario autorizó expresamente pausar Bookliz temporalmente; RBTGenius no se modificó. El proyecto administrado por Vercel se recuperó desde el panel de Supabase porque el conector de restauración no lo encontraba.

El catálogo desplegado coincide con el esquema versionado salvo el **orden de los valores de `ExpenseCategory` y `PlanId`**. Los mismos valores se habían añadido históricamente en otro orden. Como el orden de enums afecta comparaciones y ordenación PostgreSQL, se conserva el del origen mediante `0001_align-source-enum-order.sql`, aplicada después del baseline. La evidencia de ese orden está en `source-enum-order.json`; no se reescribió la migración inicial ya aplicada.

Paridad final: 20 tablas, 270 columnas, 22 enums, 42 FK, 3 CHECK y 68 índices contando claves primarias. La tabla técnica `_prisma_migrations` permanece en el respaldo, pero no se copia al ledger Drizzle.

Inventario SQL observado:

- RLS activo en las 20 tablas de negocio del origen; sin políticas en `public` ni `storage`.
- Sin funciones, vistas, secuencias ni publicaciones de aplicación en `public`; sin triggers de usuario en `public` o `auth`.
- Tres usuarios Auth y tres identidades Google, todos vinculados por email a usuarios de aplicación y con email confirmado. El mapa cifrado conserva el identificador del proveedor para la fase Auth.js; no activa enlaces de cuentas ni migra sesiones.
- Cero objetos en `storage.objects` y cero documentos de aplicación.
- Extensiones observadas: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`; `pg_cron` no está instalado.

Esto no certifica aún la configuración de OAuth/SMTP, Edge Functions, webhooks, permisos efectivos de roles o buckets vacíos. Esos puntos siguen en las fases de identidad, archivos y servicios. Neon no expone una Data API; las futuras consultas de aplicación seguirán pasando por la autorización del servidor.

## Registros copiados

| Tabla | Filas |
| --- | ---: |
| User | 3 |
| Business | 3 |
| FinancialGoal | 2 |
| Subscription | 3 |
| ReserveAccount | 6 |
| Driver | 2 |
| FinancialSettings | 3 |
| Truck | 3 |
| Load | 4 |
| Expense | 13 |
| FinancialObligation | 2 |
| Otras nueve tablas | 0 |
| **Total** | **44** |

## Transferencia y comprobaciones

`scripts/copy-supabase-to-neon.ts` acepta `--check` (por defecto), `--dry-run`, `--apply` y `--reconcile`. Sus destinos están restringidos al Supabase de OnRoadBooks y al endpoint Neon Development configurado para esta migración. No cambiar estos controles para reutilizarlo en producción sin revisar ese destino.

El origen se lee en una transacción `REPEATABLE READ READ ONLY`. El destino usa `SERIALIZABLE` para copiar, bloquea escrituras concurrentes y debe estar vacío en las 20 tablas. No hay truncados, upserts ni regeneración de IDs. Se insertan columnas explícitas, en orden de dependencias FK, con lotes de 200 filas. Se mantienen todas las restricciones durante la inserción.

Cada valor viaja como texto de PostgreSQL o SQL NULL: no se convierte dinero a `Number`, fechas a `Date` ni JSON a objetos JavaScript. Esto conserva la precisión, los timestamps y la distinción entre SQL NULL y JSON `null`. Se calculan hashes SHA-256 de todas las columnas ordenadas por ID con collation C, conteos por negocio y sumas de cada columna `numeric`. El commit requiere igualdad exacta. El ensayo usa el mismo procedimiento y termina con rollback. La reconciliación posterior lee ambos lados y detecta diferencias después del commit.

Ambas conexiones de copia usan `sslmode=verify-full`. El certificado público de Supabase se obtuvo del enlace de su panel oficial, con huella SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`; no se desactivó la validación TLS.

## Respaldo y evidencia privada

Carpeta local: `/Users/enrique/OnRoadBooksBackups/migration-20260919` (fuera del repositorio).

- `onroadbooks-20260919T172339Z.dump.enc`: dump de `public`, 84.461 bytes, formato de cifrado existente `ORBK1`, AES-256-GCM + scrypt.
- `identities-1789838710035.json.enc`: mapa de tres identidades Google, sin tokens de proveedor ni sesiones Supabase.
- `copy-1789838704519-dry-run.json`: ensayo con rollback.
- `copy-1789838843563-apply.json`: evidencia del commit.
- `copy-1789865027985-reconcile.json`: reconciliación de los datos persistidos tras la interrupción.
- Inventario y catálogos previos a la alineación de enums, además del certificado público.

Los informes tienen permisos 0600 y el directorio 0700. Los informes contienen identificadores de negocios y totales: no deben publicarse ni añadirse a Git. El dump y el mapa de identidades están cifrados. La clave se generó y guardó como `BACKUP_PASSPHRASE` en `.env` local, ignorado por Git y con permisos 0600; no se imprimió ni se trasladó a un gestor externo de contraseñas. Su custodia independiente sigue siendo necesaria para recuperación si se pierde este equipo.

El respaldo se descifró, restauró íntegramente en un PostgreSQL local desechable y comparó contra los manifiestos de las 20 tablas. Ese servidor solo abrió un socket Unix en una carpeta privada, sin listener TCP, y se detuvo y eliminó al terminar. La verificación de `pg_restore --list` también pasó, pero no sustituye esa restauración completa.

## Comandos reproducibles

Las rutas locales `MIGRATION_SOURCE_CA_CERT`, `MIGRATION_REPORT_DIR`, `MIGRATION_BACKUP_FILE` y `MIGRATION_MANIFEST_FILE` quedaron en `.env`. No contienen credenciales. Con el origen disponible:

```bash
npm run migrate:data -- --check
npm run migrate:data -- --reconcile
npm run migrate:identities
```

La copia real **ya está hecha**. No repetir `--apply` ni `--dry-run` sobre este destino: ambos rechazan datos preexistentes. Para ensayar de nuevo, preparar un destino vacío y revisar explícitamente sus controles.

Pruebas que no necesitan el origen Supabase:

```bash
npm run verify:migration-backup
npm run smoke:data-copy
npm run verify:neon-schema -- --deployed
npm run smoke:neon-schema
```

El smoke de copia crea dos esquemas de prueba en Neon y siempre hace rollback: 211 registros, varios lotes, dinero exacto, números JSON mayores que `Number.MAX_SAFE_INTEGER`, nulls, fechas, conteos por negocio, rechazo de destino no vacío, fallo de una restricción tras escrituras y detección de diferencias de esquema. TypeScript, lint, 459 pruebas unitarias, build y las 17 pruebas de navegador pasaron. Las pruebas de navegador todavía utilizan JSON/local; no certifican el futuro repositorio Drizzle ni Auth.js/R2.

## Estado y siguiente fase

Al cerrar inicialmente la copia, OnRoadBooks se pausó y Bookliz se reactivó. **Ese estado quedó sustituido por la autorización posterior del usuario:** pausar lo necesario excepto RBTGenius y restaurarlo al finalizar la migración completa. Se volvió a pausar Bookliz y a reactivar OnRoadBooks. Estado confirmado posteriormente: OnRoadBooks y RBTGenius `ACTIVE_HEALTHY`; Bookliz `INACTIVE`. Bookliz permanecerá pausado durante las fases pendientes, sin alternar proyectos al terminar cada fase.

La [fase 5](phase-5-drizzle-repository.md) implementa y verifica los contratos Repository/AuthStore sobre Drizzle. Auth.js y R2 aún no están implementados. Esta copia inicial no autoriza un corte futuro sin reconciliar cambios posteriores en datos e identidades, y no implementa sincronización continua ni dual-write.
