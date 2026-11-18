// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { imageLimits } from '@heynixie/contract';
import { mockImplementer } from './mock-implementer';
import { readMockCodeFiles } from './read-mock-code-files';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

const inlineTypes: readonly string[] = imageLimits.mediaTypes;

export const mockFileProcedures = {
  read: mockImplementer.files.read.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const stored = store.files.findFirst((query) =>
      query.where((entry) => entry.file === options.input.file),
    );

    if (stored === undefined) {
      throw options.errors.FILE_NOT_FOUND();
    }

    if (stored.isForgotten) {
      throw options.errors.FILE_FORGOTTEN();
    }

    return new File([Uint8Array.fromBase64(stored.data)], stored.name, {
      type: inlineTypes.includes(stored.mediaType) ? stored.mediaType : 'application/octet-stream',
    });
  }),

  list: mockImplementer.files.list.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockCodeFiles(options.input);
  }),
};
