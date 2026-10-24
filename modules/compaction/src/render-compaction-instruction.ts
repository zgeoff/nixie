import type { PromptOverrides } from '@heynixie/prompts';
import { renderPrompt } from '@heynixie/prompts';
import { renderSystemMessage } from '@heynixie/wire';
import { countSummaryWords } from './count-summary-words';

export interface CompactionInstruction {
  readonly at: string;

  readonly summaryTokens: number;

  readonly ownerName: string | null;
  readonly prompts: PromptOverrides;
}

export function renderCompactionInstruction(instruction: CompactionInstruction): string {
  return renderSystemMessage({
    type: 'compaction',
    at: instruction.at,
    body: renderPrompt(
      'compaction',
      {
        owner: { name: instruction.ownerName },
        summary: { words: countSummaryWords(instruction.summaryTokens) },
      },
      instruction.prompts,
    ),
  });
}
