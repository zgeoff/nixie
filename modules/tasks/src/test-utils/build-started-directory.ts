import type { TaskProfile } from '../types';

interface StartedDirectory {
  readonly directory: readonly TaskProfile[];
  readonly hopLimit: number;
}

// The conversation and one started task named Tide tables, with no persona on either.
export function buildStartedDirectory(taskID: string): StartedDirectory {
  return {
    directory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks.',
        isWokenByMessages: true,
        speaker: 'conversation',
      },
      {
        taskID,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
        isWokenByMessages: true,
        speaker: 'plain_task',
      },
    ],
    hopLimit: 20,
  };
}
