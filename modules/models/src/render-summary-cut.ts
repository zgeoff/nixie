import { countSummaryWords } from './count-summary-words';
import { renderSystemMessage } from './render-system-message';

export interface SummaryCut {
  // when nixie wrote the request, as a message stamp shows a time
  readonly at: string;

  // the size nixie counted for the summary, and the cap it passed
  readonly tokens: number;
  readonly summaryTokens: number;
}

// Renders the one request that asks the model to cut a summary past the cap, in the same fork, as a
// system message of type compaction.
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
