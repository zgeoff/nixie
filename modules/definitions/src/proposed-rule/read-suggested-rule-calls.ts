import type { Log, LogRecord, LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { actionProposedCodec } from '@heynixie/policy';
import { readProposalsByID } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { ProposedRuleCall } from './build-proposed-rule';

export interface SuggestedRuleCall extends ProposedRuleCall {
  readonly proposalID: string;
}

// The approved calls of a group, from their action proposals. A proposal that a record forget
// emptied, or that came before the group facts, is left out.
export async function readSuggestedRuleCalls(
  tx: Transaction<unknown>,
  log: Log,
  proposalIDs: readonly string[],
): Promise<readonly SuggestedRuleCall[]> {
  const rows = await readProposalsByID(tx, proposalIDs);

  if (rows.length === 0) {
    return [];
  }

  const bodies = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', actionProposedCodec.kind)
    .where(
      sql`json_extract(payload, '$.proposalID')`,
      'in',
      rows.map((row) => row.id),
    )
    .execute();

  if (bodies.length === 0) {
    return [];
  }

  const records = await readRecords(
    { ...log, writer: { ...log.writer, db: tx } },
    { afterSequence: 0, sequences: bodies.map((body) => body.sequence), limit: bodies.length },
  );

  const calls: SuggestedRuleCall[] = [];

  for (const entry of records) {
    const call = toSuggestedRuleCall(entry.record);

    if (call !== null) {
      calls.push(call);
    }
  }

  return calls;
}

const erasableSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  destinations: z.object({ value: z.string() }).array().default([]),
});

function toSuggestedRuleCall(record: LogRecord): SuggestedRuleCall | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const payload = actionProposedCodec.decode(record.payload);

  if (
    payload.groupHash === undefined ||
    payload.context === undefined ||
    payload.definitionID === undefined ||
    payload.sources === undefined ||
    payload.content === undefined
  ) {
    return null;
  }

  const erasable = erasableSchema.parse(record.erasable.fields);

  return {
    proposalID: payload.proposalID,
    tool: payload.tool,
    context: payload.context,
    definitionID: payload.definitionID,
    sources: payload.sources,
    content: payload.content,
    input: erasable.input,
    destinations: erasable.destinations.map((destination) => destination.value),
  };
}
