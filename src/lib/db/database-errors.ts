import "server-only";
import { DrizzleQueryError } from "drizzle-orm";

/** Route handlers return domain messages; SQL text and bound values must never escape here. */
export function protectDatabaseErrors<T extends object>(store: T): T {
  return new Proxy(store, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args);
        } catch (error) {
          if (error instanceof DrizzleQueryError || isPostgresError(error)) {
            // Do not attach `cause`: it includes SQL parameters and possibly password hashes.
            throw new Error(
              "The database operation could not be completed. Please try again.",
            );
          }
          throw error;
        }
      };
    },
  });
}

function isPostgresError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/.test(error.code)
  );
}
