import { store } from './store';

interface ForgetInput {
  readonly clientActionID: string;
  readonly sequence: number;
  readonly thread: string;
}

type ForgetResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: Date }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' };

// Forgets your message or a reply in the mock store as nixie's API does: it drops the text and adds
// the record.forgotten record that names it. A retry, or a second forget of the record, answers
// with the first time, and an ID that forgot another record is reused.
export async function writeMockForget(input: ForgetInput): Promise<ForgetResult> {
  const earlier = findEarlierForget(input);

  if (earlier !== null) {
    return earlier;
  }

  const target = store.records.findFirst((query) =>
    query.where(
      (record) =>
        record.sequence === input.sequence &&
        record.thread === input.thread &&
        (record.kind === 'owner_message' || record.kind === 'model.reply'),
    ),
  );

  if (target === undefined) {
    return { status: 'not_found' };
  }

  await store.records.update(target, {
    data(draft) {
      delete draft.message;
    },
  });

  const forgotten = await store.records.create({
    clientActionID: input.clientActionID,
    forget: { sequence: input.sequence },
    kind: 'record.forgotten',
    thread: input.thread,
  });

  return { status: 'forgotten', forgottenAt: forgotten.recordedAt };
}

// the answer of the forget that came before, by the same client action ID or for the same record
function findEarlierForget(input: ForgetInput): ForgetResult | null {
  const byAction = store.records.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID, kind: 'record.forgotten' }),
  );

  if (byAction !== undefined) {
    return byAction.forget?.sequence === input.sequence
      ? { status: 'forgotten', forgottenAt: byAction.recordedAt }
      : { status: 'reused' };
  }

  const byRecord = store.records.findFirst((query) =>
    query.where(
      (record) => record.kind === 'record.forgotten' && record.forget?.sequence === input.sequence,
    ),
  );

  return byRecord === undefined ? null : { status: 'forgotten', forgottenAt: byRecord.recordedAt };
}
