import { findTypedQuote, renderCheckerInput } from '@heynixie/memory';
import type { CheckerPair, CheckerSample } from './load-checker-corpus';

// Builds the checker input that the content gate renders for one corpus pair: the message with the
// quote marked as evidence and each pasted span marked, and the candidate memory. Every corpus pair
// passes the quote check, so a quote the gate would refuse is a fault in the corpus.
export function buildCheckerEvalInput(sample: CheckerSample, pair: CheckerPair): string {
  const message = { sequence: 0, text: sample.message.text, spans: sample.message.spans };
  const match = findTypedQuote(message, pair.quote);

  if (match.status !== 'typed') {
    throw new Error(`the quote of a ${sample.id} pair fails the quote check: ${match.status}`);
  }
  return renderCheckerInput(message, match, { kind: 'candidate_memory', text: pair.memory });
}
