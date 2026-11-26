import type { LogTables, RecordInput } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposeDeps } from '../answer/types';
import { proposalsSettledCodec } from '../records/proposals-settled-codec';
import type { ProposalTables } from '../rows/proposal-tables';
import { readLeftThreads } from '../rows/read-left-threads';
import type { ProposalOutcome, ProposalStake } from '../types';

export interface SettlementFacts {
  readonly row: SharedProposal;
  readonly outcome: ProposalOutcome;
  readonly answeredBy: string | null;
  readonly usedBy: string | null;
  readonly reason: string | null;
  readonly detail: string | null;

  // the other proposers of a merged proposal, each with the sequence of its own merge
  readonly otherStakes: readonly ProposalStake[];

  // true when the proposer's own call withdrew the proposal
  readonly byProposer: boolean;
}

// Writes proposals.settled on each proposer's thread, in the transaction that settled the row.
// A proposal with no proposer takes a lapse on the conversation's thread, and any other outcome
// with no thread.
export async function writeSettlement(
  deps: ProposeDeps,
  tx: Transaction<unknown>,
  facts: SettlementFacts,
): Promise<void> {
  const row = facts.row;

  const leftThreads = await readLeftThreads(tx, row.id);

  const left = new Set(leftThreads);

  const proposers = pickStakes(deps, facts).filter((stake) => !left.has(stake.thread));

  const replaced = await readReplacedShortID(tx, row);
  const sentence = await readSentence(deps, tx, row);

  const targets =
    proposers.length === 0
      ? [{ thread: null, task: null }]
      : await Promise.all(
          proposers.map((stake) => deps.readSettlementTarget(tx, stake.thread, stake.sequence)),
        );

  for (const target of targets) {
    const erasable = {
      ...(facts.reason === null ? {} : { reason: facts.reason }),
      ...(sentence === null ? {} : { sentence }),
    };

    const record: RecordInput = {
      kind: proposalsSettledCodec.kind,
      definitions: deps.definitions(),
      ...(target.thread === null ? {} : { thread: target.thread }),
      payload: proposalsSettledCodec.encode({
        proposalID: row.id,
        shortID: row.shortID,
        family: row.family,
        outcome: facts.outcome,
        answeredBy: facts.answeredBy,
        usedBy: facts.usedBy,
        detail: facts.detail,
        task: target.task,
        replaced,
        byProposer: facts.byProposer,
      }),
      ...(Object.keys(erasable).length === 0 ? {} : { erasable }),
    };

    await deps.writeThreadRecord(tx, record);
  }
}

// The stakes that hear the settlement: the proposal's own thread at the record that opened it, then
// each merged proposer at its own merge. A proposal with no proposer takes a lapse on the
// conversation's thread, and any other outcome with no thread.
function pickStakes(deps: ProposeDeps, facts: SettlementFacts): readonly ProposalStake[] {
  const own = pickOwnStakes(deps, facts);

  const seen = new Set(own.map((stake) => stake.thread));

  return [
    ...own,
    ...facts.otherStakes.filter((stake) => {
      const isNew = !seen.has(stake.thread);

      seen.add(stake.thread);

      return isNew;
    }),
  ];
}

function pickOwnStakes(deps: ProposeDeps, facts: SettlementFacts): readonly ProposalStake[] {
  const row = facts.row;

  if (row.thread === null) {
    return facts.outcome === 'lapsed'
      ? [{ thread: deps.conversationThread, sequence: row.createdSequence }]
      : [];
  }

  return [{ thread: row.thread, sequence: row.createdSequence }];
}

const replacesSchema = z.object({ replaces: z.string().nullable().default(null) });

// The short ID of the proposal that this one replaced, read from the record that proposed it.
async function readReplacedShortID(
  tx: Transaction<unknown>,
  row: SharedProposal,
): Promise<string | null> {
  const proposed = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', row.createdSequence)
    .where('kind', '=', 'proposals.proposed')
    .executeTakeFirst();

  const replaces =
    proposed === undefined ? null : replacesSchema.parse(JSON.parse(proposed.payload)).replaces;

  if (replaces === null) {
    return null;
  }

  const replaced = await tx
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select('short_id')
    .where('proposal_id', '=', replaces)
    .executeTakeFirst();

  return replaced?.short_id ?? null;
}

async function readSentence(
  deps: ProposeDeps,
  tx: Transaction<unknown>,
  row: SharedProposal,
): Promise<string | null> {
  const handler = deps.handlers.get(row.family);

  // a family that owns its transaction reads its bodies through its own store
  if (handler === undefined || handler.ownsTransaction) {
    return null;
  }

  if (handler.readSentence !== undefined) {
    return handler.readSentence(tx, row);
  }

  const bodies = await handler.readBodies(tx, [row]);

  return bodies.get(row.id)?.sentence ?? null;
}
