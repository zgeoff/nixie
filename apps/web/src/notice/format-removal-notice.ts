import type { LiveRecord } from '../conversation/use-live-records';

const kindLabels: Readonly<Record<string, string>> = {
  owner_message: 'a message of yours',
  'model.reply': 'a reply',
  task_message: 'a task message',
  tool_called: 'a tool call',
  tool_result: 'a tool result',
};

export function formatRemovalNotice(removal: NonNullable<LiveRecord['removal']>): string {
  const label = kindLabels[removal.kind] ?? 'a record';

  return `Removed ${label} (#${String(removal.sequence)}) at nixie's request`;
}
