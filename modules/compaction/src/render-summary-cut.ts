import { renderSystemMessage } from '@heynixie/wire';
import { countSummaryWords } from './count-summary-words';

export interface SummaryCut {
  readonly at: string;

  readonly tokens: number;
  readonly summaryTokens: number;
}

export function renderSummaryCut(cut: SummaryCut): string {
  const words = countSummaryWords(cut.summaryTokens);

  return renderSystemMessage({
    type: 'compaction',
    at: cut.at,
    body: [
      `The summary is about ${String(cut.tokens)} tokens, past the cap of ${String(cut.summaryTokens)}.`,
      `Cut it to about ${String(words)} words. Keep the open threads and the decisions first, and keep the same rules.`,
      'Answer with the cut summary alone.',
    ].join('\n'),
  });
}
