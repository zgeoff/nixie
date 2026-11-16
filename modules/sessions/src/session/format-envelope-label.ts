import type { TaskMessaging } from '@heynixie/tasks';

// Fills one pass over the template, so a task name that holds a slot such as {owner} stays text.
export function formatEnvelopeLabel(
  template: string,
  messaging: Pick<TaskMessaging, 'agentName' | 'ownerName'>,
  name: string,
): string {
  const values: Readonly<Record<string, string>> = {
    agent: messaging.agentName ?? 'nixie',
    owner: messaging.ownerName ?? 'the owner',
    name,
  };

  return template.replaceAll(/\{(?<slot>agent|owner|name)\}/gu, (_slot, key: string) =>
    String(values[key]),
  );
}
