import { db } from "@/db";
import { alertas } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// ─── QUERIES ────────────────────────────────────────────────────────────────

/** Lista alertas recentes para uma UF */
export async function getAlertasByUF(uf: string, limit = 20) {
  return db
    .select()
    .from(alertas)
    .where(eq(alertas.sg_uf, uf))
    .orderBy(desc(alertas.criado_em))
    .limit(limit);
}

/** Lista todos os alertas recentes */
export async function getAlertasRecentes(limit = 50) {
  return db
    .select()
    .from(alertas)
    .orderBy(desc(alertas.criado_em))
    .limit(limit);
}

// ─── INSERTS ────────────────────────────────────────────────────────────────

export type NovoAlerta = typeof alertas.$inferInsert;

export async function insertAlerta(alerta: NovoAlerta) {
  return db.insert(alertas).values(alerta);
}
