import type { TaskDefineInput } from '../runtime-task/build-define-version';

// The input of a task.define for water-the-tomatoes, in the form of buildTestTaskYaml
export function buildTestDefineInput(overrides: Partial<TaskDefineInput> = {}): TaskDefineInput {
  return {
    name: 'Water the tomatoes',
    brief: 'Water the tomatoes.',
    target: 'conversation',
    trigger: {
      schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
    },
    ...overrides,
  };
}
