import type { JSONObject, RecordInput } from '@heynixie/log';
import type { AskCause } from '@heynixie/policy';
import type { ActionRow } from '../types';

export interface AttemptCheckInput {
  readonly action: ActionRow;
  readonly arguments: JSONObject;

  // the ID a new proposal for this action takes: the action's own ID unless an approval answered it
  readonly proposalID: string;
}

// What the decision point says about an attempt, from the stored call and the current rules.
export type AttemptVerdict =
  | { readonly kind: 'go'; readonly destinations: readonly string[] }
  | {
      readonly kind: 'deny';
      readonly rule: { readonly id: string; readonly revision: number } | null;
      readonly message: string;
    }
  | {
      readonly kind: 'ask';
      readonly cause: AskCause;
      readonly destinations: readonly string[];
      readonly proposalID: string;

      // the proposal that opens the owner's question about this action
      readonly record: RecordInput;
    };

export type AttemptCheck = (input: AttemptCheckInput) => Promise<AttemptVerdict>;
