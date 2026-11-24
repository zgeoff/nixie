import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { deviceWakeChangeSchema, deviceWatchSetCodec } from '../record/device-watch-set-codec';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { refuseDevice } from './refuse-device';

const watchInput = {
  type: 'object',
  properties: {
    device: { type: 'string', minLength: 1, description: 'the device ID from devices.list' },
    wake: {
      type: 'array',
      items: { type: 'string', enum: ['online', 'offline'] },
      description:
        'the changes of the device that wake you; an empty list wakes you on none, and each call replaces the list before it',
    },
  },
  required: ['device', 'wake'],
  additionalProperties: false,
};

const watchArguments = z.object({
  device: z.string(),
  wake: z.array(deviceWakeChangeSchema).max(2),
});

const watchOutput = {
  type: 'object',
  properties: {
    wake: { type: 'array', items: { type: 'string' } },
    refused: { type: 'string', description: 'the code of the refusal' },
    message: { type: 'string' },
  },
  additionalProperties: false,
};

export function buildDeviceWatchTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'devices.watch',
    description:
      'Sets which changes of a device wake you: online, offline, both, or none. A device that ' +
      'comes online or goes offline wakes you only when its list names that change. Every device ' +
      'starts with an empty list, and devices.list shows each list. A device counts as offline ' +
      'once it has had no connection for 60 seconds.',
    input: watchInput,
    output: watchOutput,
    declaration: {
      ...noteDeclaration,
      results: { wake: 'owner_data', refused: 'owner_data', message: 'owner_data' },
    },
    execution: 'direct',
    run: async (call, context) => {
      const parsed = watchArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      const device = await readDeviceByShortID(options.log.writer.db, input.device);

      if (device === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_DEVICE') };
      }

      const wake = [...new Set(input.wake)];

      await withWriteTransaction(options.log.writer, (tx) =>
        writeRecordsInTransaction(tx, options.log, [
          {
            kind: deviceWatchSetCodec.kind,
            definitions: options.definitions(),
            thread: context.run.thread,
            payload: deviceWatchSetCodec.encode({ device: device.deviceID, wake }),
          },
        ]),
      );

      return { status: 'ok', result: { wake } };
    },
  };
}
