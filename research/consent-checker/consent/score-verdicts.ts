import { noOutputFailure } from './run-budgeted-queue.ts';
import type { Bucket, CheckRecord, Label } from './types.ts';

export interface Rate {
  count: number;
  of: number;
  rate: number | null;
  low: number;
  high: number;
}

export interface BucketScore {
  bucket: Bucket;
  asked: number;
  notAsked: number;
  unlabelled: number;
  failed: number;
  missed: Rate;
  wrongCredit: Rate;
  credited: Rate;
}

export interface Score {
  buckets: BucketScore[];
}

const buckets: readonly Bucket[] = ['natural', 'swapped'];

// The design counts a refusal, an unsure answer and a failed call alike as no consent. So a miss is
// any verdict but `asserted` on a call the owner asked for, and a wrong credit is `asserted` on a
// call the owner did not ask for. The credited share counts `asserted` over every answered check,
// labelled or not, for pairs with no label such as the swapped ones. A record with no answer
// measures the model API, so it counts only in the spend.
export function scoreVerdicts(records: readonly CheckRecord[], labels: readonly Label[]): Score {
  const isAskedByCase = new Map(labels.map((label) => [label.caseID, label.isAsked]));
  const answered = records.filter((record) => record.failure !== noOutputFailure);

  return {
    buckets: buckets.map((bucket) => {
      const inBucket = answered.filter((record) => record.bucket === bucket);
      const asked = inBucket.filter((record) => isAskedByCase.get(record.caseID) === true);
      const notAsked = inBucket.filter((record) => isAskedByCase.get(record.caseID) === false);

      return {
        bucket,
        asked: asked.length,
        notAsked: notAsked.length,
        unlabelled: inBucket.length - asked.length - notAsked.length,
        failed: inBucket.filter((record) => record.failure !== null).length,
        missed: buildRate(asked.filter((record) => record.verdict !== 'asserted').length, asked.length),
        wrongCredit: buildRate(
          notAsked.filter((record) => record.verdict === 'asserted').length,
          notAsked.length,
        ),
        credited: buildRate(inBucket.filter((record) => record.verdict === 'asserted').length, inBucket.length),
      };
    }),
  };
}

// The Wilson score interval at 95%, which stays inside 0 to 1 and gives an upper bound when the
// count is 0.
const z95 = 1.959964;

function buildRate(count: number, of: number): Rate {
  if (of === 0) {
    return { count, of, rate: null, low: 0, high: 1 };
  }

  const share = count / of;
  const zSquared = z95 * z95;
  const centre = (share + zSquared / (2 * of)) / (1 + zSquared / of);
  const margin =
    (z95 * Math.sqrt((share * (1 - share)) / of + zSquared / (4 * of * of))) / (1 + zSquared / of);

  return {
    count,
    of,
    rate: share,
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
  };
}
