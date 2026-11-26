import { withWriteTransaction } from '@heynixie/log';
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

async function lapseRow(deps: ProposalCoreDeps, proposalID: string): Promise<boolean> {
  const loaded = await withWriteTransaction(deps.log.writer, async (tx) => {
    const rows = await readDueProposals(tx, deps.clock.now());

    return rows.find((candidate) => candidate.id === proposalID) ?? null;
  });

  const handler = loaded === null ? undefined : deps.handlers.get(loaded.family);

  if (loaded === null || handler === undefined) {
    return false;
  }

  const facts = { row: loaded, outcome: 'lapsed', answer: null, byProposer: false } as const;

  if (handler.ownsTransaction) {
    const run = buildApplyRun(deps, facts, { tx: null, guard: () => Promise.resolve() });

    const discarded = await handler.discard(run, loaded, 'lapsed', null);

    return discarded.status === 'done';
  }

  return withWriteTransaction(deps.log.writer, async (tx) => {
    const run = buildApplyRun(deps, facts, { tx, guard: () => Promise.resolve() });

    const discarded = await handler.discard(run, loaded, 'lapsed', null);

    if (discarded.status === 'refused') {
      return false;
    }

    await run.settle(tx, discarded);

    return true;
  });
}
