import { getTypedQuote, renderCheckerInput } from '@heynixie/memory';
import type { CheckerPair, CheckerSample } from './load-checker-corpus';

export function buildCheckerEvalInput(
  sample: CheckerSample,
  pair: CheckerPair,
  ownerName: string | null,
): string {
  const message = { sequence: 0, text: sample.message.text, spans: sample.message.spans };
  const match = getTypedQuote(message, pair.quote);

  if (match.status !== 'typed') {
    throw new Error(`the quote of a ${sample.id} pair fails the quote check: ${match.status}`);
  }

  return renderCheckerInput(message, match, {
    kind: 'candidate_memory',
    text:
      ownerName === null ? pair.memory : pair.memory.replaceAll(/\b[Tt]he owner\b/gu, ownerName),
  });
}
