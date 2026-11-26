import { deviceStore } from './device-store';
// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

const os = mockImplementer;

// a 1 by 1 pixel PNG
const pixelPNG = Uint8Array.fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

// the images that no device shows, which readImage refuses: this one and each ID that starts with it
export const missingImage = 'missing-image';

// an image that downloads but holds no picture, so a browser cannot decode it
export const brokenImage = 'broken-image';

export const mockDeviceProcedures = {
  register: os.devices.register.handler((options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    deviceStore.sessionsWithoutDevice.delete((query) =>
      query.where({ sessionID: session.sessionID }),
    );

    return { deviceID: 'dk4m7q2w9x' };
  }),

  resize: os.devices.resize.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    await deviceStore.resizes.create({
      width: options.input.width,
      height: options.input.height,
      pixelRatio: options.input.pixelRatio,
      timeZone: options.input.timeZone ?? null,
    });

    return {};
  }),

  pageError: os.devices.pageError.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    await deviceStore.pageErrors.create(options.input);

    return {};
  }),

  pageEvent: os.devices.pageEvent.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    await deviceStore.pageEvents.create({
      region: options.input.region,
      shown: options.input.shown,
      name: options.input.name,
      data: options.input.data ?? null,
      wake: options.input.wake,
    });

    return {};
  }),

  pageData: os.devices.pageData.handler((options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    throw options.errors.NOT_DECLARED();
  }),

  setCapability: os.devices.setCapability.handler((options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    return { screen: options.input.isOn ? ('on' as const) : ('off' as const) };
  }),

  readImage: os.devices.readImage.handler((options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    if (options.input.image.startsWith(missingImage)) {
      throw options.errors.NOT_SHOWN();
    }

    if (options.input.image === brokenImage) {
      return new File([new Uint8Array([1, 2, 3])], 'image', { type: 'image/png' });
    }

    return new File([pixelPNG], 'image', { type: 'image/png' });
  }),
};
