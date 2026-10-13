import { buildCheckerEvalInput } from './build-checker-eval-input';
import type { CheckerCorpus, CheckerPair } from './load-checker-corpus';
import type { CheckerCall, CheckerReport } from './load-checker-report';

export interface LabelledCall {
  readonly call: CheckerCall;
  readonly pair: CheckerPair;
}

// Joins each report call to the corpus pair it checked, so a suite reads the label beside the
// verdict. A call for a pair the corpus lacks, or one that sent an input other than the one the
// pair renders now, is a stale report: the corpus changed after the run.
export function collectLabelledCalls(
  corpus: CheckerCorpus,
  report: CheckerReport,
): readonly LabelledCall[] {
  const samples = new Map(corpus.samples.map((sample) => [sample.id, sample]));

  return report.calls.map((call) => {
    const sample = samples.get(call.sample);
    const pair = sample?.pairs[call.pair];

    if (sample === undefined || pair === undefined) {
      throw new Error(
        `the report checks pair ${call.pair} of ${call.sample}, which is not in the corpus`,
      );
    }
    const input = buildCheckerEvalInput(sample, pair);
    const inputHash = new Bun.CryptoHasher('sha256').update(input).digest('hex');

    if (call.input !== `sha256:${inputHash}`) {
      throw new Error(
        `the report checks pair ${call.pair} of ${call.sample} on an input the corpus no longer renders`,
      );
    }
    return { call, pair };
  });
}
