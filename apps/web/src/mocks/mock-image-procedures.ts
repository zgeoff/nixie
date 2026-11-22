// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { mockViewStore } from './mock-view-store';
import { readMockGalleryImage } from './read-mock-gallery-image';
import { readMockGalleryPage } from './read-mock-gallery-page';
import { requireMockSession } from './require-mock-session';
import { writeMockImageForget } from './write-mock-image-forget';

export const mockImageProcedures = {
  list: mockImplementer.images.list.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockGalleryPage(options.input);
  }),

  read: mockImplementer.images.read.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const image = readMockGalleryImage(options.input.image);

    if (image === null) {
      throw options.errors.UNKNOWN_IMAGE();
    }

    return image;
  }),

  readBytes: mockImplementer.images.readBytes.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const stored = mockViewStore.images.findFirst((query) =>
      query.where((row) => row.image === options.input.image),
    );

    if (stored === undefined) {
      throw options.errors.UNKNOWN_IMAGE();
    }

    if (stored.isForgotten) {
      throw options.errors.IMAGE_FORGOTTEN();
    }

    const type = options.input.size === 'full' ? 'image/png' : 'image/webp';

    return new File([Uint8Array.fromBase64(stored.data)], `${stored.image}.png`, { type });
  }),

  forget: mockImplementer.images.forget.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const result = await writeMockImageForget(options.input);

    if (result.status !== 'forgotten') {
      throw {
        not_found: options.errors.UNKNOWN_IMAGE,
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
      }[result.status]();
    }

    return { forgottenAt: result.forgottenAt, backup: { state: 'pending' } };
  }),
};
