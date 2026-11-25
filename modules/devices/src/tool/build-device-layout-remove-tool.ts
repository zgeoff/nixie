import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import type { DeviceToolOptions } from './device-tool-options';
import { formatSavedNames } from './format-saved-names';
import { noteDeclaration } from './note-declaration';
import { refuseDevice } from './refuse-device';
import { savedLayoutInput } from './saved-layout-input';
import { writeLayoutRemove } from './write-layout-remove';

const removeArguments = z.object({
  device: z.string(),
  name: z.string().min(1).max(savedLayoutInput.nameLimit),
});

export function buildDeviceLayoutRemoveTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.layout_remove',
    description:
      'Deletes a saved layout of a device. The layout the device holds now stays as it is. An ' +
      'unknown name is refused, and the refusal lists the saved names.',
    input: {
      type: 'object',
      properties: { device: savedLayoutInput.device, name: savedLayoutInput.name },
      required: ['device', 'name'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        device: { type: 'string' },
        name: { type: 'string' },
        ...savedLayoutInput.refusalProperties,
      },
      additionalProperties: false,
    },
    declaration: {
      ...noteDeclaration,
      results: {
        device: 'owner_data',
        name: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const parsed = removeArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      const device = await readDeviceByShortID(options.log.writer.db, input.device);

      if (device === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_DEVICE') };
      }

      const outcome = await writeLayoutRemove(options, {
        deviceID: device.deviceID,
        thread: context.run.thread,
        name: input.name,
      });

      if (!outcome.removed) {
        return {
          status: 'ok',
          ...refuseDevice(
            'UNKNOWN_LAYOUT',
            `This device has no saved layout named ${input.name}. ${formatSavedNames(outcome.names)}`,
          ),
        };
      }

      return { status: 'ok', result: { device: device.deviceID, name: input.name } };
    },
  };
}
