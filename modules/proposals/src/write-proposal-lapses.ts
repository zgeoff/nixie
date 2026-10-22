import type { RecordCodec, RecordKind } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { canMoveProposal } from './can-move-proposal';
import { proposalLapseMs } from './proposal-lapse-ms';
import type { ProposalContext, ProposalState } from './types';

export interface ProposalLapseSource {
  readonly readProposals: (db: Kysely<unknown>) => Promise<readonly ProposalState[]>;

  readonly lapsedCodec: Pick<
    RecordCodec<RecordKind, { readonly proposalID: string }>,
    'kind' | 'encode'
  >;
}

export function writeProposalLapses(
  context: ProposalContext,
  source: ProposalLapseSource,
): Promise<number> {
  const log = context.log;

  return withWriteTransaction(log.writer, async (tx) => {
    const now = context.clock.now();

    const proposals = await source.readProposals(tx);

    const lapsed = proposals.filter(
      (entry) =>
        canMoveProposal(entry.outcome ?? 'pending', 'lapsed') &&
        entry.proposedAt + proposalLapseMs <= now,
    );

    if (lapsed.length > 0) {
      await writeRecordsInTransaction(
        tx,
        log,
        lapsed.map((entry) => ({
          kind: source.lapsedCodec.kind,
          definitions: context.definitions(),
          ...(entry.thread === null ? {} : { thread: entry.thread }),
          payload: source.lapsedCodec.encode({ proposalID: entry.proposalID }),
        })),
      );
    }

    return lapsed.length;
  });
}
