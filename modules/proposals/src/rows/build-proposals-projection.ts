import type { Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { proposalsDeferredCodec } from '../records/proposals-deferred-codec';
import { proposalsReturnedCodec } from '../records/proposals-returned-codec';
import { proposalsWithdrawnCodec } from '../records/proposals-withdrawn-codec';
import type { ProposalChange, ProposalRecordMapper } from './proposal-change';
import type { ProposalTables } from './proposal-tables';

// The fold reads only the envelope and the payload. Each kind's mapper reads its own records, and
// this module's 3 kinds fold here. A closed row never reopens.
export function buildProposalsProjection(mappers: readonly ProposalRecordMapper[]): Projection {
  return {
    table: 'proposals',
    keyColumn: 'proposal_id',
    fold: async (tx, record) => {
      const db = tx.$extendTables<ProposalTables>();

      if (record.kind === 'proposals.deferred') {
        const deferred = proposalsDeferredCodec.decode(record.payload);

        await db
          .updateTable('proposals')
          .set({
            state: 'deferred',
            defer_generation: deferred.generation,
            defer_until: deferred.deferUntil,
            return_at: deferred.returnAt,
            lapses_at: deferred.lapsesAt,
          })
          .where('proposal_id', '=', deferred.proposalID)
          .where('state', 'in', ['pending', 'deferred'])
          .execute();

        return [deferred.proposalID];
      }

      if (record.kind === 'proposals.returned') {
        const returned = proposalsReturnedCodec.decode(record.payload);

        await db
          .updateTable('proposals')
          .set({ state: 'pending', defer_until: null, return_at: null })
          .where('proposal_id', '=', returned.proposalID)
          .where('state', '=', 'deferred')
          .where('defer_generation', '=', returned.generation)
          .execute();

        return [returned.proposalID];
      }

      if (record.kind === 'proposals.withdrawn') {
        const withdrawn = proposalsWithdrawnCodec.decode(record.payload);

        await writeChange(tx, {
          type: 'close',
          proposalID: withdrawn.proposalID,
          state: 'withdrawn',
          usedBy: null,
        });

        return [withdrawn.proposalID];
      }

      for (const mapper of mappers) {
        const change = mapper(record);

        if (change !== null) {
          await writeChange(tx, change, record);

          return [change.type === 'create' ? change.proposal.id : change.proposalID];
        }
      }

      return [];
    },
  };
}

interface RecordFacts {
  readonly sequence: number;
  readonly recordedAt: Date;
  readonly thread: string | null;
}

async function writeChange(
  tx: Transaction<unknown>,
  change: ProposalChange,
  record?: RecordFacts,
): Promise<void> {
  const db = tx.$extendTables<ProposalTables>();

  if (change.type === 'create' && record !== undefined) {
    const proposal = change.proposal;

    await db
      .insertInto('proposals')
      .values({
        proposal_id: proposal.id,
        short_id: proposal.shortID,
        family: proposal.family,
        kind: proposal.kind,
        risk_class: proposal.riskClass,
        action_hash: proposal.actionHash,
        rule_hash: proposal.ruleHash,
        cause: proposal.cause,
        task_id: proposal.taskID,
        thread: record.thread,
        created_sequence: record.sequence,
        created_at: record.recordedAt.getTime(),
        lapses_at: proposal.lapsesAt,
        deadline_at: proposal.deadlineAt,
        state: 'pending',
        used_by: null,
        defer_generation: 0,
        defer_until: null,
        return_at: null,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    return;
  }

  if (change.type === 'close') {
    await db
      .updateTable('proposals')
      .set({ state: change.state, used_by: change.usedBy, defer_until: null, return_at: null })
      .where('proposal_id', '=', change.proposalID)
      .where('state', 'in', ['pending', 'deferred'])
      .execute();

    return;
  }

  if (change.type === 'extend') {
    await db
      .updateTable('proposals')
      .set((eb) => ({ lapses_at: eb.fn('max', ['lapses_at', eb.val(change.lapsesAt)]) }))
      .where('proposal_id', '=', change.proposalID)
      .execute();
  }
}
