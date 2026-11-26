// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import {
  readDeviceImage,
  readPageData,
  recordPageError,
  recordPageEvent,
  writeScreenSwitch,
} from '@heynixie/devices';
import { withWriteTransaction } from '@heynixie/log';
import { conversationTaskID, writeThreadRecordInTransaction } from '@heynixie/tasks';
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

    pageError: apiImplementer.devices.pageError.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

      const outcome = await recordPageError(
        { log: context.log, streams: context.clients.devices },
        caller.device.deviceID,
        options.input,
        context.clock.now(),
      );

      if (outcome === 'stale') {
        throw options.errors.STALE();
      }

      return {};
    }),

    pageEvent: apiImplementer.devices.pageEvent.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

      const outcome = await recordPageEvent(
        {
          log: context.log,
          definitions: context.definitions,
          clock: context.clock,
          streams: context.clients.devices,
          thread: conversationTaskID,
          writeEvent: (tx, input) => writeThreadRecordInTransaction(tx, context, input),
          onDrop: (reason, region) => {
            context.logger?.('devices.page_event_dropped', {
              device: caller.device.deviceID,
              region,
              reason,
            });
          },
        },
        caller.device,
        options.input,
      );

      if (outcome === 'stale') {
        throw options.errors.STALE();
      }

      return {};
    }),

    pageData: apiImplementer.devices.pageData.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

      const read = await readPageData(
        { log: context.log, streams: context.clients.devices, nowMs: context.clock.now() },
        caller.device.deviceID,
        options.input,
      );

      if (read.status === 'stale') {
        throw options.errors.STALE();
      }

      if (read.status === 'not_declared') {
        throw options.errors.NOT_DECLARED();
      }

      if (read.status === 'not_ready') {
        throw options.errors.NOT_READY();
      }

      if (read.status === 'refused') {
        throw options.errors.REFUSED();
      }

      return {
        status: read.response.status,
        type: read.response.type,
        body: read.response.body,
        fetchedAt: new Date(read.response.fetchedAtMs).toISOString(),
      };
    }),

    setCapability: apiImplementer.devices.setCapability.handler(async (options) => {
      const caller = await requireDevice(context, options.context.sessionToken, {
        buildUnauthorized: options.errors.UNAUTHORIZED,
        buildNotADevice: options.errors.NOT_A_DEVICE,
      });

      const isOn = options.input.isOn;

      if (isOn === undefined) {
        return { screen: caller.device.capabilities.screen ? 'on' : 'off' };
      }

      await withWriteTransaction(context.log.writer, (tx) =>
        writeScreenSwitch(tx, context.log, {
          device: caller.device,
          isOn,
          nowMs: context.clock.now(),
          definitions: context.definitions(),
        }),
      );

      return { screen: isOn ? 'on' : 'off' };
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
