import { faker } from '@faker-js/faker';
import type { StepActivity } from '../build-activity';

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
