import type { RuleContext } from '@heynixie/definitions';
import { runMandateExpiry, runSuggestedRuleChecks } from '@heynixie/definitions';
import type { ProposalConfig } from '@heynixie/proposals';
import type { APIContext } from '../types';
import { defaultPolicySettings } from '../utils/default-api-settings';
import { buildApprovalsProposalConfig } from './build-approvals-proposal-config';

type StartCheckContext = APIContext & RuleContext & { readonly proposalConfig: ProposalConfig };

// Checks each suggested rule that an answer left unchecked and ends each mandate that expired, so a
// crash between an answer and its check loses nothing. The proposals it opens lapse on the days of
// the deployment's settings.
export async function runProposalStartChecks(
  apiContext: APIContext,
  runInForceSeed: RuleContext['runInForceSeed'],
): Promise<{ readonly rules: StartCheckContext; readonly checked: number }> {
  const rules = {
    ...apiContext,
    runInForceSeed,
    proposalConfig: buildApprovalsProposalConfig(apiContext.settings),
  };

  const policy = apiContext.settings.policy ?? defaultPolicySettings;

  const checked = await runSuggestedRuleChecks(rules, policy.proposedRules);

  await runMandateExpiry(rules);

  return { rules, checked };
}
