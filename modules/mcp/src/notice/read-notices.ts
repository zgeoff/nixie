import { readRecords } from '@heynixie/log';
import { mcpNoticeCodec } from '../record/mcp-notice-codec';
import type { McpContext } from '../types';

export interface McpNotice {
  readonly sequence: number;
  readonly recordedAtMs: number;
  readonly serverID: string;
  readonly tool: string;
  readonly change: 'tool_changed' | 'tool_removed';
  readonly fromHash: string | null;
  readonly toHash: string | null;
}

// The newest notices of changes that applied with no allow, newest first: a trusted server's
// changed tool, and a tool that a listing dropped.
export async function readNotices(context: McpContext, limit: number): Promise<McpNotice[]> {
  const records = await readRecords(context.log, {
    afterSequence: 0,
    kinds: [mcpNoticeCodec.kind],
    order: 'newest',
    limit,
  });

  return records.map((entry) => {
    const payload = mcpNoticeCodec.decode(entry.record.payload);

    return {
      sequence: entry.record.sequence,
      recordedAtMs: entry.record.recordedAt.getTime(),
      serverID: payload.serverID,
      tool: payload.tool,
      change: payload.change,
      fromHash: payload.fromHash,
      toHash: payload.toHash,
    };
  });
}
