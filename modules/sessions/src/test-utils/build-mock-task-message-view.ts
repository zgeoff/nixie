import type { TaskMessageView } from '../render-task-message';

export function buildMockTaskMessageView(
  overrides: Partial<TaskMessageView> = {},
): TaskMessageView {
  return {
    messaging: {
      directory: [
        {
          taskID: 'conversation',
          name: 'Conversation',
          brief: 'Talks with the owner.',
          isWokenByMessages: true,
          speaker: 'conversation',
        },
      ],
      hopLimit: 20,
      ownerName: null,
      agentName: null,
    },
    wake: { hop: 0, cause: { kind: 'owner' } },
    ...overrides,
  };
}
