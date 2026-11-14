import type { TaskBrief, TaskMessaging } from '@heynixie/tasks';
import { mintBlockID } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import { pickEnvelopeLabel } from './pick-envelope-label';
import { renderTaskEnvelope } from './render-task-envelope';
import type { MessageTimeOptions } from './types';

// The envelope of a brief that sits outside the inbox batch: one that the preamble or the opening
// holds. A brief with the origin created has no message ID, so its task's ID stands in.
export function renderBriefEnvelope(
  brief: TaskBrief,
  times: MessageTimeOptions,
  messaging: Pick<TaskMessaging, 'agentName' | 'directory' | 'ownerName'>,
  mint: () => string = mintBlockID,
): string {
  return renderTaskEnvelope(
    {
      id: brief.origin === 'message' ? brief.messageID : brief.taskID,
      from: pickEnvelopeLabel(messaging, brief.from),
      kind: 'request',
      replyTo: null,
      sent: formatMessageTime(brief.sentAt, null, times),
      onBehalfOf: [],
      body: brief.body,
    },
    mint,
  );
}
