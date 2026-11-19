import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { rulesChangeProposedCodec } from '../change/rules-change-proposed-codec';
import type { RuleProposal } from '../utils/rule-proposal-schema';

// A pending rule change proposal, a record kind that the log still holds and no seed writes. By
// default it holds one effect removal and no rule change, so an approval moves no seeded rule.
export async function seedLegacyRuleProposal(
  log: Log,
  input: Partial<RuleProposal> = {},
): Promise<RuleProposal> {
  const proposal: RuleProposal = {
    proposalID: 'legacy-proposal',
    proposalHash: 'sha256:legacy-proposal',
    changes: [],
    effectChanges: [{ tool: 'web.fetch', remove: ['send'] }],
    budgetChanges: [],
    ...input,
  };

  await writeRecords(log, [
    {
      kind: rulesChangeProposedCodec.kind,
      definitions: { snapshotHash: 'sha256:legacy' },
      payload: rulesChangeProposedCodec.encode(proposal),
    },
  ]);

  return proposal;
}
