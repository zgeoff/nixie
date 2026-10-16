// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { findMockMemoryItems } from './find-mock-memory-items';
import { mockImplementer } from './mock-implementer';
import { readMemoryVersion } from './read-memory-version';
import { readMockMemoryItem } from './read-mock-memory-item';
import { readMockMemoryPage } from './read-mock-memory-page';
import { readMockPinnedCore } from './read-mock-pinned-core';
import { readRatingNote } from './read-rating-note';
import { requireMockSession } from './require-mock-session';
import { store } from './store';
import { writeMockMemoryChange } from './write-mock-memory-change';

const memory = mockImplementer.memory;

// The memory procedures over the mock store: the texts and notes a step's memories read, the
// writer's status, and the memory view's reads and checked changes.
export const mockMemoryProcedures = {
  // the stored text of each named version, and a version the store lacks as missing
  readVersions: memory.readVersions.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { versions: options.input.versions.map((ref) => readMemoryVersion(ref)) };
  }),

  readRatingNotes: memory.readRatingNotes.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { notes: options.input.notes.map((ref) => readRatingNote(ref)) };
  }),

  // a writer that has caught up with every record in the store
  writerStatus: memory.writerStatus.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      backlog: 0,
      batches: 0,
      cursor: Math.max(0, ...store.records.all().map((record) => record.sequence)),
      failures: 0,
      isCatchingUp: false,
      lastError: null,
      retryAt: null,
    };
  }),

  listItems: memory.listItems.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const page = readMockMemoryPage(options.input);

    if (page === null) {
      throw options.errors.INVALID_CURSOR();
    }

    return page;
  }),

  findItems: memory.findItems.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return findMockMemoryItems(options.input.query);
  }),

  readPinnedCore: memory.readPinnedCore.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockPinnedCore();
  }),

  readItem: memory.readItem.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const item = readMockMemoryItem(options.input.itemID);

    if (item === null) {
      throw options.errors.MEMORY_ITEM_NOT_FOUND();
    }

    return item;
  }),

  retire: memory.retire.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockMemoryChange({ ...options.input, change: 'retire' });

    if (result.status !== 'applied') {
      throw buildRefusal(result.status, options.errors);
    }

    return { itemID: options.input.itemID, version: options.input.version + 1 };
  }),

  restore: memory.restore.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockMemoryChange({ ...options.input, change: 'restore' });

    if (result.status !== 'applied') {
      throw buildRefusal(result.status, options.errors);
    }

    return { itemID: options.input.itemID, version: options.input.version + 1 };
  }),

  pin: memory.pin.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockMemoryChange({ ...options.input, change: 'pin' });

    if (result.status !== 'applied') {
      throw buildRefusal(result.status, options.errors);
    }

    return { isPinned: options.input.isPinned, itemID: options.input.itemID };
  }),
};

interface RefusalErrors {
  readonly CLIENT_ACTION_ID_REUSED: () => Error;
  readonly MEMORY_ITEM_NOT_FOUND: () => Error;
  readonly STALE_VERSION: () => Error;
  readonly WRONG_STATE: () => Error;
  readonly PINNED_CORE_FULL?: () => Error;
}

type RefusalStatus = 'reused' | 'not_found' | 'stale' | 'wrong_state' | 'core_full';

// the typed error nixie's API answers each refusal with
function buildRefusal(status: RefusalStatus, errors: RefusalErrors): Error {
  const buildError = {
    reused: errors.CLIENT_ACTION_ID_REUSED,
    not_found: errors.MEMORY_ITEM_NOT_FOUND,
    stale: errors.STALE_VERSION,
    wrong_state: errors.WRONG_STATE,
    core_full: errors.PINNED_CORE_FULL ?? errors.WRONG_STATE,
  }[status];

  return buildError();
}
