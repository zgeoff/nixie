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

export async function writeMockForget(input: ForgetInput): Promise<ForgetResult> {
  const earlier = store.forgetActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.sequence === input.sequence && earlier.thread === input.thread
      ? { status: 'forgotten', forgottenAt: earlier.forgottenAt }
      : { status: 'reused' };
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

  const forgottenAt = await writeForgottenRecord(target, input);

  await store.forgetActions.create({ ...input, forgottenAt });

  return { status: 'forgotten', forgottenAt };
}

type ForgetTarget = NonNullable<ReturnType<typeof store.records.findFirst>>;

async function writeForgottenRecord(target: ForgetTarget, input: ForgetInput): Promise<Date> {
  const earlier = store.records.findFirst((query) =>
    query.where(
      (record) => record.kind === 'record.forgotten' && record.forget?.sequence === input.sequence,
    ),
  );

  if (earlier !== undefined) {
    return earlier.recordedAt;
  }

  await store.records.update(target, {
    data(draft) {
      delete draft.message;
    },
  });

  const forgotten = await store.records.create({
    forget: { sequence: input.sequence },
    kind: 'record.forgotten',
    thread: input.thread,
  });

  return forgotten.recordedAt;
}
