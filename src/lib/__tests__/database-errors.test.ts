import assert from "node:assert/strict";
import { it } from "node:test";
import { DrizzleQueryError } from "drizzle-orm";
import { protectDatabaseErrors } from "../db/database-errors";

it("never exposes bound credentials or PostgreSQL detail to route handlers", async () => {
  const cause = Object.assign(
    new Error("duplicate key includes sensitive email"),
    { code: "23505" },
  );
  const failures = [
    new DrizzleQueryError(
      'insert into "User" values ($1)',
      ["scrypt$private-hash"],
      cause,
    ),
    cause,
  ];
  for (const failure of failures) {
    const store = protectDatabaseErrors({
      async createOwner() {
        throw failure;
      },
    });
    await assert.rejects(store.createOwner(), (error) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "The database operation could not be completed. Please try again.",
      );
      assert.equal("cause" in error, false);
      assert.equal("params" in error, false);
      return true;
    });
  }
});
it("preserves domain failures and the repository receiver", async () => {
  const failure = new Error("The owner role cannot be changed here.");
  const store = protectDatabaseErrors({
    name: "workspace",
    async read() {
      return this.name;
    },
    async reject() {
      throw failure;
    },
  });
  assert.equal(await store.read(), "workspace");
  await assert.rejects(store.reject(), (error) => error === failure);
});
