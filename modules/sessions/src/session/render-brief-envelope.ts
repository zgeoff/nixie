import type { TaskBrief, TaskMessaging } from '@heynixie/tasks';
import { mintBlockID } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { renderTaskEnvelope } from '../utils/render-task-envelope';
import { envelopeLabels } from './envelope-labels';
import { formatEnvelopeLabel } from './format-envelope-label';
import { pickEnvelopeLabel } from './pick-envelope-label';

// The envelope of a brief that sits outside the inbox batch: one that the preamble or the opening
// holds. A brief with the origin created has no message ID, so its task's ID stands in, and one
// with the origin definition is the request of the task's definition, with the brief ID as its ID.
export interface BriefEnvelopeContext {
  // the task that reads the brief
  readonly taskID: string;
  readonly times: MessageTimeOptions;
  readonly messaging: Pick<TaskMessaging, 'agentName' | 'directory' | 'ownerName' | 'unlisted'>;
}

export function renderBriefEnvelope(
  brief: TaskBrief,
  context: BriefEnvelopeContext,
  mint: () => string = mintBlockID,
): string {
  return renderTaskEnvelope(
    {
      id: pickBriefID(brief),
      from: pickBriefLabel(brief, context),
      kind: 'request',
      replyTo: null,
      sent: formatMessageTime(brief.sentAt, null, context.times),
      onBehalfOf: [],
      body: brief.body,
    },
    mint,
  );
}

function pickBriefID(brief: TaskBrief): string {
  if (brief.origin === 'message') {
    return brief.messageID;
  }

  return brief.origin === 'created' ? brief.taskID : brief.briefID;
}

function pickBriefLabel(brief: TaskBrief, context: BriefEnvelopeContext): string {
  if (brief.origin !== 'definition') {
    return pickEnvelopeLabel(context.messaging, brief.from);
  }

  const name =
    context.messaging.directory.find((profile) => profile.taskID === context.taskID)?.name ??
    context.taskID;

  return formatEnvelopeLabel(envelopeLabels.definition, context.messaging, name);
}
