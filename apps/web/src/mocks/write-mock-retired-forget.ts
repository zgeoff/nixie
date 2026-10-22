import type { MockForgetStatus } from './read-mock-forget-status';
import { readMockForgetStatus } from './read-mock-forget-status';
import { store } from './store';

interface ForgetTarget {
  readonly itemID: string;
  readonly version: number;
}

interface RetiredForgetInput {
  readonly clientActionID: string;
  readonly targets: readonly ForgetTarget[];
}

type RetiredForgetResult =
  | { readonly status: 'applied'; readonly forgets: MockForgetStatus }
  | { readonly status: 'reused' | 'not_found' | 'stale' | 'wrong_state' | 'cleanup_failed' };

export async function writeMockRetiredForget(
  input: RetiredForgetInput,
): Promise<RetiredForgetResult> {
  const bound = JSON.stringify(['forgetRetired', input.targets]);
  const itemIDs = input.targets.map((target) => target.itemID);

  const earlier = store.memoryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined && earlier.input !== bound) {
    return { status: 'reused' };
  }

  if (earlier === undefined) {
    const refusal = findRefusal(input.targets);

    if (refusal !== null) {
      return { status: refusal };
    }

    await store.memoryActions.create({ clientActionID: input.clientActionID, input: bound });

    for (const itemID of itemIDs) {
      await store.memoryItems.update((query) => query.where({ itemID }), {
        data(draft) {
          draft.state = 'forgetting';
          draft.isPinned = false;
        },
      });
    }
  }

  return writeForgetCompletions(itemIDs, earlier !== undefined);
}

function findRefusal(
  targets: readonly ForgetTarget[],
): 'not_found' | 'stale' | 'wrong_state' | null {
  for (const target of targets) {
    const item = store.memoryItems.findFirst((query) => query.where({ itemID: target.itemID }));

    if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
      return 'not_found';
    }

    if (item.versions.length !== target.version) {
      return 'stale';
    }

    if (item.state !== 'retired') {
      return 'wrong_state';
    }
  }

  return null;
}

async function writeForgetCompletions(
  itemIDs: readonly string[],
  isRetry: boolean,
): Promise<RetiredForgetResult> {
  for (const itemID of readMockForgetStatus(itemIDs).pending) {
    const item = store.memoryItems.findFirst((query) => query.where({ itemID }));

    if (item?.failsForgetCleanup === true && !isRetry) {
      return { status: 'cleanup_failed' };
    }

    await store.memoryItems.update((query) => query.where({ itemID }), {
      data(draft) {
        draft.forgottenAt ??= new Date();

        draft.state = 'forgotten';
        draft.isShredded = true;
      },
    });
  }

  return { status: 'applied', forgets: readMockForgetStatus(itemIDs) };
}
