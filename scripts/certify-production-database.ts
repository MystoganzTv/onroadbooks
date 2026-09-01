import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Prisma, PrismaClient } from "../src/generated/prisma";

import { APPLICATION_TABLES } from "./lib/postgres";


interface SecurityRow {
  table_name: string;
  rls_enabled: boolean;
  anon_select: boolean;
  authenticated_select: boolean;
  anon_insert: boolean;
  authenticated_insert: boolean;
  anon_update: boolean;
  authenticated_update: boolean;
  anon_delete: boolean;
  authenticated_delete: boolean;
  service_select: boolean;
  service_insert: boolean;
  service_update: boolean;
  service_delete: boolean;
}

function schemaUrl(source: string, schema: string): string {
  const url = new URL(source);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  process.stdout.write(result.stdout ?? "");
}

async function auditPublicSchema(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<SecurityRow[]>`
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
      has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
      has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
      has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
      has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
      has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
      has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
      has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
      has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
      has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
      has_table_privilege('service_role', c.oid, 'UPDATE') as service_update,
      has_table_privilege('service_role', c.oid, 'DELETE') as service_delete
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (${Prisma.join(APPLICATION_TABLES)})
    order by c.relname
  `;

  assert.equal(rows.length, APPLICATION_TABLES.length, "all application tables exist in public");
  for (const row of rows) {
    assert.equal(row.rls_enabled, true, `${row.table_name} has RLS enabled`);
    assert.equal(
      Object.entries(row).some(([key, value]) => key !== "table_name" && key !== "rls_enabled" && value === true),
      false,
      `${row.table_name} is not granted to anon/authenticated`,
    );
  }

  const defaultExposure = await prisma.$queryRaw<Array<{
    owner_name: string;
    object_type: string;
    grantee_name: string;
    grants: bigint;
  }>>`
    select
      owner.rolname as owner_name,
      d.defaclobjtype::text as object_type,
      grantee.rolname as grantee_name,
      count(*)::bigint as grants
    from pg_default_acl d
    cross join lateral aclexplode(coalesce(d.defaclacl, acldefault(d.defaclobjtype, d.defaclrole))) a
    join pg_roles owner on owner.oid = d.defaclrole
    join pg_roles grantee on grantee.oid = a.grantee
    join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'public'
      and grantee.rolname in ('anon', 'authenticated', 'service_role')
      and d.defaclobjtype in ('r', 'f', 'S')
    group by owner.rolname, d.defaclobjtype, grantee.rolname
    order by owner.rolname, d.defaclobjtype, grantee.rolname
  `;
  const prismaRoleExposure = defaultExposure.filter((row) => row.owner_name === "postgres");
  if (prismaRoleExposure.length > 0) {
    console.log(
      "Unexpected postgres default grants:",
      prismaRoleExposure.map((row) => ({ ...row, grants: Number(row.grants) })),
    );
  }
  assert.equal(prismaRoleExposure.length, 0, "future Prisma-created public objects default to private");

  const database = await prisma.$queryRaw<Array<{
    version: string;
    businesses: bigint;
    users: bigint;
    subscriptions: bigint;
    provider_backed_subscriptions: bigint;
    complimentary_subscriptions: bigint;
  }>>`
    select
      current_setting('server_version') as version,
      (select count(*) from public."Business")::bigint as businesses,
      (select count(*) from public."User")::bigint as users,
      (select count(*) from public."Subscription")::bigint as subscriptions,
      (
        select count(*) from public."Subscription"
        where "providerCustomerId" is not null and "providerSubscriptionId" is not null
      )::bigint as provider_backed_subscriptions,
      (
        select count(*) from public."Subscription"
        where "providerCustomerId" is null and "providerSubscriptionId" is null
      )::bigint as complimentary_subscriptions
  `;
  console.log("Public schema security:", {
    postgres: database[0]?.version,
    tablesChecked: rows.length,
    businesses: Number(database[0]?.businesses ?? 0),
    users: Number(database[0]?.users ?? 0),
    subscriptions: Number(database[0]?.subscriptions ?? 0),
    providerBackedSubscriptions: Number(database[0]?.provider_backed_subscriptions ?? 0),
    complimentarySubscriptions: Number(database[0]?.complimentary_subscriptions ?? 0),
    rls: "enabled",
    dataApiGrants: "revoked",
    defaultPrivileges: "private",
    internalDefaultGrantGroups: defaultExposure
      .filter((row) => row.owner_name !== "postgres")
      .map((row) => ({ ...row, grants: Number(row.grants) })),
  });
}

async function certifyIsolatedImport(baseUrl: string): Promise<void> {
  const schema = `cert_${Date.now()}_${randomBytes(4).toString("hex")}`;
  assert.match(schema, /^cert_[a-z0-9_]+$/);
  const admin = new PrismaClient({ datasourceUrl: baseUrl });
  const isolatedUrl = schemaUrl(baseUrl, schema);
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "onroadbooks-import-cert-"));

  try {
    const source = JSON.parse(
      await readFile(path.join(process.cwd(), ".e2e-data", "onroad-books.json"), "utf8"),
    ) as {
      business: { id: string };
      loads: Array<{ costsPosted: boolean }>;
      expenses: Array<{ id: string }>;
    };
    // Recreate the shape of the pre-Postgres ledger. Modern E2E data contains
    // mirrored trip-cost rows which the one-time importer correctly rejects.
    source.loads = source.loads.map((load) => ({ ...load, costsPosted: false }));
    source.expenses = source.expenses.filter((expense) => !expense.id.startsWith("expload_"));
    await writeFile(
      path.join(fixtureDir, "onroad-books.json"),
      `${JSON.stringify(source, null, 2)}\n`,
      { mode: 0o600 },
    );

    await admin.$executeRawUnsafe(`create schema "${schema}"`);
    const env = {
      ...process.env,
      DATABASE_URL: isolatedUrl,
      DIRECT_URL: isolatedUrl,
      ONROAD_DATA_DIR: fixtureDir,
      IMPORT_BUSINESS_ID: source.business.id,
    };
    run("npx", ["prisma", "migrate", "deploy"], env);
    run(
      "npx",
      ["prisma", "db", "execute", "--file", "prisma/harden-data-api.sql", "--schema", "prisma/schema.prisma"],
      env,
    );
    const isolated = new PrismaClient({ datasourceUrl: isolatedUrl });
    try {
      const [rls] = await isolated.$queryRaw<Array<{ tables: bigint; protected: bigint }>>`
        select
          count(*)::bigint as tables,
          count(*) filter (where c.relrowsecurity)::bigint as protected
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = current_schema()
          and c.relkind = 'r'
          and c.relname in (${Prisma.join(APPLICATION_TABLES)})
      `;
      assert.equal(Number(rls?.tables ?? 0), APPLICATION_TABLES.length);
      assert.equal(Number(rls?.protected ?? 0), APPLICATION_TABLES.length);
    } finally {
      await isolated.$disconnect();
    }
    run(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "scripts/import-json-to-postgres.ts"],
      env,
    );
    run(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "scripts/postgres-smoke.ts"],
      env,
    );
    console.log("Isolated migration/import/smoke: passed");
  } finally {
    await admin.$executeRawUnsafe(`drop schema if exists "${schema}" cascade`);
    await admin.$disconnect();
    await rm(fixtureDir, { recursive: true, force: true });
  }
}

async function main() {
  const publicUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!publicUrl?.startsWith("postgres")) {
    throw new Error("DIRECT_URL or DATABASE_URL is required");
  }
  const prisma = new PrismaClient({ datasourceUrl: schemaUrl(publicUrl, "public") });
  try {
    await auditPublicSchema(prisma);
  } finally {
    await prisma.$disconnect();
  }
  await certifyIsolatedImport(publicUrl);
}

main().catch((error) => {
  console.error("Production database certification failed:", error);
  process.exitCode = 1;
});
