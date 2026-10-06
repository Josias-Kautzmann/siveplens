/**
 * Reproduz os denominadores publicados por três estudos de 2024 e grava um
 * artefato JSON auditável. Somente leitura: este script nunca altera o banco.
 *
 * Uso: npm run validate:science
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não definida");

const sql = postgres(process.env.DATABASE_URL, {
  connection: { default_transaction_read_only: true, statement_timeout: 60000 },
  prepare: false,
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

const published = {
  influenza: { allRecords: 267880, pcrPositive: 17145, cohort: 15995, deaths: 1934, fatality: 12.1, influenzaA: 14077, influenzaB: 1918 },
  pediatric: { total: 66170, week17: 2742, influenza: 2560, otherVirus: 32466, otherAgent: 741, unspecified: 24790, covid: 3342, blank: 2271, viralDetectionsKnownOutcome: 36009 },
  vaccination: { cohort: 474, deaths: 171, survivors: 303, fatality: 36 },
};

function compare(expected, observed, mode = "complete") {
  const absoluteDifference = observed - expected;
  const percentDifference = expected === 0 ? null : (absoluteDifference / expected) * 100;
  const deviation = Math.abs(percentDifference ?? absoluteDifference);
  const status = mode !== "complete" ? mode : deviation <= 1 ? "reproduced" : deviation <= 3 ? "compatible" : "investigate";
  return { published: expected, reproduced: observed, absoluteDifference, percentDifference, status };
}

try {
  const columns = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fato_caso_srag'
  `;
  const present = new Set(columns.map((row) => row.column_name));
  const hasAntigen = present.has("an_sars2") && Number((await sql`
    SELECT COUNT(an_sars2) AS n FROM fato_caso_srag WHERE ano_epi = 2024
  `)[0].n) > 0;

  const [row] = await sql`
    WITH enriched AS (
      SELECT *,
        (CASE WHEN pos_pcrflu = 1 AND tp_flu_pcr IN (1,2) THEN 1 ELSE 0 END
        + CASE WHEN pcr_vsr = 1 THEN 1 ELSE 0 END + CASE WHEN pcr_adeno = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_metap = 1 THEN 1 ELSE 0 END + CASE WHEN pcr_rino = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_sars2 = 1 THEN 1 ELSE 0 END + CASE WHEN pcr_boca = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_para1 = 1 THEN 1 ELSE 0 END + CASE WHEN pcr_para2 = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_para3 = 1 THEN 1 ELSE 0 END + CASE WHEN pcr_para4 = 1 THEN 1 ELSE 0 END
        + CASE WHEN pcr_outro = 1 THEN 1 ELSE 0 END) AS viral_detection_count
      FROM fato_caso_srag WHERE ano_epi = 2024
    )
    SELECT
      COUNT(*) AS records_2024,
      COUNT(DISTINCT nu_notific) AS unique_notifications_2024,
      MIN(dt_notific) AS min_notification_date,
      MAX(dt_notific) AS max_notification_date,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1) AS flu_pcr,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao IN (1,2)) AS flu_cohort,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao = 2) AS flu_deaths,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao IN (1,2) AND tp_flu_pcr = 1) AS flu_a,
      COUNT(*) FILTER (WHERE pcr_resul = 1 AND pos_pcrflu = 1 AND evolucao IN (1,2) AND tp_flu_pcr = 2) AS flu_b,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2)) AS infant_total,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2) AND sem_not = 17) AS infant_week17,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2) AND classi_fin = 1) AS infant_flu,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2) AND classi_fin = 2) AS infant_other_virus,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2) AND classi_fin = 3) AS infant_other_agent,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2) AND classi_fin = 4) AS infant_unspecified,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2) AND classi_fin = 5) AS infant_covid,
      COUNT(*) FILTER (WHERE tp_idade IN (1,2) AND classi_fin IS NULL) AS infant_blank,
      COALESCE(SUM(viral_detection_count) FILTER (WHERE tp_idade IN (1,2) AND evolucao IN (1,2)), 0) AS infant_viral_detections
    FROM enriched
  `;

  const antigenClause = hasAntigen ? sql`(pcr_sars2 = 1 OR an_sars2 = 1)` : sql`pcr_sars2 = 1`;
  const [vaccination] = await sql`
    SELECT COUNT(*) AS cohort,
      COUNT(*) FILTER (WHERE evolucao = 2) AS deaths,
      COUNT(*) FILTER (WHERE evolucao = 1) AS survivors
    FROM fato_caso_srag
    WHERE ano_epi = 2024 AND tp_idade = 3 AND nu_idade_n >= 60
      AND imunodepre = 1 AND hospital = 1 AND nosocomial = 2
      AND dt_interna IS NOT NULL AND classi_fin = 5 AND ${antigenClause}
      AND evolucao IN (1,2)
      AND dt_evoluca BETWEEN DATE '2023-12-31' AND DATE '2024-12-28'
  `;

  const n = (key) => Number(row[key]);
  const vaccinationN = Number(vaccination.cohort);
  const reproduced = {
    influenza: {
      allRecords: n("records_2024"), pcrPositive: n("flu_pcr"), cohort: n("flu_cohort"),
      deaths: n("flu_deaths"), fatality: n("flu_cohort") ? n("flu_deaths") / n("flu_cohort") * 100 : 0,
      influenzaA: n("flu_a"), influenzaB: n("flu_b"),
    },
    pediatric: {
      total: n("infant_total"), week17: n("infant_week17"), influenza: n("infant_flu"),
      otherVirus: n("infant_other_virus"), otherAgent: n("infant_other_agent"),
      unspecified: n("infant_unspecified"), covid: n("infant_covid"), blank: n("infant_blank"),
      viralDetectionsKnownOutcome: n("infant_viral_detections"),
    },
    vaccination: {
      cohort: vaccinationN, deaths: Number(vaccination.deaths), survivors: Number(vaccination.survivors),
      fatality: vaccinationN ? Number(vaccination.deaths) / vaccinationN * 100 : 0,
    },
  };

  const comparisons = Object.fromEntries(Object.entries(published).map(([study, metrics]) => [
    study,
    Object.fromEntries(Object.entries(metrics).map(([key, expected]) => [
      key,
      compare(expected, reproduced[study][key], study === "vaccination" && !hasAntigen ? "partial" : "complete"),
    ])),
  ]));

  const identity = JSON.stringify({
    protocol: "published-benchmarks/2.0.0",
    records2024: n("records_2024"),
    uniqueNotifications2024: n("unique_notifications_2024"),
    minNotificationDate: row.min_notification_date,
    maxNotificationDate: row.max_notification_date,
    comparisons,
  });
  const artifact = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    analysisId: createHash("sha256").update(identity).digest("hex").slice(0, 16),
    source: {
      system: "SIVEP-Gripe / OpenDataSUS",
      year: 2024,
      records: n("records_2024"),
      uniqueNotifications: n("unique_notifications_2024"),
      minNotificationDate: row.min_notification_date,
      maxNotificationDate: row.max_notification_date,
      antigenFieldLoaded: hasAntigen,
    },
    published,
    reproduced,
    comparisons,
    limitations: [
      "O banco atual pode ser posterior aos snapshots usados pelos artigos.",
      ...(!hasAntigen ? ["A reprodução vacinal é parcial enquanto AN_SARS2 não estiver populado."] : []),
      "Este artefato independente valida denominadores; a API de validação acrescenta modelos ajustados. Não constitui validação causal.",
    ],
  };

  const output = resolve(process.argv[2] ?? "research/local/scientific-validation-results.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Validação científica: ${artifact.analysisId}`);
  console.log(`Artefato: ${output}`);

  const failures = Object.entries(comparisons)
    .flatMap(([study, metrics]) => Object.entries(metrics).map(([metric, result]) => ({ study, metric, ...result })))
    .filter((result) => result.status === "investigate");
  if (failures.length) {
    console.error(`${failures.length} métrica(s) acima da tolerância de 3%.`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
