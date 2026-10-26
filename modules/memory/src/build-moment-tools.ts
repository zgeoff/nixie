import type { Clock } from '@heynixie/clock';
import type { ToolDefinition } from '@heynixie/tools';
import { buildMomentEditTool } from './build-moment-edit-tool';
import { buildMomentFindTool } from './build-moment-find-tool';
import { buildMomentKeepTool } from './build-moment-keep-tool';
import { buildMomentLinkTool } from './build-moment-link-tool';
import { buildMomentReadTool } from './build-moment-read-tool';
import { buildMomentRetireTool } from './build-moment-retire-tool';
import type { MomentStore } from './build-moment-store';
import type { ItemIDStore } from './types';

export function buildMomentTools(
  moments: MomentStore,
  items: ItemIDStore,
  clock: Pick<Clock, 'now'>,
): readonly ToolDefinition[] {
  return [
    buildMomentKeepTool(moments, clock),
    buildMomentEditTool(moments),
    buildMomentLinkTool(moments, items),
    buildMomentRetireTool(moments),
    buildMomentFindTool(moments),
    buildMomentReadTool(moments),
  ];
}
