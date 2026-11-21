import type { TaskDefineInput } from '../runtime-task/build-define-version';

// The input of a task.define for water-the-tomatoes, in the form of buildTestTaskYaml
export function buildTestDefineInput(overrides: Partial<TaskDefineInput> = {}): TaskDefineInput {
  return {
    name: 'Water the tomatoes',
    brief: 'Water the tomatoes.',
    trigger: {
      schedule: {
        repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'], starts: '2026-11-20' },
        zone: 'owner',
        catchUp: 'once',
      },
    },
    ...overrides,
  };
}
