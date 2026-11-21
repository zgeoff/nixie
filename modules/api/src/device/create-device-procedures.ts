// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readDeviceImage, writeScreenSwitch } from '@heynixie/devices';
import { withWriteTransaction } from '@heynixie/log';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { requireDevice } from './require-device';
import { streamDeviceEvents } from './stream-device-events';

export function createDeviceProcedures(context: APIContext) {
  return {
    // HTTP sends the status before the stream's first event, so the handler checks the session
    // first to refuse a revoked device with a plain 401.
    follow: apiImplementer.devices.follow.handler(async (options) => {
      const caller = await requireDevice(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      return streamDeviceEvents(context, {
        device: caller.device,
        token: options.context.sessionToken,
        pixels: options.input.pixels,
        signal: options.signal,
      });
    }),

    setCapability: apiImplementer.devices.setCapability.handler(async (options) => {
      const caller = await requireDevice(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      await withWriteTransaction(context.log.writer, (tx) =>
        writeScreenSwitch(tx, context.log, {
          device: caller.device,
          isOn: options.input.isOn,
          nowMs: context.clock.now(),
          definitions: context.definitions(),
        }),
      );

      return { screen: options.input.isOn ? 'on' : 'off' };
    }),

    readImage: apiImplementer.devices.readImage.handler(async (options) => {
      const caller = await requireDevice(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const image = await readDeviceImage(context.log, caller.device, {
        image: options.input.image,
        nowMs: context.clock.now(),
      });

      if (image === null) {
        throw options.errors.NOT_SHOWN();
      }

      return new File([image.bytes], 'image', { type: image.mediaType });
    }),
  };
}
