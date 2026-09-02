import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? filesUnder(path)
      : path.endsWith("/page.tsx") || path.endsWith("/layout.tsx")
        ? [path]
        : [];
  });
}

describe("request-scoped database deduplication", () => {
  const root = process.cwd();

  it("memoizes session verification and ledger reads with React cache", () => {
    const auth = readFileSync(join(root, "src/lib/auth/index.ts"), "utf8");
    const db = readFileSync(join(root, "src/lib/db/index.ts"), "utf8");

    assert.match(auth, /export const getSession = cache\(/);
    assert.match(db, /export const getDataset = cache\(/);
  });

  it("routes authenticated page reads through the shared request loader", () => {
    const appRoot = join(root, "src/app/(app)");
    const violations = filesUnder(appRoot)
      .filter((path) => readFileSync(path, "utf8").includes(".getDataset()"))
      .map((path) => relative(root, path));

    assert.deepEqual(
      violations,
      [],
      `Authenticated routes bypassing request deduplication:\n${violations.join("\n")}`,
    );
  });
});
