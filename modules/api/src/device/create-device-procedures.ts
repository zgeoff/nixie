// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readDeviceImage, writeScreenSwitch } from '@heynixie/devices';
import { withWriteTransaction } from '@heynixie/log';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { requireDevice } from './require-device';
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

    resize: apiImplementer.devices.resize.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

      context.clients.devices.resize(caller.device.deviceID, options.input);

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
