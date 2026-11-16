import type { Clock } from '@heynixie/clock';
import { withTrackedWork } from '@heynixie/clock';
import type { Kysely } from 'kysely';
import type { Actor } from 'xstate';
import { createActor, toPromise } from 'xstate';
import { readArmedDefinitions } from '../arm/read-armed-definitions';
import type { ReadZone, TriggerContext, TriggerEvent, TriggerSource } from '../types';
import { pickScheduleEvent } from './pick-schedule-event';
import { scheduleSourceMachine } from './schedule-source-machine';

export interface ScheduleSourceInput {
  readonly db: Kysely<unknown>;
  readonly clock: Clock;
  readonly readZone: ReadZone;

  // the time of the newest owner message, or null when there is none
  readonly readLastMessageAt: () => Promise<number | null>;
}

export const scheduleTickMs = 20_000;

// The source of `schedule` and `at` triggers. It holds nothing between ticks but its count of failed
// ticks: each tick reads the armed rows and builds each event from them.
export function buildScheduleSource(input: ScheduleSourceInput): TriggerSource {
  let actor: Actor<typeof scheduleSourceMachine> | null = null;

  return {
    id: 'schedule',
    kind: 'schedule',
    start: (context) => {
      context.reportHealth('running');

      actor = createActor(scheduleSourceMachine, {
        input: {
          runTick: () => withTrackedWork(() => runScheduleTick(input, context)),
          sleep: (signal) => input.clock.sleep(scheduleTickMs, signal),
          reportHealth: context.reportHealth,
          signal: context.signal,
        },
      });

      actor.start();

      return Promise.resolve();
    },
    stop: async () => {
      if (actor === null) {
        return;
      }

      if (actor.getSnapshot().status === 'active') {
        actor.send({ type: 'stop' });
      }

      await toPromise(actor);
    },
  };
}

async function runScheduleTick(input: ScheduleSourceInput, context: TriggerContext): Promise<void> {
  const rows = await readArmedDefinitions(input.db, 'schedule');

  const nowMs = input.clock.now();

  const lastMessageAtMs = await input.readLastMessageAt();

  const events: TriggerEvent[] = [];

  for (const row of rows) {
    const zoneName = 'at' in row.trigger ? 'owner' : row.trigger.schedule.zone;

    const zone = await input.readZone(zoneName);

    const event = pickScheduleEvent({ row, zone, nowMs, lastMessageAtMs });

    if (event !== null) {
      events.push(event);
    }
  }

  if (events.length > 0) {
    await context.deliver({ cursor: null, events });
  }
}
