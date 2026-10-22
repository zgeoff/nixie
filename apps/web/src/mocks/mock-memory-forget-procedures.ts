// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { readMockForgetPreview } from './read-mock-forget-preview';
import { readMockForgetStatus } from './read-mock-forget-status';
import { readMockRetiredForgetPreview } from './read-mock-retired-forget-preview';
import { requireMockSession } from './require-mock-session';
import { writeMockMemoryForget } from './write-mock-memory-forget';
import { writeMockRetiredForget } from './write-mock-retired-forget';

const memory = mockImplementer.memory;

export const mockMemoryForgetProcedures = {
  previewForget: memory.previewForget.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const read = readMockForgetPreview(options.input);

    if (read.status === 'not_found') {
      throw options.errors.MEMORY_ITEM_NOT_FOUND();
    }

    if (read.status === 'stale') {
      throw options.errors.STALE_VERSION();
    }

    return read.preview;
  }),

  forget: memory.forget.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockMemoryForget(options.input);

    if (result.status === 'cleanup_failed') {
      throw new Error('the session cleanup failed');
    }

    const refusals = {
      reused: options.errors.CLIENT_ACTION_ID_REUSED,
      not_found: options.errors.MEMORY_ITEM_NOT_FOUND,
      stale: options.errors.STALE_VERSION,
    };

    if (result.status !== 'applied') {
      throw refusals[result.status]();
    }

    return { itemID: options.input.itemID };
  }),

  previewForgetRetired: memory.previewForgetRetired.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockRetiredForgetPreview();
  }),

  forgetRetired: memory.forgetRetired.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockRetiredForget(options.input);

    if (result.status === 'cleanup_failed') {
      throw new Error('the session cleanup failed');
    }

    const refusals = {
      reused: options.errors.CLIENT_ACTION_ID_REUSED,
      not_found: options.errors.MEMORY_ITEM_NOT_FOUND,
      stale: options.errors.STALE_VERSION,
      wrong_state: options.errors.WRONG_STATE,
    };

    if (result.status !== 'applied') {
      throw refusals[result.status]();
    }

    return result.forgets;
  }),

  readForgetStatus: memory.readForgetStatus.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockForgetStatus(options.input.itemIDs);
  }),
};
