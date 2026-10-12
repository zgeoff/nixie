import { faker } from '@faker-js/faker';
import type { StepActivity } from '../build-activity';

// A step group as the activity view builds it. It defaults to a finished step with no calls, no
// records, and no task or step key; a test sets the fields its case needs.
export function buildMockStepActivity(overrides: Partial<StepActivity> = {}): StepActivity {
  return {
    calls: [],
    key: faker.number.int({ max: 1_000_000, min: 1 }),
    kind: 'step',
    records: [],
    status: 'done',
    ...overrides,
  };
}
