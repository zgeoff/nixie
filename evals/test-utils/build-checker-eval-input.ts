import { findTypedQuote, renderCheckerInput } from '@heynixie/memory';
import type { CheckerPair, CheckerSample } from './load-checker-corpus';

// Builds the checker input that the content gate renders for one corpus pair, with the memory's
// "the owner" swapped for the name when one is given. Every corpus pair passes the quote check, so
// a quote the gate would refuse is a fault in the corpus.
export function buildCheckerEvalInput(
  sample: CheckerSample,
  pair: CheckerPair,
  ownerName: string | null,
): string {
  const message = { sequence: 0, text: sample.message.text, spans: sample.message.spans };
  const match = findTypedQuote(message, pair.quote);

  if (match.status !== 'typed') {
    throw new Error(`the quote of a ${sample.id} pair fails the quote check: ${match.status}`);
  }

  return renderCheckerInput(message, match, {
    kind: 'candidate_memory',
    text:
      ownerName === null ? pair.memory : pair.memory.replaceAll(/\b[Tt]he owner\b/gu, ownerName),
  });
}
