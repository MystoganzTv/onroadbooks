# Fase 3: esquema PostgreSQL en Drizzle

Fecha: 2026-09-19. Destino de desarrollo: `onroadbooks-neon` / `muddy-cloud-35104103` / `neondb`.

**Actualización fase 4:** el origen ya se recuperó y cotejó; se añadió una segunda migración para preservar el orden histórico de `ExpenseCategory` y `PlanId`, y se copiaron 44 registros. Este documento describe la verificación inicial. Ver [fase 4](phase-4-data-copy.md).

## Resultado y límite de la verificación

Se tradujo el esquema declarado en `prisma/schema.prisma` y sus siete migraciones versionadas. La migración `drizzle/0000_onroadbooks-baseline.sql` está aplicada a Neon Development. Los esquemas TypeScript se organizan por entidad en `src/db/schema/`, con enums y relaciones exportados desde `index.ts`.

El catálogo PostgreSQL resultante coincide con el obtenido al ejecutar las migraciones Prisma: **20 tablas, 270 columnas, 22 enums, 20 claves primarias, 42 claves foráneas, 3 CHECK y 68 índices** (20 de PK, 12 UNIQUE y 36 no únicos). La comparación incluye nombres, tipos/precisión, nulabilidad, valores por defecto, columnas de índices y acciones referenciales. El orden físico de las columnas no se compara; la futura copia debe nombrarlas explícitamente.

Esto verifica el contrato versionado del repositorio, **no el catálogo del Supabase desplegado**, cuya integración sigue suspendida. Antes de copiar datos debe recuperarse el origen y comprobarse si tiene cambios manuales, grants, políticas u objetos adicionales.

## Semántica preservada

- Nombres físicos, IDs `TEXT` y valores legacy `VIEWER` e `INDIVIDUAL` conservados.
- Los IDs se proporcionan explícitamente. `cuid()` era un default del cliente Prisma, no de PostgreSQL. La generación de nuevos IDs se implementará en el repositorio Drizzle en fase 5; ninguna copia debe regenerarlos.
- `numeric` se lee/escribe como string para conservar precisión; sin conversión automática a `number`.
- `DATE` usa strings ISO y `TIMESTAMP(3)` sin zona usa `Date`. Los valores históricos pueden suministrarse explícitamente.
- `$onUpdateFn` mantiene el comportamiento de `updatedAt` en escrituras Drizzle y no crea defaults ni triggers SQL. Los valores explícitos de una copia prevalecen.
- Los defaults JSONB `{}` y `[]`, SQL NULL y JSON `null` conservan su diferencia.
- Los CHECK de importe positivo, motivo de ajuste y reparto de overhead se declararon en Drizzle, aunque no figuren como constraints en el modelo Prisma.
- Las relaciones de Drizzle permiten consultas anidadas; las FK continúan siendo la garantía de integridad PostgreSQL. La autorización por negocio sigue perteneciendo al repositorio y se verificará al migrarlo.

## Verificación reproducible

```bash
# Construye ambos catálogos dentro de una transacción y siempre los revierte.
npm run verify:neon-schema

# Además compara el public ya desplegado en Neon con el original versionado.
npm run verify:neon-schema -- --deployed

# Lectura/escritura y restricciones reales con fixtures que siempre hacen rollback.
npm run smoke:neon-schema
```

`verify-neon-schema` requiere conexión directa de Neon. Crea dos esquemas de nombre aleatorio dentro de una transacción: uno con el SQL Prisma y otro con el SQL Drizzle. Lee `pg_catalog` y compara los resultados; finaliza con `ROLLBACK`, también en caso de error. No utiliza ni modifica el origen Supabase.

El smoke realizó 28 aserciones: fechas/timestamps históricos, decimal monetario máximo y tarifa de cuatro decimales, defaults, enums legacy, consultas relacionales, relaciones opcionales, UNIQUE nullable, tres CHECK, FK inválida, RESTRICT al borrar cargas con pagos, CASCADE, SET NULL, ON UPDATE CASCADE, actualización automática de `updatedAt`, SQL NULL frente a JSON null y ausencia del usuario de prueba tras rollback.

Resultados: paridad de catálogo y smoke remoto correctos; TypeScript, lint, 457 pruebas unitarias, build y 17 pruebas de navegador correctos. Las pruebas de navegador comprueban registro/login, permisos y rutas principales con JSON/local; no certifican todavía Auth.js, R2 ni el futuro repositorio Drizzle. La ejecución local usa Node 23.3.0; CI declara Node 22.

## Estado operativo

La aplicación sigue seleccionando Prisma/JSON mediante `src/lib/db/index.ts`. No se han copiado datos reales, cambiado Auth ni Storage, ni desplegado la aplicación. La tabla técnica `drizzle.__drizzle_migrations` registra la migración aplicada; no forma parte de las 20 tablas de negocio.

El siguiente paso es fase 4: recuperar el origen, verificar su catálogo y preparar una copia consistente con IDs, decimales y timestamps intactos. No se debe sustituir el origen real por fixtures ni por el JSON local.
