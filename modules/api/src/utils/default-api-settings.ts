import { conversationTaskID } from '@heynixie/tasks';
import type { APISettings } from '../types';

export const defaultApprovalSettings = {
  defaultMinutes: 60,
  eveningAt: '18:00',
  morningAt: '08:00',
  quietHours: null,
  defaultZone: 'Australia/Sydney',
} as const;

export const defaultPolicySettings = {
  proposedRules: { approvals: 3, windowDays: 30, quietDays: 30 },
  mandates: { maxHours: 24 },
} as const;

export const defaultAPISettings: APISettings = {
  enrolmentCodeLifetimeMs: 15 * 60 * 1000,
  sessionIdleMs: 30 * 24 * 60 * 60 * 1000,
  refusalIntervalMs: 60 * 60 * 1000,
  lastSeenIntervalMs: 60 * 1000,
  readOnlyTokenHashes: [],
  isBackupEnabled: true,
  approvals: defaultApprovalSettings,
  policy: defaultPolicySettings,
  taskDirectory: [
    {
      taskID: conversationTaskID,
      name: 'Conversation',
      brief: 'Talks with the owner and answers each message.',
      isWokenByMessages: true,
      speaker: 'conversation',
    },
  ],
};
