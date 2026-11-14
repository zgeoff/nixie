import type { JSONObject } from '@heynixie/log';
import type { CheckerAnswer } from '@heynixie/sessions';

export function toCheckerJSON(answer: CheckerAnswer, snapshotHash: string): JSONObject {
  return { verdict: answer.verdict, model: answer.model, failure: answer.failure, snapshotHash };
}
