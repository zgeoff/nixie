import type { ToolDefinition } from '@heynixie/tools';
import { buildDeviceSetIdleTool } from './build-device-set-idle-tool';
import { buildDeviceShowTool } from './build-device-show-tool';
import { buildDevicesListTool } from './build-devices-list-tool';
import type { DeviceToolOptions } from './device-tool-options';

// The 3 tools for a device's screen: one that lists devices, one that shows content and one that
// sets the idle scene.
export function buildDeviceTools(options: DeviceToolOptions): readonly ToolDefinition[] {
  return [
    buildDevicesListTool(options),
    buildDeviceShowTool(options),
    buildDeviceSetIdleTool(options),
  ];
}
