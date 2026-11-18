import { buildTestJWT } from './build-test-jwt';

// an ID token for a made-up account
export function buildTestIDToken(
  identity: { accountID?: string; planType?: string; email?: string } = {},
): string {
  return buildTestJWT({
    email: identity.email ?? 'owner@example.com',
    'https://api.openai.com/auth': {
      chatgpt_account_id: identity.accountID ?? 'acct-test-1',
      chatgpt_plan_type: identity.planType ?? 'plus',
    },
  });
}
