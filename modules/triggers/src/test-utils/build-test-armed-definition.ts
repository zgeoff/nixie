import { triggerSchema } from '@heynixie/contract';
import type { ArmedDefinition } from '../types';

// The daily tomato watering at 08:00 in Sydney, over the fields that a test sets.
export function buildTestArmedDefinition(
  overrides: Partial<ArmedDefinition> = {},
): ArmedDefinition {
  return {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    source: 'schedule',
    target: 'task',
    trigger: triggerSchema.parse({
      schedule: { every: 'day', at: '08:00', zone: 'Australia/Sydney' },
    }),
    ...overrides,
  };
}
