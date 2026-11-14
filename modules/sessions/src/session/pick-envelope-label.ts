import type { TaskMessaging } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { envelopeLabels } from './envelope-labels';

// Fills one pass over the template, so a task name that holds a slot such as {owner} stays text.
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

  const values: Readonly<Record<string, string>> = {
    agent: messaging.agentName ?? 'nixie',
    owner: messaging.ownerName ?? 'the owner',
    name: sender?.name ?? senderID,
  };

  return template.replaceAll(/\{(?<slot>agent|owner|name)\}/gu, (_slot, key: string) =>
    String(values[key]),
  );
}
