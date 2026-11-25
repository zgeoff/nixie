import type { ToolDefinition } from '@heynixie/tools';
import { buildDeviceLayoutRemoveTool } from './build-device-layout-remove-tool';
import { buildDeviceLayoutRestoreTool } from './build-device-layout-restore-tool';
import { buildDeviceLayoutSaveTool } from './build-device-layout-save-tool';
import { buildDeviceLayoutTool } from './build-device-layout-tool';
import { buildDeviceLayoutsTool } from './build-device-layouts-tool';
import { buildDevicePreviewTool } from './build-device-preview-tool';
import { buildDeviceRegionTool } from './build-device-region-tool';
import { buildDeviceSendToPageTool } from './build-device-send-to-page-tool';
import { buildDeviceSetIdleTool } from './build-device-set-idle-tool';
import { buildDeviceShowTool } from './build-device-show-tool';
import { buildDeviceWatchTool } from './build-device-watch-tool';
import { buildDevicesListTool } from './build-devices-list-tool';
import type { DeviceToolOptions } from './device-tool-options';

// The 12 tools for devices: one that lists them, one that sets which of their changes wake the
// model, one that shows content, one that sets the idle scene, two that set a layout and fill its
// regions, four that save, restore, list and remove saved layouts, one that previews a screen, and one that sends a message into a page.
export function buildDeviceTools(options: DeviceToolOptions): readonly ToolDefinition[] {
  return [
    buildDevicesListTool(options),
    buildDeviceWatchTool(options),
    buildDeviceShowTool(options),
    buildDeviceSetIdleTool(options),
    buildDeviceLayoutTool(options),
    buildDeviceRegionTool(options),
    buildDeviceLayoutSaveTool(options),
    buildDeviceLayoutRestoreTool(options),
    buildDeviceLayoutsTool(options),
    buildDeviceLayoutRemoveTool(options),
    buildDevicePreviewTool(options),
    buildDeviceSendToPageTool(options),
  ];
}
