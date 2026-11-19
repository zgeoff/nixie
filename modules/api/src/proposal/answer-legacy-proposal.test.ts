import { expect, test } from 'bun:test';
import { readPendingRuleProposals } from '@heynixie/definitions';
import { seedLegacyRuleProposal } from '@heynixie/definitions/test-utils';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { answerLegacyProposal } from './answer-legacy-proposal';

async function setupTest() {
  const api = await startTestAPI();

  // the writer stamps records with the wall clock, so the test clock starts there
  api.clock.advance(Date.now() - api.clock.now());

  // a rule change proposal that a seed of an earlier release left pending
  await seedLegacyRuleProposal(api.context.log);

  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    api,
    client: buildTestClient(api.url, laptop.token),
    readPending: () => readPendingRuleProposals(api.context.log.writer.db, api.clock.now()),
  };
}

test('it answers nothing for a session revoked after the route checked it', async () => {
  const ctx = await setupTest();
  const phone = await createDeviceSession(ctx.api.context, 'phone');
  const [pending] = await ctx.readPending();

  await ctx.client.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: phone.sessionID,
  });

  const answer = answerLegacyProposal(
    ctx.api.context,
    {
      runInForceSeed: () => Promise.resolve(),
      caller: {
        probe: (tx) => probeLiveIdentity(tx, ctx.api.context, phone.caller.identityID),
        buildUnauthorized: () => new Error('the session is revoked'),
      },
    },
    'rule_change',
    { proposalID: pending?.proposal.proposalID ?? 'missing', choice: 'approve' },
  );

  expect(answer).rejects.toThrowWithMessage(Error, 'the session is revoked');

  await Promise.allSettled([answer]);

  const after = await ctx.readPending();

  expect(after).toHaveLength(1);
});
