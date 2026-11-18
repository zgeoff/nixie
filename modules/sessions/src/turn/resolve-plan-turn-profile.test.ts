import { expect, test } from 'bun:test';
import { bindHarness } from '@heynixie/models';
import { buildMockCodexProfile } from '@heynixie/models/test-utils';
import { startTestSpend } from '@heynixie/spend/test-utils';
import { ChatGPTLoginError } from './chatgpt-login-error';
import { resolvePlanTurnProfile } from './resolve-plan-turn-profile';

async function setupTest() {
  const spend = await startTestSpend();

  return {
    spend,
    planProfile: buildMockCodexProfile({ id: 'codex-plan', chatgptLogin: true }),
    buildTurnProfile: (profile: ReturnType<typeof buildMockCodexProfile>) =>
      bindHarness(profile).toTurnProfile('kept'),
  };
}

test('it passes a turn profile on an API key profile through unchanged', async () => {
  const ctx = await setupTest();

  const profile = buildMockCodexProfile({ id: 'codex-key', chatgptLogin: false });
  const turnProfile = ctx.buildTurnProfile(profile);

  expect(resolvePlanTurnProfile({ turnProfile, profile, spend: undefined })).toBe(turnProfile);
});

test('it puts the account and plan of an active login in the turn profile', async () => {
  const ctx = await setupTest();

  ctx.spend.context.planLogins.write({
    state: 'read',
    routes: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
  });

  const resolved = resolvePlanTurnProfile({
    turnProfile: ctx.buildTurnProfile(ctx.planProfile),
    profile: ctx.planProfile,
    spend: ctx.spend.context,
  });

  expect(resolved).toMatchObject({
    harness: 'codex',
    chatgptLogin: { accountID: 'acct-test-1', planType: 'plus' },
  });
});

test.each([
  ['an unreachable gateway', { state: 'unreachable' } as const],
  [
    'a login that needs a login',
    {
      state: 'read',
      routes: {
        'codex-plan': { status: 'needs_login', accountID: 'acct-test-1', planType: 'plus' },
      },
    } as const,
  ],
  ['a route with no entry', { state: 'read', routes: {} } as const],
])('it throws a ChatGPT login error for %s, which waits for the owner', async (_name, logins) => {
  const ctx = await setupTest();

  ctx.spend.context.planLogins.write(logins);

  const resolve = () =>
    resolvePlanTurnProfile({
      turnProfile: ctx.buildTurnProfile(ctx.planProfile),
      profile: ctx.planProfile,
      spend: ctx.spend.context,
    });

  expect(resolve).toThrow(ChatGPTLoginError);
  expect(resolve).toThrow(/model-gateway chatgpt-login/u);
});

test('it fails a plan profile when the server has no spend context', async () => {
  const ctx = await setupTest();

  expect(() =>
    resolvePlanTurnProfile({
      turnProfile: ctx.buildTurnProfile(ctx.planProfile),
      profile: ctx.planProfile,
      spend: undefined,
    }),
  ).toThrow(ChatGPTLoginError);
});

test('it fails with the reason that the client maps and a wait for the owner', async () => {
  const ctx = await setupTest();

  const error = new ChatGPTLoginError(ctx.planProfile.id, 'its login is needs_login');

  expect([error.reason, error.isWaitingForOwner, error.records]).toStrictEqual([
    'model_auth.chatgpt_login',
    true,
    [],
  ]);
});
