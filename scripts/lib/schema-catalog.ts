import type { Client } from "pg";

/** Semantic catalog snapshot; column order is not part of the data contract. */
export async function schemaCatalog(client: Client, schema: string) {
  const queries = {
    columns: `SELECT c.relname AS table_name, a.attname AS name,
      format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
      pg_get_expr(d.adbin, d.adrelid) AS default_value
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname=$1 AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attname`,
    constraints: `SELECT c.relname AS table_name, con.conname AS name,
      con.contype AS type, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND con.contype IN ('p','f','u','c')
      ORDER BY c.relname, con.conname`,
    indexes: `SELECT tablename AS table_name, indexname AS name, indexdef AS definition
      FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename, indexname`,
    enums: `SELECT t.typname AS name, e.enumlabel AS value, e.enumsortorder AS position
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE n.nspname=$1 ORDER BY t.typname, e.enumsortorder`,
  };
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const [key, query] of Object.entries(queries)) {
    const { rows } = await client.query(query, [schema]);
    result[key] = rows.map((row) => Object.fromEntries(Object.entries(row).map(([name, value]) => [
      name,
      typeof value === "string"
        ? value.replaceAll(`"${schema}".`, "").replaceAll(`${schema}.`, "")
        : value,
    ])));
  }
  return result;
}
