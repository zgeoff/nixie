import type { ToolDefinition } from '@heynixie/tools';
import { buildImageDrawTool } from './build-image-draw-tool';
import { buildImageImportTool } from './build-image-import-tool';
import { buildImageListTool } from './build-image-list-tool';
import { buildImageNameTool } from './build-image-name-tool';
import { buildImagePinTool } from './build-image-pin-tool';
import { buildImageReadTool } from './build-image-read-tool';
import type { ImageToolOptions } from './types';

// The 7 tools of the image store: one that draws and edits, and the rest that keep and find what it
// drew.
export function buildImageTools(options: ImageToolOptions): readonly ToolDefinition[] {
  return [
    buildImageDrawTool(options),
    buildImageImportTool(options),
    buildImageListTool(options),
    buildImageReadTool(options),
    buildImageNameTool(options),
    buildImagePinTool(options, true),
    buildImagePinTool(options, false),
  ];
}
