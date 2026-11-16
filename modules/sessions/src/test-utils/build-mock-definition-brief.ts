import type { TaskBrief } from '@heynixie/tasks';

export function buildMockDefinitionBrief(): TaskBrief {
  return {
    origin: 'definition',
    briefID: 'd4h9',
    sequence: 18_200,
    sentAt: new Date('2026-11-06T08:00:00Z'),
    body: 'Check the greenhouse sensors and report what is out of range.',
  };
}
