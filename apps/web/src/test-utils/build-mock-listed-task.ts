import { faker } from '@faker-js/faker';
import type { ContractOutputs } from '@heynixie/contract';
import { nixieRunnerControls } from '@heynixie/task-control';

type ListedTask = ContractOutputs['tasks']['list']['tasks'][number];

export function buildMockListedTask(overrides: Partial<ListedTask> = {}): ListedTask {
  return {
    actions: { cancelled: 0, queued: 0, started: 0 },
    brief: faker.lorem.sentence(),
    controls: [...nixieRunnerControls],
    isPauseRequested: false,
    isTakingMessages: true,
    lastActivityAt: faker.date.recent(),
    name: faker.lorem.words(2),
    state: 'waiting',
    taskID: faker.string.alphanumeric({ length: 10, casing: 'lower' }),
    ...overrides,
  };
}
