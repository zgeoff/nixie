// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

export const mockReadPayloadProcedure = mockImplementer.records.readPayload.handler((options) => {
  requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

  const record = store.records.findFirst((query) =>
    query.where(
      (stored) =>
        stored.thread === options.input.thread && stored.sequence === options.input.sequence,
    ),
  );

  if (record === undefined) {
    throw options.errors.RECORD_NOT_FOUND();
  }

  if (record.isRemoved === true) {
    return { status: 'forgotten' as const };
  }

  return {
    status: 'readable' as const,
    ...(record.toolCall === undefined
      ? {}
      : {
          toolCall: {
            ...(record.toolCall.input === undefined ? {} : { input: record.toolCall.input }),
            ...(record.toolCall.content === undefined ? {} : { content: record.toolCall.content }),
          },
        }),
    ...(record.worker === undefined ? {} : { worker: pickWorkerPayload(record.worker) }),
  };
});

function pickWorkerPayload(
  worker: NonNullable<ReturnType<typeof store.records.all>[number]['worker']>,
) {
  if (worker.phase === 'turn' && worker.text !== undefined) {
    return { text: worker.text };
  }

  if (worker.phase === 'ended' && worker.detail !== undefined) {
    return { detail: worker.detail };
  }

  return {};
}
