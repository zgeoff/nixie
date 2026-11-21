import { screenContentSchema } from '@heynixie/contract';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { pickShowRefusal } from './pick-show-refusal';
import { refuseDevice } from './refuse-device';
import { resolveScreenImages } from './resolve-screen-images';
import { screenContentInput } from './screen-content-input';
import { writeShow } from './write-show';

const showInput = {
  type: 'object',
  properties: {
    device: { type: 'string', minLength: 1, description: 'the device ID from devices.list' },
    content: screenContentInput,
    minutes: {
      type: 'integer',
      minimum: 1,
      maximum: 1440,
      description:
        'how long the show lasts before the idle scene returns; the next show when absent',
    },
  },
  required: ['device', 'content'],
  additionalProperties: false,
};

const showArguments = z.object({
  device: z.string(),
  content: screenContentSchema,
  minutes: z.int().min(1).max(1440).optional(),
});

const showOutput = {
  type: 'object',
  properties: {
    shown: { type: 'boolean' },
    until: { type: ['string', 'null'] },
    refused: { type: 'string', description: 'the code of the refusal' },
    message: { type: 'string' },
  },
  additionalProperties: false,
};

export function buildDeviceShowTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.show',
    description:
      "Puts markdown or a stored image on a device's screen, in place of what it shows. The device " +
      'returns to its idle scene after `minutes`, or keeps the show until the next one when ' +
      "`minutes` is left out. An image takes `fit`: 'whole' (the default) fits it whole on black, " +
      "'fill' covers the screen and crops the overflow. The screen must be on and the device " +
      'online. Only the device itself switches its screen on.',
    input: showInput,
    output: showOutput,
    declaration: {
      ...noteDeclaration,
      content: ['content'],
      results: {
        shown: 'owner_data',
        until: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const parsed = showArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      const device = await readDeviceByShortID(options.log.writer.db, input.device);
      const resolved = await resolveScreenImages(options.log, [input.content]);

      const refusal = pickShowRefusal({
        device,
        images: resolved.states,
        isOnline: options.streams.isOnline(input.device),
      });

      const [content] = resolved.blocks;

      if (refusal !== null || device === null || content === undefined) {
        return { status: 'ok', ...refuseDevice(refusal ?? 'UNKNOWN_DEVICE') };
      }

      const untilMs =
        input.minutes === undefined ? null : options.clock.now() + input.minutes * 60_000;

      await writeShow(options, {
        deviceID: device.deviceID,
        thread: context.run.thread,
        content,
        untilMs,
      });

      return {
        status: 'ok',
        result: {
          shown: true,
          until: untilMs === null ? null : new Date(untilMs).toISOString(),
        },
      };
    },
  };
}
