import type { LogRecord } from '@heynixie/log';
import { toolChangedCodec } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

export function renderToolChangeNote(record: LogRecord, times: MessageTimeOptions): string {
  const note = toolChangedCodec.decode(record.payload);
  const from = note.fromHash ?? 'none';
  const to = note.toHash ?? 'none';

  return renderSystemMessage({
    type: 'mcp',
    at: formatMessageTime(record.recordedAt, null, times),
    body:
      `[#${record.sequence}] ${note.tool} changed on its server (${from} to ${to}). ` +
      'This turn lists the new form.',
  });
}
