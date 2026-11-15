import { expect, test } from 'bun:test';
import { createRouterClient } from '@orpc/server';
import invariant from 'tiny-invariant';
import { startTestRules } from '../test-utils/start-test-rules';
import { createHostMandateProcedures } from './create-host-mandate-procedures';

async function setupTest() {
  const rules = await startTestRules();

  const proposed = await rules.proposeMandate({
    title: 'Full authority over my test sends',
    rules: [{ outcome: 'allow', tools: ['test.send'], destinations: ['*@example.org'] }],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  return {
    ...rules,
    mandateID: proposed.mandateID,
    proposalID: proposed.proposalID,
    client: createRouterClient(createHostMandateProcedures(rules.rulesContext)),
  };
}

test('#list shows each active mandate with its title, rules and end', async () => {
  const ctx = await setupTest();

  await ctx.answer(ctx.proposalID, 'approve');

  const listed = await ctx.client.list();

  expect(listed).toStrictEqual([
    {
      mandateID: ctx.mandateID,
      title: 'Full authority over my test sends',
      rules: [{ ruleID: `${ctx.mandateID}-1`, sentence: expect.stringContaining('test.send') }],
      startedAt: new Date('2026-11-02T09:00:00Z'),
      expires: new Date('2026-11-02T13:00:00Z'),
    },
  ]);
});

test('#list shows nothing before a mandate is approved', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.list();

  expect(listed).toStrictEqual([]);
});

test('#end ends a mandate, and says so again when asked twice', async () => {
  const ctx = await setupTest();

  await ctx.answer(ctx.proposalID, 'approve');

  const first = await ctx.client.end({ mandateID: ctx.mandateID });
  const second = await ctx.client.end({ mandateID: ctx.mandateID });
  const listed = await ctx.client.list();

  expect({ first, second, listed }).toStrictEqual({
    first: { mandateID: ctx.mandateID, state: 'ended' },
    second: { mandateID: ctx.mandateID, state: 'ended' },
    listed: [],
  });
});

test('#end refuses an ID that no mandate has', async () => {
  const ctx = await setupTest();

  const ended = ctx.client.end({ mandateID: 'missing' });

  await Promise.allSettled([ended]);

  expect(ended).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
