import type { PromptID } from '../types';

export const promptIDs = [
  'consolidator',
  'content-checker',
  'retirement-checker',
  'session',
  'compaction',
  'task',
] as const satisfies readonly PromptID[];
