import type { PromptID } from '../types';

export const promptIDs = [
  'content-checker',
  'retirement-checker',
  'session',
  'compaction',
  'task',
] as const satisfies readonly PromptID[];
