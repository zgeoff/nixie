import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { refuseDevice } from './refuse-device';
import { savedLayoutInput } from './saved-layout-input';
import { writeLayoutSave } from './write-layout-save';

const saveArguments = z.object({
  device: z.string(),
  name: z.string().min(1).max(savedLayoutInput.nameLimit),
});

export function buildDeviceLayoutSaveTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.layout_save',
    description:
      "Saves a device's layout under a name: its grid and what every region shows now. " +
      'device.layout_restore puts it back later. A save under a name that is taken replaces ' +
      'that layout. The layouts of one device have names of their own, apart from the layouts of ' +
      'another device. The device must hold a layout.',
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
        replaced: { type: 'boolean', description: 'true when it replaced a saved layout' },
        ...savedLayoutInput.refusalProperties,
      },
      additionalProperties: false,
    },
    declaration: {
      ...noteDeclaration,
      results: {
        device: 'owner_data',
        name: 'owner_data',
        replaced: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const parsed = saveArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      const device = await readDeviceByShortID(options.log.writer.db, input.device);

      if (device === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_DEVICE') };
      }

      const outcome = await writeLayoutSave(options, {
        deviceID: device.deviceID,
        thread: context.run.thread,
        name: input.name,
      });

      if (outcome === null) {
        return { status: 'ok', ...refuseDevice('NO_LAYOUT') };
      }

      return {
        status: 'ok',
        result: { device: device.deviceID, name: input.name, replaced: outcome === 'replaced' },
      };
    },
  };
}
