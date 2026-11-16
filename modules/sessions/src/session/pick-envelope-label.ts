import type { TaskMessaging } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { envelopeLabels } from './envelope-labels';
import { formatEnvelopeLabel } from './format-envelope-label';

export function pickEnvelopeLabel(
  messaging: Pick<TaskMessaging, 'agentName' | 'directory' | 'ownerName'>,
  senderID: string,
): string {
  const sender = messaging.directory.find((profile) => profile.taskID === senderID);

  const template = match(sender?.speaker ?? 'plain_task')
    .with('conversation', () => envelopeLabels.conversation)
    .with('persona_task', () => envelopeLabels.personaTask)
    .with('plain_task', () => envelopeLabels.plainTask)
    .exhaustive();

  return formatEnvelopeLabel(template, messaging, sender?.name ?? senderID);
}
