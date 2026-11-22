import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

const os = mockImplementer;

// a 1 by 1 pixel PNG
const pixelPNG = Uint8Array.fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

export const mockDeviceProcedures = {
  follow: os.devices.follow.handler(async function* followDevice(options) {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    yield { kind: 'idle' as const, scene: [{ kind: 'markdown' as const, text: '# Saturday' }] };

    await new Promise<void>((resolve) => {
      options.signal?.addEventListener('abort', () => {
        resolve();
      });
    });
  }),

  setCapability: os.devices.setCapability.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { screen: options.input.isOn ? ('on' as const) : ('off' as const) };
  }),

  readImage: os.devices.readImage.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return new File([pixelPNG], 'image', { type: 'image/png' });
  }),
};
