import { clickhouse } from "$lib/server/clickhouse";
import { competitionTable } from "$lib/server/competition-db";
import type { Processor } from "$lib/services/competition/competition";

type ProcessorRow = {
  id: number;
  name: string;
};

/** Aggregator platforms (Wolt, Foody, ...) — feeds every filter dropdown. */
export async function listProcessors(): Promise<Processor[]> {
  const result = await clickhouse.query({
    query: `
      SELECT id, name
      FROM ${competitionTable("processors")} FINAL
      ORDER BY name ASC
    `,
    format: "JSONEachRow",
  });

  const rows = await result.json<ProcessorRow>();

  return rows.map((row) => ({ id: row.id, name: row.name }));
}
