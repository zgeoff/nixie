import type { ProposalConfig } from '@heynixie/proposals';
import type { APISettings } from '../types';
import { defaultApprovalSettings } from '../utils/default-api-settings';

// The lapse of each family that the server's approvals settings set.
export function buildApprovalsProposalConfig(
  settings: Pick<APISettings, 'approvals'> | undefined,
): ProposalConfig {
  return { lapseDays: (settings?.approvals ?? defaultApprovalSettings).lapseDays };
}
