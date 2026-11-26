import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { readDeviceWake } from '../device/read-device-wake';
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
      'Lists the devices the owner enrolled, each with its `shortID`, name, whether its screen and camera ' +
      'are on, whether it is online, the time in milliseconds when it went offline (`offlineSinceMs`, ' +
      'present only for an offline device that had a connection since nixie started), the changes ' +
      'of it that wake you (`wake`, which devices.watch sets), its screen size in pixels and what ' +
      'it shows now. The size and what it shows are null while the device is offline. What it ' +
      'shows is a show, the ' +
      'layout while a region shows content, or the idle scene. `layout` is the layout the device ' +
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
  const wake = await readDeviceWake(options.log, device.deviceID);

  const offlineSinceMs = options.streams.readOfflineSinceMs(device.deviceID);

  return {
    shortID: device.deviceID,
    name: device.name,
    screen: device.capabilities.screen ? 'on' : 'off',
    camera: device.capabilities.camera ? 'on' : 'off',
    online: isOnline,
    ...(offlineSinceMs === null ? {} : { offlineSinceMs }),
    wake: [...wake],
    pixels:
      pixels === null
        ? null
        : { width: pixels.width, height: pixels.height, pixelRatio: pixels.pixelRatio },
    showing: state === null ? null : toShowing(state, layout),
    layout: toListedLayout(layout),
  };
}

// What the screen draws, in the order the device draws it: a show, the layout while a region shows
// content or has a background, then the idle scene.
function toShowing(state: ScreenState, layout: LayoutView | null): JSONObject {
  if (state.kind === 'idle') {
    const isLayoutVisible =
      layout?.regions.some((region) => region.shown !== null || region.background !== null) ??
      false;

    return { kind: isLayoutVisible ? 'layout' : 'idle' };
  }

  return state.content.kind === 'image'
    ? { kind: 'image', image: state.content.image, until: state.until }
    : { kind: 'markdown', until: state.until };
}

// The saved layout without any content: each region's kind, end and ID, and the packages and fetch
// URLs of a page, never its text or markup.
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
      const content = region.shown?.content;

      return {
        name: region.name,
        column: region.column,
        row: region.row,
        columnSpan: region.columnSpan,
        rowSpan: region.rowSpan,
        background: region.background,
        kind: region.shown?.content.kind ?? null,
        until: untilMs === null ? null : new Date(untilMs).toISOString(),
        shown: region.shown?.shownID ?? null,
        ...(content?.kind === 'html' && content.packages !== undefined
          ? { packages: [...content.packages] }
          : {}),
        ...(content?.kind === 'html' && content.fetches !== undefined
          ? { fetches: content.fetches.map((fetch) => fetch.url) }
          : {}),
      };
    }),
  };
}
