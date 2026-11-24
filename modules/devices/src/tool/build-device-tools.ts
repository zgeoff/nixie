import type { ToolDefinition } from '@heynixie/tools';
import { buildDeviceLayoutTool } from './build-device-layout-tool';
import { buildDeviceRegionTool } from './build-device-region-tool';
import { buildDeviceSetIdleTool } from './build-device-set-idle-tool';
import { buildDeviceShowTool } from './build-device-show-tool';
import { buildDeviceWatchTool } from './build-device-watch-tool';
import { buildDevicesListTool } from './build-devices-list-tool';
import type { DeviceToolOptions } from './device-tool-options';

// The 6 tools for devices: one that lists them, one that sets which of their changes wake the model,
// one that shows content, one that sets the idle scene, and two that set a layout and fill its
// regions.
export function buildDeviceTools(options: DeviceToolOptions): readonly ToolDefinition[] {
  return [
    buildDevicesListTool(options),
    buildDeviceWatchTool(options),
    buildDeviceShowTool(options),
    buildDeviceSetIdleTool(options),
    buildDeviceLayoutTool(options),
    buildDeviceRegionTool(options),
  ];
}
