import type { TaskBrief } from '@heynixie/tasks';

export function buildMockCreatedBrief(): TaskBrief {
  return {
    origin: 'created',
    taskID: 't4m2',
    from: 'conversation',
    sequence: 400,
    sentAt: new Date('2026-11-05T17:39:00Z'),
    body: 'Find 3 quiet cafes near the station.',
  };
}
