import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildMandateTool } from './build-mandate-tool';

async function setupTest() {
  const started = await startTestLog();

  const tool = buildMandateTool({
    context: {
      log: started.log,
      clock: started.clock,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
    },
    maxHours: 24,
    defaultZone: 'Australia/Sydney',
  });

  const call = (input: JSONObject) =>
    tool.run(
      { callID: 'call-1', tool: 'rules.propose_mandate', input, toolUseID: null },
      buildMockToolContext(),
    );

  return { ...started, tool, call };
}

test('it declares the note effect, which only writes a proposal', async () => {
  const ctx = await setupTest();

  expect(ctx.tool.declaration.effects).toStrictEqual(['note']);
});

test('it writes a pending proposal and returns what the owner will see on the card', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Full authority over my calendar invites',
    rules: [{ outcome: 'allow', tools: ['calendar.respond', 'calendar.invite'] }],
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      status: 'pending',
      proposalID: expect.any(String),
      mandateID: expect.any(String),
      expires: expect.stringMatching(/Z$/u),
      sentences: [
        '**Allow** `calendar.invite` or `calendar.respond`, until 2026-10-16T13:00:00.000Z.',
      ],
    },
  });
});

test('it refuses a mandate with a rule that is not an allow rule', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call({ title: 'Never mind', rules: [{ outcome: 'deny' }] });

  expect(outcome.status).toBe('error');
});

test('it refuses an expiry in the past', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call({
    title: 'Too late',
    rules: [{ outcome: 'allow', tools: ['calendar.respond'] }],
    expires: '2000-01-01T00:00:00Z',
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'The mandate was refused: expires_past.',
  });
});
