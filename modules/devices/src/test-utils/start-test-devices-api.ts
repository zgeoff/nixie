import { onTestFinished } from 'bun:test';
import { sessionHooks } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { buildDeviceSessionHook } from '../api/build-device-session-hook';
import { buildDevicesFeatureProcedures } from '../api/build-devices-feature-procedures';
import { createDeviceStreams } from '../stream/create-device-streams';

type StartTestAPI = typeof startTestAPI;

// The API of a nixie whose config has the devices section: the device procedures, pages and stream
// are mounted over the shared streams, and the device row follows each session. The hooks empty when
// the test ends.
export async function startTestDevicesAPI(
  ...args: Parameters<StartTestAPI>
): Promise<
  Awaited<ReturnType<StartTestAPI>> & { readonly streams: ReturnType<typeof createDeviceStreams> }
> {
  const [settings, options] = args;
  const built: { streams: ReturnType<typeof createDeviceStreams> | null } = { streams: null };

  sessionHooks.set([buildDeviceSessionHook()]);

  onTestFinished(() => {
    sessionHooks.set([]);
  });

  const api = await startTestAPI(settings, {
    ...options,
    features: [...(options?.features ?? []), 'devices'],
    extend: (base) => {
      const streams = createDeviceStreams({ clock: base.contextClock });

      built.streams = streams;

      const added = options?.extend?.(base);

      return {
        readFeatureProcedures: () => ({
          ...added?.readFeatureProcedures?.(),
          ...buildDevicesFeatureProcedures(streams),
        }),
      };
    },
  });

  if (built.streams === null) {
    throw new Error('the test API did not build the device streams');
  }

  return Object.assign(api, { streams: built.streams });
}
