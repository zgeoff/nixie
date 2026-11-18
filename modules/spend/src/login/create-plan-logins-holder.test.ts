import { expect, test } from 'bun:test';
import { createPlanLoginsHolder } from './create-plan-logins-holder';

test('it holds unreachable before the first write', () => {
  const holder = createPlanLoginsHolder();

  expect(holder.read()).toStrictEqual({ state: 'unreachable' });
});

test('it holds the last answer written', () => {
  const holder = createPlanLoginsHolder();

  holder.write({
    state: 'read',
    routes: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
  });

  holder.write({ state: 'unreachable' });

  expect(holder.read()).toStrictEqual({ state: 'unreachable' });
});
