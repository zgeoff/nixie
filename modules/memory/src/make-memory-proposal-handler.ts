import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type {
  ApplyOutcome,
  ApplyRun,
  ProposalAnswerInput,
  ProposalKindHandler,
  SharedProposal,
} from '@heynixie/proposals';
import type { MemoryProposals } from './gate-context';
import { pickProposalRefusal } from './pick-proposal-refusal';
import type { MemoryTables } from './types';

export interface MemoryAnswerPort {
  readonly proposals: Pick<MemoryProposals, 'approve' | 'reject'>;
  readonly readTexts: () => Promise<ReadonlyMap<string, string>>;
}

export interface MemoryProposalHandlerOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // null while the memory store has not started
  readonly readStore: () => MemoryAnswerPort | null;
  readonly lapseIntervalMs: number;
}

// Memory writes its own versions in transactions of its own, so the shared path hands it the
// guard to run inside them.
export function makeMemoryProposalHandler(
  options: MemoryProposalHandlerOptions,
): ProposalKindHandler {
  return {
    family: 'memory',
    lapseIntervalMs: options.lapseIntervalMs,
    ownsTransaction: true,
    readBodies: async (_db, rows) => {
      const read = await options.readStore()?.readTexts();

      const texts = read ?? new Map<string, string>();

      return new Map(
        rows.map((row) => {
          const text = texts.get(row.id);

          return [
            row.id,
            text === undefined ? null : { sentence: text, fields: {}, ruleSentence: null },
          ];
        }),
      );
    },
    readHashes: async (db, row) => {
      const proposal = await db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_proposals')
        .select(['item_id', 'target_version'])
        .where('proposal_id', '=', row.id)
        .executeTakeFirst();

      const item =
        proposal === undefined || proposal.target_version === null
          ? undefined
          : await db
              .$extendTables<MemoryTables>()
              .selectFrom('memory_items')
              .select('version')
              .where('item_id', '=', proposal.item_id)
              .executeTakeFirst();

      const isMoved =
        proposal?.target_version !== null &&
        proposal?.target_version !== undefined &&
        item !== undefined &&
        item.version > proposal.target_version;

      return { action: isMoved ? `${row.actionHash}:moved` : row.actionHash, rule: null };
    },
    approve: (run, row, answer) => applyAnswer(options, run, row, answer),
    decline: (run, row, answer) => applyAnswer(options, run, row, answer),
    lapse: async (tx, row) => {
      await writeRecordsInTransaction(tx, options.log, [
        {
          kind: 'memory.proposal_lapsed',
          definitions: options.definitions(),
          ...(row.thread === null ? {} : { thread: row.thread }),
          payload: { proposalID: row.id },
        },
      ]);
    },
  };
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
        writeInTransaction: run.guard,
      });

      return { status: 'done', result: { proposalID: row.id, state: 'declined' } };
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
      writeInTransaction: run.guard,
    });

    return approved.status === 'close_match'
      ? {
          status: 'done',
          result: { proposalID: row.id, state: 'pending', closeMatch: approved.item },
        }
      : { status: 'done', result: { proposalID: row.id, state: 'approved' } };
  } catch (error) {
    const refusal = pickProposalRefusal(error, row);

    if (refusal === null) {
      throw error;
    }

    return { status: 'refused', refusal };
  }
}
