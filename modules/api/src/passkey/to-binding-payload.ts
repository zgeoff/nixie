import type { JSONObject } from '@heynixie/log';
import type { ChallengeFor } from './challenge-for';

// A binding as a log payload and as one canonical form: a fixed key order and no missing keys.
export function toBindingPayload(binding: ChallengeFor): JSONObject {
  if (binding.kind === 'answer') {
    return {
      kind: binding.kind,
      proposalID: binding.proposalID,
      actionHash: binding.actionHash,
      choice: binding.choice,
      ruleHash: binding.ruleHash ?? null,
    };
  }

  if (binding.kind === 'unknown_outcome') {
    return { kind: binding.kind, actionID: binding.actionID, choice: binding.choice };
  }

  if (binding.kind === 'revoke') {
    return { kind: binding.kind, passkeyID: binding.passkeyID };
  }

  return { kind: binding.kind };
}
