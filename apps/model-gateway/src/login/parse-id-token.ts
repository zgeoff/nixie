import { isRecord } from '../utils/is-record';
import { parseJWTClaims } from './parse-jwt-claims';

export interface IDTokenIdentity {
  readonly accountID: string;
  readonly planType: string;
  readonly email: string;
}

// null when the token lacks the account, the plan or the email
export function parseIDToken(idToken: string): IDTokenIdentity | null {
  const claims = parseJWTClaims(idToken);
  const auth = claims?.['https://api.openai.com/auth'];

  if (claims === null || !isRecord(auth)) {
    return null;
  }

  const accountID = auth['chatgpt_account_id'];
  const planType = auth['chatgpt_plan_type'];
  const email = claims['email'];

  if (typeof accountID !== 'string' || typeof planType !== 'string' || typeof email !== 'string') {
    return null;
  }

  return { accountID, planType, email };
}
