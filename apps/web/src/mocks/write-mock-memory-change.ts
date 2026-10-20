import { readMockPinnedCore } from './read-mock-pinned-core';
import { store } from './store';

interface MemoryChangeInput {
  readonly clientActionID: string;
  readonly change: 'retire' | 'restore' | 'pin';
  readonly itemID: string;
  readonly version: number;

  // for a pin, whether the item goes into the pinned core or out of it
  readonly isPinned?: boolean;
}

type MemoryChangeResult =
  | { readonly status: 'applied' }
  | { readonly status: 'reused' | 'not_found' | 'stale' | 'wrong_state' | 'core_full' };

// Makes a change from the memory view in the mock store as nixie's API does: once per client
// action ID, bound to the version the view showed. A retire and a restore add a version with the
// same text, and a pin adds none.
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

  // only an active item joins the pinned core, whatever its subject
  if (!statesByChange[input.change].includes(item.state) || (isPin && item.state !== 'active')) {
    return 'wrong_state';
  }

  return isPin && !item.isPinned && !probeCoreRoom(item.versions.at(-1)?.text ?? '')
    ? 'core_full'
    : null;
}

// the core's size with the item's text in it, as the mock counts it
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

// a pin takes the place after every pin before it
function getNextPinnedSequence(): number {
  return Math.max(0, ...store.memoryItems.all().map((item) => item.pinnedSequence)) + 1;
}
