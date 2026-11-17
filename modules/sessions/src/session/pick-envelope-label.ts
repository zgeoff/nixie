import type { TaskMessaging } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import { envelopeLabels } from './envelope-labels';
import { formatEnvelopeLabel } from './format-envelope-label';

// A report's label holds the sender's task ID after its name.
export type EnvelopeLabelForm = 'plain' | 'report';

export function pickEnvelopeLabel(
  messaging: Pick<TaskMessaging, 'agentName' | 'directory' | 'ownerName' | 'unlisted'>,
  senderID: string,
  form: EnvelopeLabelForm = 'plain',
): string {
  const sender = [...messaging.directory, ...messaging.unlisted].find(
    (profile) => profile.taskID === senderID,
  );

  // a started task whose name was forgotten holds its task ID as its name
  const isNamed = sender !== undefined && sender.name !== '' && sender.name !== senderID;

  const template = match({ speaker: sender?.speaker ?? 'plain_task', form, isNamed })
    .with({ speaker: 'conversation' }, () => envelopeLabels.conversation)
    .with({ speaker: 'persona_task', form: 'plain' }, () => envelopeLabels.personaTask)
    .with(
      { speaker: 'persona_task', form: 'report', isNamed: true },
      () => envelopeLabels.personaTaskReport,
    )
    .with(
      { speaker: 'persona_task', form: 'report', isNamed: false },
      () => envelopeLabels.personaUnnamedTaskReport,
    )
    .with({ speaker: 'plain_task', form: 'plain' }, () => envelopeLabels.plainTask)
    .with(
      { speaker: 'plain_task', form: 'report', isNamed: true },
      () => envelopeLabels.plainTaskReport,
    )
    .with(
      { speaker: 'plain_task', form: 'report', isNamed: false },
      () => envelopeLabels.plainUnnamedTaskReport,
    )
    .exhaustive();

  return formatEnvelopeLabel(template, messaging, sender?.name ?? senderID, senderID);
}
