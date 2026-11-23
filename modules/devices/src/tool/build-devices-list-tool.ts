import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { readDevices } from '../device/read-devices';
import { readLayout } from '../layout/read-layout';
import { readScreenState } from '../screen/read-screen-state';
import type { Device, LayoutView, ScreenState } from '../types';
import type { DeviceToolOptions } from './device-tool-options';
import { noteDeclaration } from './note-declaration';

const listInput = { type: 'object', properties: {}, additionalProperties: false };

const listOutput = {
  type: 'object',
  properties: { devices: { type: 'array', items: { type: 'object' } } },
  additionalProperties: false,
};

export function buildDevicesListTool(options: DeviceToolOptions): ToolDefinition {
  return {
    name: 'devices.list',
    description:
      'Lists the devices the owner enrolled, each with its ID, name, whether its screen and camera ' +
      'are on, whether it is online, its screen size in pixels and what it shows now. The size ' +
      'and what it shows are null while the device is offline. `layout` is the layout the device ' +
      'holds, online or not, apart from what it shows: its grid and, for each region, its kind, ' +
      'the time it ends and the ID of its content. A region that is blank has no kind.',
    input: listInput,
    output: listOutput,
    declaration: { ...noteDeclaration, results: { devices: 'owner_data' } },
    execution: 'direct',
    run: async () => {
      const devices = await readDevices(options.log.writer.db);
      const listed = await Promise.all(devices.map((device) => readListedDevice(options, device)));

      return { status: 'ok', result: { devices: listed } };
    },
  };
}

async function readListedDevice(options: DeviceToolOptions, device: Device): Promise<JSONObject> {
  const isOnline = options.streams.isOnline(device.deviceID);
  const pixels = options.streams.readPixels(device.deviceID);
  const nowMs = options.clock.now();
  const state = isOnline ? await readScreenState(options.log, device, nowMs) : null;

  const layout = await readLayout(options.log, device.deviceID, nowMs);

  return {
    device: device.deviceID,
    name: device.name,
    screen: device.capabilities.screen ? 'on' : 'off',
    camera: device.capabilities.camera ? 'on' : 'off',
    online: isOnline,
    pixels:
      pixels === null
        ? null
        : { width: pixels.width, height: pixels.height, pixelRatio: pixels.pixelRatio },
    showing: state === null ? null : toShowing(state),
    layout: toListedLayout(layout),
  };
}

function toShowing(state: ScreenState): JSONObject {
  if (state.kind === 'idle') {
    return { kind: 'idle' };
  }

  return state.content.kind === 'image'
    ? { kind: 'image', image: state.content.image, until: state.until }
    : { kind: 'markdown', until: state.until };
}

// The saved layout without any content: each region's kind, end and ID, never its text.
function toListedLayout(layout: LayoutView | null): JSONObject | null {
  if (layout === null) {
    return null;
  }

  return {
    layout: layout.layoutID,
    columns: [...layout.columns],
    rows: [...layout.rows],
    regions: layout.regions.map((region) => {
      const untilMs = region.shown?.untilMs ?? null;

      return {
        name: region.name,
        column: region.column,
        row: region.row,
        columnSpan: region.columnSpan,
        rowSpan: region.rowSpan,
        kind: region.shown?.content.kind ?? null,
        until: untilMs === null ? null : new Date(untilMs).toISOString(),
        shown: region.shown?.shownID ?? null,
      };
    }),
  };
}
