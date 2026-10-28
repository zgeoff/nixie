// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import invariant from 'tiny-invariant';
import { mockImplementer } from './mock-implementer';
import { readMockMoment } from './read-mock-moment';
import { readMockMomentDestroyPreview } from './read-mock-moment-destroy-preview';
import { readMockMomentSpan } from './read-mock-moment-span';
import { readMockMoments } from './read-mock-moments';
import { requireMockSession } from './require-mock-session';
import { writeMockMomentChange } from './write-mock-moment-change';

const memory = mockImplementer.memory;

// The mock keeps no span from the client, so it refuses every keep from there.
export const mockMomentProcedures = {
  keepMoment: memory.keepMoment.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.BAD_SPAN();
  }),

  listMoments: memory.listMoments.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockMoments(options.input);
  }),

  readMoment: memory.readMoment.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const moment = readMockMoment(options.input.momentID);

    if (moment === null) {
      throw options.errors.MOMENT_NOT_FOUND();
    }

    return moment;
  }),

  readMomentSpan: memory.readMomentSpan.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const span = readMockMomentSpan(options.input.momentID);

    if (span === null) {
      throw options.errors.MOMENT_NOT_FOUND();
    }

    return span;
  }),

  editMoment: memory.editMoment.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const input = options.input;

    const result = await writeMockMomentChange(input);

    const refusals = {
      reused: options.errors.CLIENT_ACTION_ID_REUSED,
      not_found: options.errors.MOMENT_NOT_FOUND,
      stale: options.errors.STALE_VERSION,
      bad_span: options.errors.BAD_SPAN,
      reflection_not_found: options.errors.REFLECTION_NOT_FOUND,
    };

    if (result.status !== 'applied') {
      throw pickRefusalError(refusals, result.status);
    }

    return { momentID: input.momentID, version: input.version + 1 };
  }),

  linkMoment: memory.linkMoment.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const input = options.input;

    const result = await writeMockMomentChange({
      clientActionID: input.clientActionID,
      momentID: input.momentID,
      version: input.version,
      change: { kind: 'link', itemID: input.itemID, isLinked: input.isLinked },
    });

    const refusals = {
      reused: options.errors.CLIENT_ACTION_ID_REUSED,
      not_found: options.errors.MOMENT_NOT_FOUND,
      stale: options.errors.STALE_VERSION,
      item_not_found: options.errors.MEMORY_ITEM_NOT_FOUND,
      already_linked: options.errors.ALREADY_LINKED,
      not_linked: options.errors.NOT_LINKED,
    };

    if (result.status !== 'applied') {
      throw pickRefusalError(refusals, result.status);
    }

    return { momentID: input.momentID, version: input.version + 1 };
  }),

  previewMomentDestroy: memory.previewMomentDestroy.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const read = readMockMomentDestroyPreview(options.input);

    if (read.status === 'not_found') {
      throw options.errors.MOMENT_NOT_FOUND();
    }

    if (read.status === 'stale') {
      throw options.errors.STALE_VERSION();
    }

    return read.preview;
  }),

  destroyMoment: memory.destroyMoment.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const input = options.input;

    const result = await writeMockMomentChange({ ...input, change: { kind: 'destroy' } });

    const refusals = {
      reused: options.errors.CLIENT_ACTION_ID_REUSED,
      not_found: options.errors.MOMENT_NOT_FOUND,
      stale: options.errors.STALE_VERSION,
    };

    if (result.status !== 'applied') {
      throw pickRefusalError(refusals, result.status);
    }

    return { momentID: input.momentID };
  }),
};

function pickRefusalError(refusals: Readonly<Record<string, () => Error>>, status: string): Error {
  const buildError = refusals[status];

  invariant(buildError, `the mock refused a change of another kind as ${status}`);

  return buildError();
}
