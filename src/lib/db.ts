import "server-only";
import { Pool, type QueryResultRow } from "pg";

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

const PLACEHOLDER_DATABASE_URL =
  "postgresql://asc_user:replace_with_db_password@127.0.0.1:5432/attack_surface_checker";

const globalForPg = globalThis as typeof globalThis & {
  __attackSurfaceCheckerPool?: Pool;
};

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl || databaseUrl === PLACEHOLDER_DATABASE_URL) {
    throw new DatabaseConfigError(
      "PostgreSQL is not configured. Copy .env.example to .env.local and set DATABASE_URL.",
    );
  }

  try {
    const parsed = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
      throw new DatabaseConfigError(
        "DATABASE_URL must point to local PostgreSQL (127.0.0.1, localhost, or ::1).",
      );
    }
  } catch (err) {
    if (err instanceof DatabaseConfigError) {
      throw err;
    }
    throw new DatabaseConfigError(
      "DATABASE_URL must be a valid PostgreSQL connection string.",
    );
  }

  return databaseUrl;
}

function getPool() {
  if (!globalForPg.__attackSurfaceCheckerPool) {
    globalForPg.__attackSurfaceCheckerPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 5,
    });
  }

  return globalForPg.__attackSurfaceCheckerPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}
