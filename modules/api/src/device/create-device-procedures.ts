// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readDeviceImage, writeScreenSwitch } from '@heynixie/devices';
import { withWriteTransaction } from '@heynixie/log';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { requireDevice } from './require-device';
import { streamDeviceEvents } from './stream-device-events';
import { writeDeviceRegistration } from './write-device-registration';

export function createDeviceProcedures(context: APIContext) {
  return {
    register: apiImplementer.devices.register.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeDeviceRegistration(context, caller, options.input);

      if (result.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (result.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      return { deviceID: result.deviceID };
    }),

    // HTTP sends the status before the stream's first event, so the handler checks the session
    // first to refuse a revoked device with a plain 401.
    follow: apiImplementer.devices.follow.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

      return streamDeviceEvents(context, {
        device: caller.device,
        token: options.context.sessionToken,
        pixels: options.input.pixels,
        signal: options.signal,
      });
    }),

    resize: apiImplementer.devices.resize.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

      context.devices.resize(caller.device.deviceID, options.input);

      return {};
    }),

    setCapability: apiImplementer.devices.setCapability.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

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
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

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
