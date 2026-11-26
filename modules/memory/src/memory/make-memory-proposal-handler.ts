import type { Definitions, Log } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  DoneOutcome,
  ProposalAnswerInput,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { MemoryProposals } from '../gate/gate-context';
import { pickProposalRefusal } from '../proposal/pick-proposal-refusal';
import { readMergedThreads } from '../proposal/read-merged-threads';
import type { MemoryTables } from '../types';

export interface MemoryAnswerPort {
  readonly proposals: Pick<MemoryProposals, 'approve' | 'reject' | 'lapseProposal'>;
  readonly readTexts: () => Promise<ReadonlyMap<string, string>>;
}

export interface MemoryProposalHandlerOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // null while the memory store has not started
  readonly readStore: () => MemoryAnswerPort | null;
}

const dayMs = 24 * 60 * 60 * 1000;

// Memory writes its own versions in transactions of its own, so the shared path hands it the
// guard to run inside them.
export function makeMemoryProposalHandler(
  options: MemoryProposalHandlerOptions,
): ProposalKindHandler {
  return {
    family: 'memory',
    lapseIntervalMs: (config) => config.lapseDays.memory * dayMs,
    ownsTransaction: true,
    readBodies: async (_db, rows) => {
      const read = await options.readStore()?.readTexts();

      const texts = read ?? new Map<string, string>();

      return new Map(
        rows.map((row) => {
          const text = texts.get(row.id);

          return [
            row.id,
            text === undefined
              ? null
              : {
                  sentence: text,
                  fields: {},
                  ruleSentence: null,
                  approveLabel: 'Save to memory',
                },
          ];
        }),
      );
    },
    readHashes: async (db, row) => {
      const proposal = await db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_proposals')
        .select(['item_id', 'target_version', 'target_revision', 'sealed_labels'])
        .where('proposal_id', '=', row.id)
        .executeTakeFirst();

      const item =
        proposal === undefined || proposal.target_version === null
          ? undefined
          : await db
              .$extendTables<MemoryTables>()
              .selectFrom('memory_items')
              .select(['version', 'label_edits'])
              .where('item_id', '=', proposal.item_id)
              .executeTakeFirst();

      const isMoved =
        proposal !== undefined && item !== undefined && isProposalMoved(proposal, item);

      return { action: isMoved ? `${row.actionHash}:moved` : row.actionHash, rule: null };
    },
    approve: (run, row, answer) => applyAnswer(options, run, row, answer),
    discard: async (run, row, outcome, answer) => {
      if (outcome === 'declined' && answer !== null) {
        return applyAnswer(options, run, row, answer);
      }

      if (outcome === 'withdrawn') {
        invariant(run.tx, 'a withdrawal runs in the transaction of the caller that withdraws');

        const merged = await readMergedThreads(run.tx, row.id);

        return doneWith(row, 'withdrawn', merged);
      }

      const store = options.readStore();

      if (store === null) {
        return {
          status: 'refused',
          refusal: { error: 'NOT_ALLOWED', reason: 'memory_not_started' },
        };
      }

      const isLapsed = await store.proposals.lapseProposal({
        proposalID: row.id,
        writeInTransaction: async (tx) => {
          await run.guard(tx);

          await settleInTransaction(run, tx, row, { outcome: 'lapsed', usedBy: null });
        },
      });

      return isLapsed
        ? doneWith(row, 'lapsed', [])
        : { status: 'refused', refusal: { error: 'CLOSED', state: 'lapsed' } };
    },
  };
}

interface MovableProposal {
  readonly target_version: number | null;
  readonly target_revision: number | null;
  readonly sealed_labels: string | null;
}

interface MovedItem {
  readonly version: number;
  readonly label_edits: number;
}

// A proposal with a label record moves with the revision, and one without it, as built, when the
// text version moves past the version it read.
function isProposalMoved(proposal: MovableProposal, item: MovedItem): boolean {
  if (proposal.sealed_labels !== null && proposal.target_revision !== null) {
    return item.version + item.label_edits !== proposal.target_revision;
  }

  return proposal.target_version !== null && item.version > proposal.target_version;
}

async function applyAnswer(
  options: MemoryProposalHandlerOptions,
  run: ApplyRun,
  row: SharedProposal,
  answer: ProposalAnswerInput,
): Promise<ApplyOutcome> {
  const store = options.readStore();

  if (store === null) {
    return {
      status: 'refused',
      refusal: { error: 'NOT_ALLOWED', reason: 'memory_not_started' },
    };
  }

  try {
    if (answer.choice === 'decline') {
      await store.proposals.reject({
        proposalID: row.id,
        actionHash: row.actionHash,
        ...(answer.note === undefined ? {} : { reason: answer.note }),
        identityID: answer.identityID,
        writeInTransaction: async (tx) => {
          await run.guard(tx);

          await settleInTransaction(run, tx, row, { outcome: 'declined', usedBy: null });
        },
      });

      return doneWith(row, 'declined', []);
    }

    const memory = answer.memory;

    const approved = await store.proposals.approve({
      proposalID: row.id,
      actionHash: row.actionHash,
      identityID: answer.identityID,
      ...(memory?.editedText === undefined ? {} : { editedText: memory.editedText }),
      ...(memory?.revisionOf === undefined ? {} : { revisionOf: memory.revisionOf }),
      ...(memory?.ignoreCloseMatch === undefined
        ? {}
        : { ignoreCloseMatch: memory.ignoreCloseMatch }),
      writeInTransaction: (tx) => run.guard(tx),
      writeSettlement: (tx, approvalID) =>
        settleInTransaction(run, tx, row, { outcome: 'approved', usedBy: approvalID }),
    });

    return approved.status === 'close_match'
      ? {
          status: 'done',
          result: { proposalID: row.id, state: 'pending', closeMatch: approved.item },
          usedBy: null,
          detail: null,
          otherThreads: [],
        }
      : doneWith(row, 'approved', []);
  } catch (error) {
    const refusal = pickProposalRefusal(error, row);

    if (refusal === null) {
      throw error;
    }

    return { status: 'refused', refusal };
  }
}

interface Settlement {
  readonly outcome: 'approved' | 'declined' | 'lapsed';
  readonly usedBy: string | null;
}

// Settles the proposal inside memory's own transaction. An approval settles after its write, so
// the settlement names the approval it made.
async function settleInTransaction(
  run: ApplyRun,
  tx: Transaction<unknown>,
  row: SharedProposal,
  settlement: Settlement,
): Promise<void> {
  const threads = await readMergedThreads(tx, row.id);

  await run.settle(tx, {
    ...doneWith(row, settlement.outcome, threads),
    usedBy: settlement.usedBy,
  });
}

function doneWith(
  row: SharedProposal,
  outcome: 'approved' | 'declined' | 'lapsed' | 'withdrawn',
  otherThreads: readonly string[],
): DoneOutcome {
  return {
    status: 'done',
    result: { proposalID: row.id, state: outcome },
    usedBy: null,
    detail: null,
    otherThreads,
  };
}
