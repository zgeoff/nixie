import type { HarnessProfile } from '@heynixie/models';
import type { SpendContext } from '@heynixie/spend';
import type { TurnProfile } from '@heynixie/wire';
import { ChatGPTLoginError } from './chatgpt-login-error';
import { pickPlanLogin } from './pick-plan-login';

export interface PlanTurnProfileInput {
  readonly turnProfile: TurnProfile;
  readonly profile: HarnessProfile;
  readonly spend: SpendContext | undefined;
}

// A turn profile on a plan profile, with the account and the plan of the gateway's login. The step
// reads the answer the spend module holds, and never calls the gateway. A profile that is not a plan
// profile passes through unchanged. It throws when the login is not usable, so no turn starts.
export function resolvePlanTurnProfile(input: PlanTurnProfileInput): TurnProfile {
  const profile = input.profile;

  if (
    profile.harness !== 'codex' ||
    !profile.chatgptLogin ||
    input.turnProfile.harness !== 'codex'
  ) {
    return input.turnProfile;
  }

  const pick =
    input.spend === undefined
      ? ({ kind: 'failed', problem: 'the server has no spendStop section' } as const)
      : pickPlanLogin(input.spend.planLogins.read(), profile.id);

  if (pick.kind === 'failed') {
    throw new ChatGPTLoginError(profile.id, pick.problem);
  }

  return {
    ...input.turnProfile,
    chatgptLogin: { accountID: pick.accountID, planType: pick.planType },
  };
}
