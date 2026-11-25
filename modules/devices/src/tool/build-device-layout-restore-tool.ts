import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import type { DeviceToolOptions } from './device-tool-options';
import { formatSavedNames } from './format-saved-names';
import { noteDeclaration } from './note-declaration';
import { pickLayoutRefusal } from './pick-layout-refusal';
import { refuseDevice } from './refuse-device';
import { savedLayoutInput } from './saved-layout-input';
import { writeLayoutRestore } from './write-layout-restore';

const restoreArguments = z.object({
  device: z.string(),
  name: z.string().min(1).max(savedLayoutInput.nameLimit),
});

export function buildDeviceLayoutRestoreTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.layout_restore',
    description:
      'Puts a saved layout back on a device in one call: its grid and what every region showed ' +
      'when it was saved. It replaces the layout the device holds. A region whose content the ' +
      'owner forgot since comes back blank, and `emptied` names it. A region whose minutes ran ' +
      'out since the save is blank, as it would be on the device. device.layouts lists the ' +
      'saved names. The screen must be on and the device online.',
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
        regions: { type: 'array', items: { type: 'string' } },
        emptied: {
          type: 'array',
          items: { type: 'string' },
          description: 'the regions that came back blank because their content was forgotten',
        },
        ...savedLayoutInput.refusalProperties,
      },
      additionalProperties: false,
    },
    declaration: {
      ...noteDeclaration,
      results: {
        device: 'owner_data',
        name: 'owner_data',
        regions: 'owner_data',
        emptied: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const parsed = restoreArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      const device = await readDeviceByShortID(options.log.writer.db, input.device);

      const refusal = pickLayoutRefusal({
        device,
        parsed: null,
        isOnline: options.streams.isOnline(input.device),
      });

      if (refusal !== null || device === null) {
        return {
          status: 'ok',
          ...refuseDevice(refusal?.code ?? 'UNKNOWN_DEVICE', refusal?.detail),
        };
      }

      const outcome = await writeLayoutRestore(options, {
        deviceID: device.deviceID,
        thread: context.run.thread,
        name: input.name,
      });

      if (outcome.status === 'unknown') {
        return {
          status: 'ok',
          ...refuseDevice(
            'UNKNOWN_LAYOUT',
            `This device has no saved layout named ${input.name}. ${formatSavedNames(outcome.names)}`,
          ),
        };
      }

      return {
        status: 'ok',
        result: {
          device: device.deviceID,
          name: input.name,
          regions: [...outcome.regions],
          emptied: [...outcome.emptied],
        },
      };
    },
  };
}
