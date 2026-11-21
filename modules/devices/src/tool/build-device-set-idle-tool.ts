import { screenContentSchema, screenMarkdownLimit } from '@heynixie/contract';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { refuseDevice } from './refuse-device';
import { resolveScreenImages } from './resolve-screen-images';
import { screenContentInput } from './screen-content-input';
import { writeIdleScene } from './write-idle-scene';

const maxBlocks = 8;

const setIdleInput = {
  type: 'object',
  properties: {
    device: { type: 'string', minLength: 1, description: 'the device ID from devices.list' },
    scene: {
      type: 'array',
      maxItems: maxBlocks,
      items: screenContentInput,
      description: `what the screen shows when no show is on: up to ${String(maxBlocks)} blocks and ${String(screenMarkdownLimit)} characters of markdown in all; an empty scene leaves the screen black`,
    },
  },
  required: ['device', 'scene'],
  additionalProperties: false,
};

const setIdleArguments = z.object({
  device: z.string(),
  scene: z.array(screenContentSchema).max(maxBlocks),
});

const setIdleOutput = {
  type: 'object',
  properties: {
    idle: { type: 'boolean' },
    refused: { type: 'string', description: 'the code of the refusal' },
    message: { type: 'string' },
  },
  additionalProperties: false,
};

export function buildDeviceSetIdleTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.setIdle',
    description:
      'Sets the scene that a device shows when no show is on, such as a day plan or a clock-free ' +
      'summary. It replaces the scene before it. The scene reaches the device at once while it ' +
      'is idle, and each later idle screen shows it. An empty scene leaves the screen black.',
    input: setIdleInput,
    output: setIdleOutput,
    declaration: {
      ...noteDeclaration,
      content: ['scene'],
      results: { idle: 'owner_data', refused: 'owner_data', message: 'owner_data' },
    },
    execution: 'direct',
    run: async (call, context) => {
      const parsed = setIdleArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      const markdownLength = input.scene.reduce(
        (total, block) => total + (block.kind === 'markdown' ? block.text.length : 0),
        0,
      );

      if (markdownLength > screenMarkdownLimit) {
        return {
          status: 'error',
          message: `a scene holds up to ${String(screenMarkdownLimit)} characters of markdown in all`,
        };
      }

      const device = await readDeviceByShortID(options.log.writer.db, input.device);

      if (device === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_DEVICE') };
      }

      const resolved = await resolveScreenImages(options.log, input.scene);

      if (resolved.states.includes('missing')) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_IMAGE') };
      }

      if (resolved.states.includes('forgotten')) {
        return { status: 'ok', ...refuseDevice('IMAGE_FORGOTTEN') };
      }

      await writeIdleScene(options, {
        deviceID: device.deviceID,
        thread: context.run.thread,
        scene: resolved.blocks,
      });

      return { status: 'ok', result: { idle: true } };
    },
  };
}
