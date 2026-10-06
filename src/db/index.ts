import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida. Configure a variável no .env.local");
}

// Singleton — evita múltiplos pools durante hot-reload em dev e em ambientes serverless.
// Pool pequeno para conexões PostgreSQL diretas ou pooled.
const g = global as unknown as { _pgClient?: ReturnType<typeof postgres> };

const client = g._pgClient ?? postgres(process.env.DATABASE_URL, {
  connection: process.env.DATABASE_READ_ONLY === "true" ? { default_transaction_read_only: true } : {},
  prepare: false,       // obrigatório para PgBouncer em transaction mode
  max: 3,               // permite até 3 queries concorrentes sem esgotar o pool
  idle_timeout: 20,     // fecha conexões ociosas após 20s
  connect_timeout: 10,  // falha rápido se o PostgreSQL não responder
});

if (process.env.NODE_ENV !== "production") g._pgClient = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
