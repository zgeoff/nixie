import { expect, test } from 'bun:test';
import { pickPlanLogin } from './pick-plan-login';

test('it finds the account and plan of an active login', () => {
  expect(
    pickPlanLogin(
      {
        state: 'read',
        routes: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
      },
      'codex-plan',
    ),
  ).toStrictEqual({ kind: 'found', accountID: 'acct-test-1', planType: 'plus' });
});

test.each(['failing', 'needs_login'] as const)('it fails a login that is %s', (status) => {
  expect(
    pickPlanLogin(
      {
        state: 'read',
        routes: { 'codex-plan': { status, accountID: 'acct-test-1', planType: 'plus' } },
      },
      'codex-plan',
    ),
  ).toStrictEqual({ kind: 'failed', problem: `its login is ${status}` });
});

test('it fails a route the gateway does not list', () => {
  expect(pickPlanLogin({ state: 'read', routes: {} }, 'codex-plan')).toStrictEqual({
    kind: 'failed',
    problem: 'the model gateway has no plan route codex-plan',
  });
});

test('it fails when the gateway gave no answer', () => {
  expect(pickPlanLogin({ state: 'unreachable' }, 'codex-plan')).toStrictEqual({
    kind: 'failed',
    problem: 'the model gateway did not answer for its logins',
  });
});

test('it fails an active login that names no account', () => {
  expect(
    pickPlanLogin(
      {
        state: 'read',
        routes: { 'codex-plan': { status: 'active', accountID: null, planType: null } },
      },
      'codex-plan',
    ),
  ).toStrictEqual({ kind: 'failed', problem: 'its login names no account or plan' });
});
