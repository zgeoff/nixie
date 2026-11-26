import type { LiveTopic } from '@heynixie/log';
import type { McpRecordKind } from './mcp-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const mcpRecordTopics = {
  'mcp.proposed': ['approvals', 'mcp'],
  'mcp.answered': ['approvals', 'mcp'],
  'mcp.lapsed': ['approvals', 'mcp'],
  'mcp.server_changed': ['mcp'],
  'mcp.tool_listed': [],
  'mcp.tool_changed': ['mcp'],
  'mcp.pin_moved': ['mcp'],
  'mcp.notice': ['mcp'],
  'mcp.health_changed': ['mcp'],
} as const satisfies Record<McpRecordKind, readonly LiveTopic[]>;
