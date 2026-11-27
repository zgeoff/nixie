import type { JSONObject } from '@heynixie/log';
import type { ActionProposalFacts, AskCause } from '@heynixie/policy';
import type { ActionRow } from '../types';

export interface AttemptCheckInput {
  readonly action: ActionRow;
  readonly arguments: JSONObject;

  // the ID a new proposal for this action takes: the action's own ID unless an approval answered it
  readonly proposalID: string;
}

// What the decision point says about an attempt, from the stored call and the current rules.
export type AttemptVerdict =
  | {
      readonly kind: 'go';
      readonly destinations: readonly string[];
      readonly replyTargets?: readonly string[];

      // runs once the attempt is admitted, so a call that never started leaves no record of an act
      readonly writeActs?: () => Promise<void>;
    }
  | {
      readonly kind: 'deny';
      readonly rule: { readonly id: string; readonly revision: number } | null;
      readonly message: string;
    }
  | {
      readonly kind: 'ask';
      readonly cause: AskCause;
      readonly destinations: readonly string[];
      readonly replyTargets?: readonly string[];
      readonly proposalID: string;

      // what the proposal that opens the owner's question about this action holds
      readonly proposal: ActionProposalFacts;
    };

export type AttemptCheck = (input: AttemptCheckInput) => Promise<AttemptVerdict>;
