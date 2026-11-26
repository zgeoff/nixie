import type { Projection } from '@heynixie/log';
import { mcpServersProjection } from './mcp-servers-projection';
import { mcpToolFormsProjection } from './mcp-tool-forms-projection';
import { mcpToolsProjection } from './mcp-tools-projection';

export const mcpProjections: readonly Projection[] = [
  mcpServersProjection,
  mcpToolsProjection,
  mcpToolFormsProjection,
];
