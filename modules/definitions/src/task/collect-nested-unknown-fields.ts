import { z } from 'zod';

const knownKeys: Readonly<Record<string, readonly string[]>> = {
  trigger: ['schedule', 'at'],
  'trigger.schedule': [
    'repeat',
    'hours',
    'every',
    'at',
    'on',
    'window',
    'idleMinutes',
    'zone',
    'catchUp',
  ],
  'trigger.schedule.repeat': [
    'frequency',
    'interval',
    'byDay',
    'byMonthDay',
    'byMonth',
    'at',
    'starts',
  ],
  'trigger.schedule.hours': ['from', 'until'],
  'trigger.schedule.every': ['minutes'],
  'trigger.schedule.window': ['from', 'until'],
  step: ['file', 'api'],
  limits: ['turns', 'dollars'],
};

// The start schema and the definition-only schema read these objects without rejecting an extra
// key, so this reads each one's keys.
export function collectNestedUnknownFields(mapping: Readonly<Record<string, unknown>>): string[] {
  const trigger = pickRecord(mapping['trigger']);
  const schedule = trigger === null ? null : pickRecord(trigger['schedule']);
  const repeat = schedule === null ? null : pickRecord(schedule['repeat']);
  const hours = schedule === null ? null : pickRecord(schedule['hours']);
  const every = schedule === null ? null : pickRecord(schedule['every']);
  const window = schedule === null ? null : pickRecord(schedule['window']);

  const objects: readonly (readonly [string, Record<string, unknown> | null])[] = [
    ['trigger', trigger],
    ['trigger.schedule', schedule],
    ['trigger.schedule.repeat', repeat],
    ['trigger.schedule.hours', hours],
    ['trigger.schedule.every', every],
    ['trigger.schedule.window', window],
    ['step', pickRecord(mapping['step'])],
    ['limits', pickRecord(mapping['limits'])],
  ];

  return objects.flatMap(([path, object]) => {
    const known = knownKeys[path] ?? [];

    return Object.keys(object ?? {})
      .filter((key) => !known.includes(key))
      .map((key) => `${path}.${key}`);
  });
}

const recordSchema = z.record(z.string(), z.unknown());

function pickRecord(value: unknown): Record<string, unknown> | null {
  const parsed = recordSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
