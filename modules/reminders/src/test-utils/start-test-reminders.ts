import type { Log } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { createConversationTask } from '@heynixie/tasks';
import type { TriggerCoreContext } from '@heynixie/triggers';
import { deliverTriggerBatch } from '@heynixie/triggers';
import type { TestTriggers } from '@heynixie/triggers/test-utils';
import { startTestTriggers } from '@heynixie/triggers/test-utils';
import { remindersProjections } from '../projection/reminders-projections';
import type { RemindersContext } from '../types';

interface TestFire {
  readonly triggerID: string;
  readonly hash: string;
  readonly kind: 'schedule' | 'at';
  readonly scheduledFor: string;
}

export interface TestReminders extends TestTriggers {
  readonly log: Log;
  readonly context: TasksContext;
  readonly reminders: RemindersContext;
  readonly core: TriggerCoreContext;

  // delivers one fire of a trigger, as the schedule source would
  readonly fire: (fire: TestFire) => Promise<void>;
}

// The test log of the trigger tests, with the reminders projection folded in, a conversation task,
// and the zone UTC.
export async function startTestReminders(): Promise<TestReminders> {
  const triggers = await startTestTriggers();

  const log: Log = {
    ...triggers.core.log,
    projections: [...triggers.core.log.projections, ...remindersProjections],
  };

  const context: TasksContext = { ...triggers.context, log };
  const core: TriggerCoreContext = { ...triggers.core, log };

  await createConversationTask(context);

  return {
    ...triggers,
    log,
    context,
    core,
    reminders: {
      log,
      definitions: context.definitions,
      readZone: () => Promise.resolve('UTC'),
      minGapMinutes: 15,
    },
    fire: async (fire) => {
      await deliverTriggerBatch(core, 'schedule', {
        cursor: null,
        events: [
          {
            definitionID: fire.triggerID,
            definitionHash: fire.hash,
            kind: fire.kind,
            dedupeKey: `${fire.triggerID}|${fire.scheduledFor}`,
            scheduledFor: fire.scheduledFor,
            occurredAt: fire.scheduledFor,
            missed: [],
            missedCount: 0,
            payload: null,
          },
        ],
      });
    },
  };
}
