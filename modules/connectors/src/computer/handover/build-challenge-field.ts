import type { JSONObject } from '@heynixie/log';
import { challengeLine } from './challenge-line';

export function buildChallengeField(hasChallenge: boolean): JSONObject {
  return hasChallenge ? { challenge: challengeLine } : {};
}
