import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import type { ParsedLayout } from '../layout/parse-layout';
import { parseLayout } from '../layout/parse-layout';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';
import { pickLayoutRefusal } from './pick-layout-refusal';
import { refuseDevice } from './refuse-device';
import { writeLayout } from './write-layout';

const layoutInput = {
  type: 'object',
  properties: {
    device: { type: 'string', minLength: 1, description: 'the shortID from devices.list' },
    columns: {
      type: 'array',
      items: { type: 'string' },
      description:
        "the width of each column as a whole number of fr from 1 to 12, such as ['1fr', '2fr']; 1 to 6 columns",
    },
    rows: {
      type: 'array',
      items: { type: 'string' },
      description: 'the height of each row, in the same form; 1 to 6 rows',
    },
    regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '1 to 32 characters of a-z, 0-9 and hyphens, such as pond or bin-day',
          },
          column: { type: 'integer', description: 'the first column, counted from 1' },
          row: { type: 'integer', description: 'the first row, counted from 1' },
          columnSpan: { type: 'integer', description: 'how many columns it covers; 1 by default' },
          rowSpan: { type: 'integer', description: 'how many rows it covers; 1 by default' },
        },
        required: ['name', 'column', 'row'],
        additionalProperties: false,
      },
      description: 'up to 12 named regions, none overlapping and all inside the grid',
    },
    clear: {
      type: 'boolean',
      description: 'true removes the layout, and takes no columns, rows or regions',
    },
  },
  required: ['device'],
  additionalProperties: false,
};

const regionArguments = z.object({
  name: z.string(),
  column: z.int(),
  row: z.int(),
  columnSpan: z.int().optional(),
  rowSpan: z.int().optional(),
});

const layoutArguments = z.object({
  device: z.string(),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.string()).optional(),
  regions: z.array(regionArguments).optional(),
  clear: z.boolean().optional(),
});

const layoutOutput = {
  type: 'object',
  properties: {
    device: { type: 'string' },
    regions: { type: 'array', items: { type: 'string' } },
    refused: { type: 'string', description: 'the code of the refusal' },
    message: { type: 'string' },
  },
  additionalProperties: false,
};

export function buildDeviceLayoutTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'device.layout',
    description:
      "Sets a device's layout: a grid of columns and rows with named regions, each of which " +
      'device.region fills with its own content. A new layout clears every region, so the screen ' +
      'shows its idle scene until a region has content. The layout never times out. A show ' +
      'covers the layout while it lasts, and the regions keep their own times. `clear: true` ' +
      'removes the layout. The screen must be on and the device online.',
    input: layoutInput,
    output: layoutOutput,
    declaration: {
      ...noteDeclaration,
      results: {
        device: 'owner_data',
        regions: 'owner_data',
        refused: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const parsed = layoutArguments.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      const device = await readDeviceByShortID(options.log.writer.db, input.device);

      const layout = pickLayout(input);

      const refusal = pickLayoutRefusal({
        device,
        parsed: layout,
        isOnline: options.streams.isOnline(input.device),
      });

      if (refusal !== null || device === null) {
        return {
          status: 'ok',
          ...refuseDevice(refusal?.code ?? 'UNKNOWN_DEVICE', refusal?.detail),
        };
      }

      await writeLayout(options, {
        deviceID: device.deviceID,
        thread: context.run.thread,
        layout: layout?.status === 'ok' ? layout.layout : null,
      });

      return {
        status: 'ok',
        result: {
          device: device.deviceID,
          regions:
            layout?.status === 'ok' ? layout.layout.regions.map((region) => region.name) : [],
        },
      };
    },
  };
}

type LayoutArguments = z.output<typeof layoutArguments>;

// The grid a call sets, or null for a call that clears the layout. A clear that also sets a grid is
// a bad layout.
function pickLayout(input: LayoutArguments): ParsedLayout | null {
  if (input.clear !== true) {
    return parseLayout(input);
  }

  const isGridSet =
    input.columns !== undefined || input.rows !== undefined || input.regions !== undefined;

  return isGridSet ? { status: 'bad', reason: 'a clear takes no columns, rows or regions' } : null;
}
