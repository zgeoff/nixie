import type { Trigger } from '@heynixie/contract';
import { buildReminderTriggerID } from '@heynixie/triggers';
import type { ArmedDefinition } from '@heynixie/triggers';

export function buildArmedReminder(
  reminderID: string,
  hash: string,
  trigger: Trigger,
  after?: number,
): ArmedDefinition {
  return {
    definitionID: buildReminderTriggerID(reminderID),
    definitionHash: hash,
    source: 'schedule',
    target: 'conversation',
    trigger,
    ...(after === undefined ? {} : { after }),
  };
}
