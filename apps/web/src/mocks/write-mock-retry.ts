import { store } from './store';

interface RetryInput {
  readonly clientActionID: string;
}

type RetryResult =
  | { readonly status: 'retried'; readonly retriedAt: Date }
  | { readonly status: 'nothing_to_retry' };

const stepEvents: ReadonlySet<string> = new Set([
  'task.step_started',
  'task.step_committed',
  'task.step_errored',
  'task.revived',
]);

const retriableStates: ReadonlySet<string> = new Set(['ready', 'waiting']);

export async function writeMockRetry(input: RetryInput): Promise<RetryResult> {
  const earlier = store.retryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return { status: 'retried', retriedAt: earlier.retriedAt };
  }

  const last = store.records
    .findMany((query) =>
      query.where((record) => record.thread === 'conversation' && stepEvents.has(record.kind)),
    )
    .toSorted((first, second) => first.sequence - second.sequence)
    .at(-1);

  const conversation = store.tasks.findFirst((query) => query.where({ taskID: 'conversation' }));

  if (
    last?.kind !== 'task.step_errored' ||
    (conversation !== undefined && !retriableStates.has(conversation.state))
  ) {
    return { status: 'nothing_to_retry' };
  }

  const retried = await store.records.create({
    kind: 'task.revived',
    task: { taskID: 'conversation' },
    thread: 'conversation',
  });

  await store.retryActions.create({
    clientActionID: input.clientActionID,
    retriedAt: retried.recordedAt,
  });

  return { status: 'retried', retriedAt: retried.recordedAt };
}
