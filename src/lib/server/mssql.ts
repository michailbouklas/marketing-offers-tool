import { env } from "$env/dynamic/private";
import sql from "mssql";

/**
 * Lazy pool for the SAP business warehouse (MSSQL, `MS_SQL_*` env). Read-only
 * use: the recipe builder looks up materials and their cost in
 * `dbo.sapbw_items`. Cached on globalThis so Vite HMR does not leak pools.
 */
const globalForMssql = globalThis as typeof globalThis & {
  mssqlPool?: Promise<sql.ConnectionPool>;
};

function required(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getMssqlPool(): Promise<sql.ConnectionPool> {
  globalForMssql.mssqlPool ??= new sql.ConnectionPool({
    server: required("MS_SQL_SERVER"),
    port: Number(env.MS_SQL_PORT || 1433),
    user: required("MS_SQL_USER"),
    password: required("MS_SQL_PASSWORD"),
    database: required("MS_SQL_DB"),
    options: {
      encrypt: env.MS_SQL_ENCRYPT === "true",
      trustServerCertificate: env.MS_SQL_TRUST_SERVER_CERTIFICATE !== "false",
    },
  })
    .connect()
    .catch((error: unknown) => {
      // Do not cache a failed connection; the next request retries.
      globalForMssql.mssqlPool = undefined;
      throw error;
    });

  return globalForMssql.mssqlPool;
}

export { sql };
