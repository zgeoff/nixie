import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ProposeDeps } from '../answer/types';
import { proposalsProposedCodec } from '../records/proposals-proposed-codec';
import type {
  ProposalFamily,
  ProposalKind,
  ProposalRiskClass,
  ProposalTables,
} from '../rows/proposal-tables';
import { pickLapsesAt } from './pick-lapses-at';
import { withdrawInTransaction } from './withdraw-in-transaction';

export interface ProposeInput {
  // a family that mints its own ID passes it; the core draws one otherwise
  readonly proposalID?: string;

  // a family whose records name the proposal by a short ID it already holds passes it
  readonly shortID?: string;
  readonly family: ProposalFamily;
  readonly kind: ProposalKind;
  readonly cause: string;
  readonly riskClass: ProposalRiskClass;
  readonly actionHash: string;
  readonly ruleHash: string | null;
  readonly thread: string | null;
  readonly taskID: string | null;
  readonly deadlineAt: number | null;

  // Replaces the family's lapse, for a writer that holds no handler. Null lapses at the deadline
  // only.
  readonly intervalMs?: number | null;

  // the "same thing" key; null for memory, action and a proposal with no proposer
  readonly sameThing: string | null;
}

export interface Proposed {
  readonly proposalID: string;
  readonly shortID: string;
  readonly lapsesAt: number;

  // the short ID of the open proposal this one withdrew, or null
  readonly replaced: string | null;
}

// Writes proposals.proposed, which creates the row. Each open proposal of the same family, the same
// proposer and the same key is withdrawn first, in the same transaction.
export async function proposeInTransaction(
  deps: ProposeDeps,
  tx: Transaction<unknown>,
  input: ProposeInput,
): Promise<Proposed> {
  const replaced = await withdrawSameThing(deps, tx, input);

  const shortID = input.shortID === undefined ? await createUnusedShortID(tx) : input.shortID;
  const proposalID = input.proposalID ?? crypto.randomUUID();

  const handler =
    input.intervalMs === undefined
      ? deps.handlers.get(input.family)
      : { lapseIntervalMs: () => input.intervalMs ?? null };

  const lapsesAt = pickLapsesAt(deps.config, handler, {
    family: input.family,
    cause: input.cause,
    fromMs: deps.clock.now(),
    deadlineAt: input.deadlineAt,
  });

  await writeRecordsInTransaction(tx, deps.log, [
    {
      kind: proposalsProposedCodec.kind,
      definitions: deps.definitions(),
      ...(input.thread === null ? {} : { thread: input.thread }),
      payload: proposalsProposedCodec.encode({
        proposalID,
        shortID,
        family: input.family,
        kind: input.kind,
        cause: input.cause,
        riskClass: input.riskClass,
        actionHash: input.actionHash,
        ruleHash: input.ruleHash,
        thread: input.thread,
        taskID: input.taskID,
        lapsesAt,
        deadlineAt: input.deadlineAt,
        sameThing: input.sameThing,
        replaces: replaced?.proposalID ?? null,
      }),
    },
  ]);

  return { proposalID, shortID, lapsesAt, replaced: replaced?.shortID ?? null };
}

async function withdrawSameThing(
  deps: ProposeDeps,
  tx: Transaction<unknown>,
  input: ProposeInput,
): Promise<{ readonly proposalID: string; readonly shortID: string } | null> {
  if (input.sameThing === null || input.thread === null) {
    return null;
  }

  const open = await tx
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select(['proposal_id', 'short_id'])
    .where('family', '=', input.family)
    .where('thread', '=', input.thread)
    .where('same_thing', '=', input.sameThing)
    .where('state', 'in', ['pending', 'deferred'])
    .orderBy('created_sequence', 'desc')
    .execute();

  // A release before this one let several open proposals of one thing stand, so each one closes.
  const withdrawn: { readonly proposalID: string; readonly shortID: string }[] = [];

  for (const row of open) {
    const result = await withdrawInTransaction(deps, tx, row.proposal_id, { byProposer: true });

    if (result.status === 'withdrawn') {
      withdrawn.push({ proposalID: row.proposal_id, shortID: row.short_id });
    }
  }

  return withdrawn[0] ?? null;
}

// A new short ID differs from that of every proposal ever made, open or settled.
export async function createUnusedShortID(tx: Transaction<unknown>): Promise<string> {
  const shortID = createShortID();

  const clash = await tx
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select('proposal_id')
    .where('short_id', '=', shortID)
    .executeTakeFirst();

  return clash === undefined ? shortID : createUnusedShortID(tx);
}
