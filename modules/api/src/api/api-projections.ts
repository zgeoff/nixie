import type { Projection } from '@heynixie/log';
import { mcpProjections } from '@heynixie/mcp';
import { refusalsProjection } from '../refusal/refusals-projection';

export const apiProjections: readonly Projection[] = [refusalsProjection, ...mcpProjections];
