import type { CheckerCorpus, CheckerPair } from './load-checker-corpus';
import type { CheckerCall, CheckerReport } from './load-checker-report';

export interface LabelledCall {
  readonly call: CheckerCall;
  readonly pair: CheckerPair;
}

// Joins each report call to the corpus pair it checked, so a suite reads the label beside the
// verdict. A call for a pair the corpus lacks is a stale report.
export function collectLabelledCalls(
  corpus: CheckerCorpus,
  report: CheckerReport,
): readonly LabelledCall[] {
  const samples = new Map(corpus.samples.map((sample) => [sample.id, sample]));

  return report.calls.map((call) => {
    const pair = samples.get(call.sample)?.pairs[call.pair];

    if (pair === undefined) {
      throw new Error(
        `the report checks pair ${call.pair} of ${call.sample}, which is not in the corpus`,
      );
    }
    return { call, pair };
  });
}
