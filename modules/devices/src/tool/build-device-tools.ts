import type { ToolDefinition } from '@heynixie/tools';
import { buildDeviceLayoutTool } from './build-device-layout-tool';
import { buildDeviceRegionTool } from './build-device-region-tool';
import { buildDeviceSetIdleTool } from './build-device-set-idle-tool';
import { buildDeviceShowTool } from './build-device-show-tool';
import { buildDevicesListTool } from './build-devices-list-tool';
import type { DeviceToolOptions } from './device-tool-options';

// The 5 tools for a device's screen: one that lists devices, one that shows content, one that sets
// the idle scene, and two that set a layout and fill its regions.
export function buildDeviceTools(options: DeviceToolOptions): readonly ToolDefinition[] {
  return [
    buildDevicesListTool(options),
    buildDeviceShowTool(options),
    buildDeviceSetIdleTool(options),
    buildDeviceLayoutTool(options),
    buildDeviceRegionTool(options),
  ];
}
