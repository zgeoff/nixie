import type { PromptID } from './types';

export const promptIDs = [
  'writer',
  'consolidator',
  'content-checker',
  'retirement-checker',
  'session',
  'compaction',
] as const satisfies readonly PromptID[];
