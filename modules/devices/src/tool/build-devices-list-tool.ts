import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { readDevices } from '../device/read-devices';
import { readScreenState } from '../screen/read-screen-state';
import type { Device, ScreenState } from '../types';
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
      'and what it shows are null while the device is offline.',
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
  const state = isOnline ? await readScreenState(options.log, device, options.clock.now()) : null;

  return {
    device: device.deviceID,
    name: device.name,
    screen: device.capabilities.screen ? 'on' : 'off',
    camera: device.capabilities.camera ? 'on' : 'off',
    online: isOnline,
    pixels: pixels === null ? null : { width: pixels.width, height: pixels.height },
    showing: state === null ? null : toShowing(state),
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
