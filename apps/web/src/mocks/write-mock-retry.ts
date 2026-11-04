import { store } from './store';

type RetryResult =
  | { readonly status: 'retried'; readonly retriedAt: Date }
  | { readonly status: 'nothing_to_retry' };

const stepEnds: ReadonlySet<string> = new Set([
  'task.step_committed',
  'task.step_errored',
  'task.revived',
]);

export async function writeMockRetry(): Promise<RetryResult> {
  const last = store.records
    .findMany((query) =>
      query.where((record) => record.thread === 'conversation' && stepEnds.has(record.kind)),
    )
    .toSorted((first, second) => first.sequence - second.sequence)
    .at(-1);

  if (last?.kind !== 'task.step_errored') {
    return { status: 'nothing_to_retry' };
  }

  const retried = await store.records.create({
    kind: 'task.revived',
    task: { taskID: 'conversation' },
    thread: 'conversation',
  });

  return { status: 'retried', retriedAt: retried.recordedAt };
}
