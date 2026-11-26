import { expect, test } from 'bun:test';
import { readStoppedProposal, startInProcessNixie } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

async function setupTest(extraConfig: readonly string[]) {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    extraConfig,
    beforeStart: (_files, seed) => seed.uncheckedRuleApprovals(),
  });

  await nixie.waitForLogEvent('ready');

  return {
    nixie,

    // the rule that the start check proposed, read once nixie has stopped
    stopAndReadProposedRule: async () => {
      nixie.signalStop();

      const exit = await nixie.waitForExit();

      const proposed = exit.records.find(
        (record) =>
          record.kind === 'proposals.proposed' && record.payload['family'] === 'rule_change',
      );

      invariant(proposed, 'the start check proposed a rule');

      const proposalID = proposed.payload['proposalID'];

      invariant(typeof proposalID === 'string', 'the proposed record names its proposal');

      return readStoppedProposal(nixie, proposalID);
    },
  };
}

test('it lapses a rule that the start check proposes after the days the config sets', async () => {
  const ctx = await setupTest(['approvals:', '  lapse_days:', '    rule_change: 9']);
  const row = await ctx.stopAndReadProposedRule();

  const nineDaysMs = 9 * 24 * 60 * 60 * 1000;
  const createdAt = row?.createdAt ?? 0;

  expect(row?.lapsesAt).toBeWithin(createdAt + nineDaysMs - 1000, createdAt + nineDaysMs + 1000);
});
