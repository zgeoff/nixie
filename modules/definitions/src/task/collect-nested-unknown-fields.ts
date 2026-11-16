import { scheduleSchema } from '@heynixie/contract';
import { z } from 'zod';

const recordSchema = z.record(z.string(), z.unknown());

const knownKeys: Readonly<Record<string, readonly string[]>> = {
  trigger: ['schedule', 'at'],
  'trigger.schedule': Object.keys(scheduleSchema.shape),
  'trigger.schedule.window': ['from', 'until'],
  step: ['file', 'api'],
  limits: ['turns', 'dollars'],
};

// The start schema and the definition-only schema read these objects without rejecting an extra
// key, so this reads each one's keys.
export function collectNestedUnknownFields(mapping: Readonly<Record<string, unknown>>): string[] {
  const trigger = recordSchema.safeParse(mapping['trigger']);
  const schedule = trigger.success ? recordSchema.safeParse(trigger.data['schedule']) : null;
  const window = schedule?.success ? recordSchema.safeParse(schedule.data['window']) : null;

  const objects: readonly (readonly [string, Record<string, unknown> | null])[] = [
    ['trigger', trigger.success ? trigger.data : null],
    ['trigger.schedule', schedule?.success ? schedule.data : null],
    ['trigger.schedule.window', window?.success ? window.data : null],
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

function pickRecord(value: unknown): Record<string, unknown> | null {
  const parsed = recordSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
