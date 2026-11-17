import type { TaskMessaging } from '@heynixie/tasks';

// Fills one pass over the template, so a task name that holds a slot such as {owner} stays text.
// The id fills the {id} slot of a template that holds one.
export function formatEnvelopeLabel(
  template: string,
  messaging: Pick<TaskMessaging, 'agentName' | 'ownerName'>,
  name: string,
  id = '',
): string {
  const values: Readonly<Record<string, string>> = {
    agent: messaging.agentName ?? 'nixie',
    owner: messaging.ownerName ?? 'the owner',
    name,
    id,
  };

  return template.replaceAll(/\{(?<slot>agent|owner|name|id)\}/gu, (_slot, key: string) =>
    String(values[key]),
  );
}
