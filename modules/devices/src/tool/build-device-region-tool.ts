import { readImageState } from '@heynixie/connectors';
import type { ImageState } from '@heynixie/connectors';
import { clockFormats, regionContentSchema, regionMarkdownLimit } from '@heynixie/contract';
import type { RegionContent } from '@heynixie/contract';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { readLayout } from '../layout/read-layout';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { pickRegionRefusal } from './pick-region-refusal';
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

const regionArguments = z.object({
  device: z.string(),
  region: z.string(),
  content: z.looseObject({ kind: z.string() }),
  minutes: z.int().min(1).max(1440).optional(),
  // oxlint-disable-next-line unicorn/no-thenable -- the design names this input `then`
  then: z.enum(['blank', 'previous']).optional(),
});

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
    run: async (call, context) => {
      const parsed = regionArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;
      const isPage = input.content.kind === 'page';
      const content = regionContentSchema.safeParse(input.content);

      if (!isPage && !content.success) {
        return { status: 'error', message: z.prettifyError(content.error) };
      }

      const device = await readDeviceByShortID(options.log.writer.db, input.device);

      // the layout is read when the call runs, so a call that waited for approval finds a region
      // that a new layout removed in the meantime
      const layout =
        device === null
          ? null
          : await readLayout(options.log, device.deviceID, options.clock.now());

      const region = layout?.regions.find((candidate) => candidate.name === input.region);
      const named = content.success ? await nameImage(options, content.data) : null;

      const refusal = pickRegionRefusal({
        device,
        isRegionKnown: region !== undefined,
        isPage,
        images: named === null ? [] : [named.state],
        isOnline: options.streams.isOnline(input.device),
      });

      if (refusal !== null || device === null || region === undefined || named === null) {
        return { status: 'ok', ...refuseDevice(refusal ?? 'UNKNOWN_REGION') };
      }

      const untilMs =
        input.minutes === undefined ? null : options.clock.now() + input.minutes * 60_000;

      const onEnd = input.then ?? 'blank';

      await writeRegion(options, {
        deviceID: device.deviceID,
        thread: context.run.thread,
        region: region.name,
        content: named.content,
        untilMs,
        onEnd,
        previous: onEnd === 'previous' ? (region.shown?.sequence ?? null) : null,
      });

      return {
        status: 'ok',
        result: {
          device: device.deviceID,
          region: region.name,
          until: untilMs === null ? null : new Date(untilMs).toISOString(),
        },
      };
    },
  };
}

interface NamedContent {
  readonly content: RegionContent;
  readonly state: ImageState;
}

// The content with its image named by its short ID, and the state of that image.
async function nameImage(
  options: DeviceToolOptions,
  content: RegionContent,
): Promise<NamedContent> {
  if (content.kind !== 'image') {
    return { content, state: 'ok' };
  }

  const found = await readImageState(options.log, content.image);

  return {
    content: { ...content, image: found.image ?? content.image },
    state: found.state,
  };
}
