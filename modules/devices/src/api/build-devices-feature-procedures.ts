import type { FeatureProcedures } from '@heynixie/api';
import type { DeviceStreams } from '../stream/create-device-streams';
import { answerPageRequest } from './answer-page-request';
import { createDeviceProcedures } from './create-device-procedures';
import { requireDevice } from './require-device';
import { streamLiveDevice } from './stream-live-device';

// What the devices feature adds to the API when it is on: its procedures, the routes of its pages
// and the device form of the live stream. The streams are the ones the whole server shares.
export function buildDevicesFeatureProcedures(
  streams: DeviceStreams,
): Pick<FeatureProcedures, 'devices' | 'devicePages' | 'deviceStream'> {
  return {
    devices: (context) => createDeviceProcedures(streams, context),
    devicePages: (context, request) => answerPageRequest(streams, context, request),
    deviceStream: async (context, request) => {
      const caller = await requireDevice(context, request.sessionToken, {
        buildUnauthorized: request.buildUnauthorized,
        buildNotADevice: request.buildNotADevice,
      });

      return streamLiveDevice(streams, context, {
        device: caller.device,
        token: request.sessionToken,
        isKeptActive: caller.caller.scope === 'device',
        pixels: request.pixels,
        signal: request.signal,
      });
    },
  };
}
