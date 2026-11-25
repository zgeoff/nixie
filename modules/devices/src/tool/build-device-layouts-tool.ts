import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { readSavedLayouts } from '../layout/read-saved-layouts';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { refuseDevice } from './refuse-device';
import { savedLayoutInput } from './saved-layout-input';

const layoutsArguments = z.object({ device: z.string() });

export function buildDeviceLayoutsTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.layouts',
    description:
      'Lists the layouts saved for a device, by name, each with the time it was saved. ' +
      'device.layout_restore puts one back.',
    input: {
      type: 'object',
      properties: { device: savedLayoutInput.device },
      required: ['device'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        device: { type: 'string' },
        layouts: { type: 'array', items: { type: 'object' } },
        ...savedLayoutInput.refusalProperties,
      },
      additionalProperties: false,
    },
    declaration: {
      ...noteDeclaration,
      results: {
        device: 'owner_data',
        layouts: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = layoutsArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const device = await readDeviceByShortID(options.log.writer.db, parsed.data.device);

      if (device === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_DEVICE') };
      }

      const saved = await readSavedLayouts(options.log.writer.db, device.deviceID);

      return {
        status: 'ok',
        result: {
          device: device.deviceID,
          layouts: saved.map((layout) => ({
            name: layout.name,
            savedAt: new Date(layout.savedAtMs).toISOString(),
          })),
        },
      };
    },
  };
}
