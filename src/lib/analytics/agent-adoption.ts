import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface AgentAdoptionCohort {
  created: number;
  used: number;
  acknowledged: number;
}

export interface AgentAdoptionOverview {
  last30Days: AgentAdoptionCohort;
  allTime: AgentAdoptionCohort;
}

interface AgentAdoptionRow {
  created: number | string;
  used: number | string;
  acknowledged: number | string;
}

function toCohort(row: AgentAdoptionRow | undefined): AgentAdoptionCohort {
  return {
    created: Number(row?.created ?? 0),
    used: Number(row?.used ?? 0),
    acknowledged: Number(row?.acknowledged ?? 0),
  };
}

export async function getAgentAdoptionCohort(
  since: Date | null,
): Promise<AgentAdoptionCohort> {
  const sinceValue = since?.toISOString() ?? null;
  const result = await db.execute(sql`
    WITH first_tokens AS (
      SELECT
        user_id,
        MIN(created_at) AS first_token_at
      FROM user_api_tokens
      GROUP BY user_id
    ),
    cohort AS (
      SELECT user_id, first_token_at
      FROM first_tokens
      WHERE (
        ${sinceValue}::timestamptz IS NULL
        OR first_token_at >= ${sinceValue}::timestamptz
      )
    )
    SELECT
      COUNT(*)::int AS created,
      COUNT(*) FILTER (
        WHERE (
          EXISTS (
            SELECT 1
            FROM user_api_tokens token
            WHERE token.user_id = cohort.user_id
              AND token.last_used_at IS NOT NULL
              AND token.last_used_at >= cohort.first_token_at
          )
          OR EXISTS (
            SELECT 1
            FROM user_agent_information_reads information_read
            WHERE information_read.user_id = cohort.user_id
              AND information_read.read_at >= cohort.first_token_at
          )
        )
      )::int AS used,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM user_agent_information_reads information_read
          WHERE information_read.user_id = cohort.user_id
            AND information_read.read_at >= cohort.first_token_at
        )
      )::int AS acknowledged
    FROM cohort
  `);

  return toCohort(result.rows[0] as AgentAdoptionRow | undefined);
}

export async function getAgentAdoptionOverview(
  now = new Date(),
): Promise<AgentAdoptionOverview> {
  const last30Days = new Date(now);
  last30Days.setUTCDate(last30Days.getUTCDate() - 30);

  const [recent, allTime] = await Promise.all([
    getAgentAdoptionCohort(last30Days),
    getAgentAdoptionCohort(null),
  ]);

  return {
    last30Days: recent,
    allTime,
  };
}
