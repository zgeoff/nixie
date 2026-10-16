import { store } from './store';

interface MemoryForgetInput {
  readonly clientActionID: string;
  readonly itemID: string;
  readonly version: number;
}

interface MemoryForgetResult {
  readonly status: 'applied' | 'reused' | 'not_found' | 'stale';
}

// Forgets an item in the mock store as nixie's API does: once per client action ID, bound to the
// version the preview showed. The item keeps its versions and their dates, reads every one as a
// gap, leaves the pinned core, and carries the forget's time.
export async function writeMockMemoryForget(input: MemoryForgetInput): Promise<MemoryForgetResult> {
  const bound = JSON.stringify(['forget', input.itemID, input.version]);

  const earlier = store.memoryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return { status: earlier.input === bound ? 'applied' : 'reused' };
  }

  const refusal = findRefusal(input);

  if (refusal !== null) {
    return { status: refusal };
  }

  await store.memoryItems.update((query) => query.where({ itemID: input.itemID }), {
    data(draft) {
      draft.state = 'forgotten';

      draft.forgottenAt = new Date();

      draft.isPinned = false;
    },
  });

  await store.memoryActions.create({ clientActionID: input.clientActionID, input: bound });

  return { status: 'applied' };
}

// an item that is gone or being forgotten, or one that moved past the version the preview showed
function findRefusal(input: MemoryForgetInput): 'not_found' | 'stale' | null {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID: input.itemID }));

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    return 'not_found';
  }

  return item.versions.length === input.version ? null : 'stale';
}
