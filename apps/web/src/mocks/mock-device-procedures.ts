import { deviceStore } from './device-store';
// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

const os = mockImplementer;

// a 1 by 1 pixel PNG
const pixelPNG = Uint8Array.fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

export const mockDeviceProcedures = {
  register: os.devices.register.handler((options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    deviceStore.sessionsWithoutDevice.delete((query) =>
      query.where({ sessionID: session.sessionID }),
    );

    return { deviceID: 'dk4m7q2w9x' };
  }),

  follow: os.devices.follow.handler(async function* followDevice(options) {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    yield { kind: 'idle' as const, scene: [{ kind: 'markdown' as const, text: '# Saturday' }] };

    await new Promise<void>((resolve) => {
      options.signal?.addEventListener('abort', () => {
        resolve();
      });
    });
  }),

  resize: os.devices.resize.handler(async (options) => {
    const session = requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    if (!deviceStore.hasDevice(session.sessionID)) {
      throw options.errors.NOT_A_DEVICE();
    }

    await deviceStore.resizes.create({ width: options.input.width, height: options.input.height });

    return {};
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

    return new File([pixelPNG], 'image', { type: 'image/png' });
  }),
};
