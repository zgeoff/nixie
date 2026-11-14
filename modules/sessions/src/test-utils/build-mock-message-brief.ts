import type { TaskBrief } from '@heynixie/tasks';

export function buildMockMessageBrief(): TaskBrief {
  return {
    origin: 'message',
    messageID: 'm7k2',
    from: 'conversation',
    sequence: 16_031,
    sentAt: new Date('2026-11-05T17:39:00Z'),
    body: 'Find 3 quiet cafes near the station.',
  };
}
