import { clockFormats, regionMarkdownLimit } from '@heynixie/contract';
import type { ToolDefinition } from '@heynixie/tools';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { readRegionCall } from './read-region-call';
import { refuseDevice } from './refuse-device';
import { writeRegion } from './write-region';

const regionInput = {
  type: 'object',
  properties: {
    device: { type: 'string', minLength: 1, description: 'the device ID from devices.list' },
    region: { type: 'string', minLength: 1, description: 'the name of a region of its layout' },
    content: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['markdown', 'image', 'live', 'page'],
          description: "'page' is refused: a region cannot hold a page yet",
        },
        markdown: {
          type: 'string',
          minLength: 1,
          maxLength: regionMarkdownLimit,
          description: 'for markdown: the text, rendered like a reply, with no raw HTML',
        },
        image: { type: 'string', minLength: 1, description: 'for an image: the image ID' },
        fit: {
          type: 'string',
          enum: ['whole', 'fill'],
          description:
            "for an image: 'whole' (the default) fits it whole on black, 'fill' covers the region and crops the overflow",
        },
        live: {
          type: 'string',
          enum: ['clock', 'countdown'],
          description:
            'for a live value, which the device keeps fresh with no further call: the time, or the time left until `to`',
        },
        format: {
          type: 'string',
          enum: [...clockFormats],
          description: 'for a clock: HH:mm, HH:mm:ss, or the date as EEE d MMM',
        },
        to: {
          type: 'string',
          description: 'for a countdown: the ISO 8601 time it counts down to, with its offset',
        },
        label: { type: 'string', description: 'for a countdown: a short label, such as Holiday' },
        html: { type: 'string', description: 'for a page, which is refused' },
      },
      required: ['kind'],
      additionalProperties: true,
    },
    minutes: {
      type: 'integer',
      minimum: 1,
      maximum: 1440,
      description:
        'how long the content lasts; it lasts until the next device.region for this region when absent',
    },
    // oxlint-disable-next-line unicorn/no-thenable -- the design names this input `then`
    then: {
      type: 'string',
      enum: ['blank', 'previous'],
      description:
        "what shows when the minutes pass: 'blank' (the default), or 'previous', the content this call replaced when its own minutes have not passed",
    },
  },
  required: ['device', 'region', 'content'],
  additionalProperties: false,
};

const regionOutput = {
  type: 'object',
  properties: {
    device: { type: 'string' },
    region: { type: 'string' },
    until: { type: ['string', 'null'] },
    refused: { type: 'string', description: 'the code of the refusal' },
    message: { type: 'string' },
  },
  additionalProperties: false,
};

export function buildDeviceRegionTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.region',
    description:
      "Puts content in one region of a device's layout, in place of what the region shows, and " +
      'leaves the other regions as they are. The content is markdown, a stored image, or a live ' +
      'value that the device keeps fresh by itself: a clock, or a countdown to a time. After ' +
      '`minutes` the region goes blank, or with then: previous shows again the content this call ' +
      'replaced, when its own minutes have not passed. Without `minutes` the region keeps the ' +
      'content until the next call for it. The screen must be on and the device online.',
    input: regionInput,
    output: regionOutput,
    declaration: {
      ...noteDeclaration,
      content: ['content'],
      results: {
        device: 'owner_data',
        region: 'owner_data',
        until: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    prepare: async (input) => {
      const found = await readRegionCall(options, input);

      if (found.status === 'refused') {
        return refuseDevice(found.refusal);
      }

      // a layout set after the call was queued is refused when the call runs, by its sequence
      return {
        destinations:
          found.status === 'ready' ? [`${found.device.deviceID}/${found.region.name}`] : [],
      };
    },
    run: async (call, context) => {
      const found = await readRegionCall(options, call.input);

      if (found.status === 'invalid') {
        return { status: 'error', message: found.message };
      }

      if (found.status === 'refused') {
        return { status: 'ok', ...refuseDevice(found.refusal) };
      }

      const untilMs =
        found.arguments.minutes === undefined
          ? null
          : options.clock.now() + found.arguments.minutes * 60_000;

      const written = await writeRegion(options, {
        deviceID: found.device.deviceID,
        thread: context.run.thread,
        callSequence: context.callSequence,
        region: found.region.name,
        content: found.content,
        untilMs,
        onEnd: found.arguments.then ?? 'blank',
      });

      if (written === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_REGION') };
      }

      return {
        status: 'ok',
        result: {
          device: found.device.deviceID,
          region: found.region.name,
          until: untilMs === null ? null : new Date(untilMs).toISOString(),
        },
      };
    },
  };
}
