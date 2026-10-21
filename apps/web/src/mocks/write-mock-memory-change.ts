import { readMockPinnedCore } from './read-mock-pinned-core';
import { store } from './store';

interface MemoryChangeInput {
  readonly clientActionID: string;
  readonly change: 'retire' | 'restore' | 'pin';
  readonly itemID: string;
  readonly version: number;

  readonly isPinned?: boolean;
}

type MemoryChangeResult =
  | { readonly status: 'applied' }
  | { readonly status: 'reused' | 'not_found' | 'stale' | 'wrong_state' | 'core_full' };

export async function writeMockMemoryChange(input: MemoryChangeInput): Promise<MemoryChangeResult> {
  const bound = JSON.stringify([input.change, input.itemID, input.version, input.isPinned]);

  const earlier = store.memoryActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return { status: earlier.input === bound ? 'applied' : 'reused' };
  }

  const refusal = readRefusal(input);

  if (refusal !== null) {
    return { status: refusal };
  }

  await applyChange(input);

  await store.memoryActions.create({ clientActionID: input.clientActionID, input: bound });

  return { status: 'applied' };
}

type Refusal = Exclude<MemoryChangeResult['status'], 'applied' | 'reused'>;

const statesByChange = { retire: ['active'], restore: ['retired'], pin: ['active', 'retired'] };

function readRefusal(input: MemoryChangeInput): Refusal | null {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID: input.itemID }));

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    return 'not_found';
  }

  if (item.versions.length !== input.version) {
    return 'stale';
  }

  const isPin = input.change === 'pin' && input.isPinned === true;

  if (!statesByChange[input.change].includes(item.state) || (isPin && item.state !== 'active')) {
    return 'wrong_state';
  }

  return isPin && !item.isPinned && !probeCoreRoom(item.versions.at(-1)?.text ?? '')
    ? 'core_full'
    : null;
}

function probeCoreRoom(text: string): boolean {
  const core = readMockPinnedCore();

  return core.tokens + Math.ceil(text.length / 4) <= core.budget;
}

async function applyChange(input: MemoryChangeInput): Promise<void> {
  if (input.change === 'pin') {
    await applyPin(input);

    return;
  }

  await store.memoryItems.update((query) => query.where({ itemID: input.itemID }), {
    data(draft) {
      const current = draft.versions.at(-1);

      if (current === undefined) {
        return;
      }

      const state = input.change === 'retire' ? 'retired' : 'active';

      draft.versions.push({
        ...current,
        change: input.change === 'retire' ? 'retired' : 'restored',
        origin: 'owner',
        recordedAt: new Date(),
        state,
      });

      draft.state = state;
      draft.isPinned &&= state === 'active';
    },
  });
}

async function applyPin(input: MemoryChangeInput): Promise<void> {
  const pinnedSequence = getNextPinnedSequence();

  await store.memoryItems.update((query) => query.where({ itemID: input.itemID }), {
    data(draft) {
      draft.isPinned = input.isPinned === true;
      draft.pinnedSequence = pinnedSequence;
    },
  });
}

function getNextPinnedSequence(): number {
  return Math.max(0, ...store.memoryItems.all().map((item) => item.pinnedSequence)) + 1;
}
