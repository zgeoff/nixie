import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalCoreDeps } from '../answer/types';
import { buildApplyRun } from '../propose/build-apply-run';
import { readDueProposals } from './read-due-proposals';

// One sweep lapses every family's open rows that passed their lapse, through each family's
// discard. A row with no handler stays open. A family that owns its transaction lapses one row at a
// time in its own, and a row whose lapse throws stays open for the next sweep.
export async function runProposalLapses(deps: ProposalCoreDeps): Promise<number> {
  const due = await withWriteTransaction(deps.log.writer, (tx) =>
    readDueProposals(tx, deps.clock.now()),
  );

  const counted = { lapsed: 0 };

  for (const row of due) {
    const handler = deps.handlers.get(row.family);

    if (handler === undefined) {
      continue;
    }

    const lapsed = await lapseRow(deps, row.id).catch((error: unknown) => {
      if (handler.ownsTransaction) {
        return false;
      }

      throw error;
    });

    counted.lapsed += lapsed ? 1 : 0;
  }

  return counted.lapsed;
}

class NoLongerDueError extends Error {
  override readonly name = 'NoLongerDueError';
}

// The row is read again inside the transaction that closes it, so an answer or a defer that
// committed after the sweep's first read keeps the row from lapsing.
async function lapseRow(deps: ProposalCoreDeps, proposalID: string): Promise<boolean> {
  const loaded = await withWriteTransaction(deps.log.writer, (tx) =>
    readDueRow(deps, tx, proposalID),
  );

  const handler = loaded === null ? undefined : deps.handlers.get(loaded.family);

  if (loaded === null || handler === undefined) {
    return false;
  }

  const facts = { row: loaded, outcome: 'lapsed', answer: null, byProposer: false } as const;

  if (handler.ownsTransaction) {
    const guard = async (tx: Transaction<unknown>): Promise<void> => {
      if ((await readDueRow(deps, tx, proposalID)) === null) {
        throw new NoLongerDueError();
      }
    };

    const run = buildApplyRun(deps, facts, { tx: null, guard });

    try {
      const discarded = await handler.discard(run, loaded, 'lapsed', null);

      return discarded.status === 'done';
    } catch (error) {
      if (error instanceof NoLongerDueError) {
        return false;
      }

      throw error;
    }
  }

  return withWriteTransaction(deps.log.writer, async (tx) => {
    const fresh = await readDueRow(deps, tx, proposalID);

    if (fresh === null) {
      return false;
    }

    const run = buildApplyRun(
      deps,
      { ...facts, row: fresh },
      { tx, guard: () => Promise.resolve() },
    );

    const discarded = await handler.discard(run, fresh, 'lapsed', null);

    if (discarded.status === 'refused') {
      return false;
    }

    await run.settle(tx, discarded);

    return true;
  });
}

async function readDueRow(
  deps: ProposalCoreDeps,
  tx: Transaction<unknown>,
  proposalID: string,
): Promise<SharedProposal | null> {
  const rows = await readDueProposals(tx, deps.clock.now());

  return rows.find((candidate) => candidate.id === proposalID) ?? null;
}
