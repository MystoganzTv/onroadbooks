type NeonConnectionEnvironment = {
  [key: string]: string | undefined;
  NEON_DATABASE_URL?: string;
  NEON_DIRECT_URL?: string;
};

function validatePostgresUrl(value: string | undefined, variableName: string) {
  const candidate = value?.trim();

  if (!candidate) {
    throw new Error(`${variableName} is required.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${variableName} must use the postgres or postgresql protocol.`);
  }

  return candidate;
}

export function resolveNeonRuntimeUrl(environment: NeonConnectionEnvironment) {
  return validatePostgresUrl(environment.NEON_DATABASE_URL, "NEON_DATABASE_URL");
}

export function resolveNeonMigrationUrl(environment: NeonConnectionEnvironment) {
  if (environment.NEON_DIRECT_URL?.trim()) {
    return validatePostgresUrl(environment.NEON_DIRECT_URL, "NEON_DIRECT_URL");
  }

  return resolveNeonRuntimeUrl(environment);
}
