import { store } from './store';

interface MemoryForgetInput {
  readonly clientActionID: string;
  readonly itemID: string;
  readonly version: number;
}

interface MemoryForgetResult {
  readonly status: 'applied' | 'reused' | 'not_found' | 'stale' | 'cleanup_failed';
}

export async function writeMockMemoryForget(input: MemoryForgetInput): Promise<MemoryForgetResult> {
  const bound = JSON.stringify(['forget', input.itemID, input.version]);

  const earlier = store.memoryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.input === bound ? writeForgetCompletion(input.itemID) : { status: 'reused' };
  }

  const refusal = findRefusal(input);

  if (refusal !== null) {
    return { status: refusal };
  }

  await store.memoryActions.create({ clientActionID: input.clientActionID, input: bound });

  return writeForgetStart(input.itemID);
}

async function writeForgetCompletion(itemID: string): Promise<MemoryForgetResult> {
  await store.memoryItems.update((query) => query.where({ itemID }), {
    data(draft) {
      draft.forgottenAt ??= new Date();

      draft.state = 'forgotten';
      draft.isPinned = false;
      draft.isShredded = true;
    },
  });

  return { status: 'applied' };
}

function findRefusal(input: MemoryForgetInput): 'not_found' | 'stale' | null {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID: input.itemID }));

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    return 'not_found';
  }

  return item.versions.length === input.version ? null : 'stale';
}

async function writeForgetStart(itemID: string): Promise<MemoryForgetResult> {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID }));

  if (item?.failsForgetCleanup === true) {
    await store.memoryItems.update((query) => query.where({ itemID }), {
      data(draft) {
        draft.state = 'forgetting';
        draft.isPinned = false;
      },
    });

    return { status: 'cleanup_failed' };
  }

  return writeForgetCompletion(itemID);
}
