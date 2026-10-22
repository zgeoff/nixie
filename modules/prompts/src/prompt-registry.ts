import { compactionPrompt } from './compaction-prompt';
import { consolidatorPrompt } from './consolidator-prompt';
import { contentCheckerPrompt } from './content-checker-prompt';
import { retirementCheckerPrompt } from './retirement-checker-prompt';
import { sessionPrompt } from './session-prompt';
import type { PromptContexts, PromptEntry, PromptID } from './types';
import { writerPrompt } from './writer-prompt';

export const promptRegistry: { readonly [ID in PromptID]: PromptEntry<PromptContexts[ID]> } = {
  writer: writerPrompt,
  consolidator: consolidatorPrompt,
  'content-checker': contentCheckerPrompt,
  'retirement-checker': retirementCheckerPrompt,
  session: sessionPrompt,
  compaction: compactionPrompt,
};
