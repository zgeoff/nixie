import type { JSONValue, LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { actionAnsweredCodec } from './action-answered-codec';
import { actionLapsedCodec } from './action-lapsed-codec';
import { actionProposedCodec } from './action-proposed-codec';

type ActionProposalOutcome = 'approved' | 'declined' | 'lapsed';

export interface ActionProposalState {
  readonly sequence: number;
  readonly proposalID: string;
  readonly shortID: string;
  readonly thread: string | null;
  readonly callSequence: number;
  readonly tool: string;
  readonly effects: readonly string[];
  readonly cause: ReturnType<typeof actionProposedCodec.decode>['cause'];
  readonly proposedAt: number;
  readonly outcome: ActionProposalOutcome | null;
}

export async function readActionProposals(
  db: Kysely<unknown>,
): Promise<readonly ActionProposalState[]> {
  const records = db.$extendTables<LogTables>();

  const proposed = await records
    .selectFrom('records')
    .select(['sequence', 'thread', 'recorded_at', 'payload'])
    .where('kind', '=', actionProposedCodec.kind)
    .orderBy('sequence')
    .execute();

  if (proposed.length === 0) {
    return [];
  }

  const closing = await records
    .selectFrom('records')
    .select(['kind', 'payload'])
    .where('kind', 'in', [actionAnsweredCodec.kind, actionLapsedCodec.kind])
    .execute();

  const outcomes = new Map(closing.map((row) => readOutcome(row.kind, row.payload)));

  return proposed.map((row) => {
    const payload = actionProposedCodec.decode(parsePayload(row.payload));

    return {
      sequence: row.sequence,
      proposalID: payload.proposalID,
      shortID: payload.shortID,
      thread: row.thread,
      callSequence: payload.callSequence,
      tool: payload.tool,
      effects: payload.effects,
      cause: payload.cause,
      proposedAt: row.recorded_at,
      outcome: outcomes.get(payload.proposalID) ?? null,
    };
  });
}

function readOutcome(kind: string, payload: string): readonly [string, ActionProposalOutcome] {
  if (kind === actionLapsedCodec.kind) {
    return [actionLapsedCodec.decode(parsePayload(payload)).proposalID, 'lapsed'];
  }

  const answered = actionAnsweredCodec.decode(parsePayload(payload));

  return [answered.proposalID, answered.answer];
}

function parsePayload(payload: string): Readonly<Record<string, JSONValue>> {
  return z.record(z.string(), z.json()).parse(JSON.parse(payload));
}
