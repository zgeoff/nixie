import { store } from './store';

interface SensitiveMarkInput {
  readonly clientActionID: string;
  readonly itemID: string;
  readonly isSensitive: boolean;
}

export type SensitiveMarkResult = 'applied' | 'reused' | 'not_found';

export async function writeMockSensitiveMark(
  input: SensitiveMarkInput,
): Promise<SensitiveMarkResult> {
  const bound = JSON.stringify(['markSensitive', input.itemID, input.isSensitive]);

  const earlier = store.memoryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.input === bound ? 'applied' : 'reused';
  }

  const item = store.memoryItems.findFirst((query) => query.where({ itemID: input.itemID }));

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    return 'not_found';
  }

  await store.memoryItems.update((query) => query.where({ itemID: input.itemID }), {
    data(draft) {
      draft.isSensitive = input.isSensitive;
    },
  });

  await store.memoryActions.create({ clientActionID: input.clientActionID, input: bound });

  return 'applied';
}
