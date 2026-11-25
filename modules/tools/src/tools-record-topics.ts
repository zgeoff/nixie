import type { LiveTopic } from '@heynixie/log';
import type { ToolsRecordKind } from './tools-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const toolsRecordTopics = {
  tool_called: [],
  tool_result: [],
} as const satisfies Record<ToolsRecordKind, readonly LiveTopic[]>;
