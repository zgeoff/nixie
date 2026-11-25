import { isJSONWithin, pageMessageLimitBytes } from '@heynixie/contract';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { readLayout } from '../layout/read-layout';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { refuseDevice } from './refuse-device';

const sendArguments = z.object({
  device: z.string(),
  region: z.string(),
  data: z.json().refine((data) => isJSONWithin(data, pageMessageLimitBytes), 'at most 16 KiB'),
  retain: z.boolean().optional(),
});

export function buildDeviceSendToPageTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.sendToPage',
    description:
      'Sends a message into the page that a region of a device shows, so the page changes with no ' +
      'reload. The page reads it with nixie.onMessage. `data` is any JSON, at most 16 KiB. With ' +
      "`retain: true` the message is also the page's state: the server keeps the newest retained " +
      'message of each page region and the ' +
      'device hands it to nixie.onMessage each time the page loads, after a reload or a ' +
      'reconnect, until new content replaces the page. A retained message is kept even when the ' +
      'device is offline, and the call then returns OFFLINE. The screen must be on.',
    input: {
      type: 'object',
      properties: {
        device: { type: 'string', minLength: 1, description: 'the shortID from devices.list' },
        region: {
          type: 'string',
          minLength: 1,
          description: 'the name of a region that shows a page',
        },
        data: { description: 'the message: any JSON value, at most 16 KiB' },
        retain: {
          type: 'boolean',
          description: "true keeps this message as the page's state across reloads and reconnects",
        },
      },
      required: ['device', 'region', 'data'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        device: { type: 'string' },
        region: { type: 'string' },
        delivered: { type: 'boolean' },
        refused: { type: 'string', description: 'the code of the refusal' },
        message: { type: 'string' },
      },
      additionalProperties: false,
    },
    declaration: {
      ...noteDeclaration,
      content: ['data'],
      results: {
        device: 'owner_data',
        region: 'owner_data',
        delivered: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = sendArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const args = parsed.data;

      const device = await readDeviceByShortID(options.log.writer.db, args.device);

      if (device === null) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_DEVICE') };
      }

      if (!device.capabilities.screen) {
        return { status: 'ok', ...refuseDevice('SCREEN_OFF') };
      }

      const layout = await readLayout(options.log, device.deviceID, options.clock.now());

      const region = layout?.regions.find((candidate) => candidate.name === args.region);

      if (region === undefined) {
        return { status: 'ok', ...refuseDevice('UNKNOWN_REGION') };
      }

      if (region.shown?.content.kind !== 'html') {
        return { status: 'ok', ...refuseDevice('NOT_A_PAGE') };
      }

      const retain = args.retain === true;
      const message = { region: region.name, shown: region.shown.shownID, data: args.data, retain };

      if (retain) {
        options.streams.messages.retain(device.deviceID, message);
      }

      if (!options.streams.sendMessage(device.deviceID, message)) {
        return { status: 'ok', ...refuseDevice('OFFLINE') };
      }

      return {
        status: 'ok',
        result: { device: device.deviceID, region: region.name, delivered: true },
      };
    },
  };
}
