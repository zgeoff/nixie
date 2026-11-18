export interface PlaceholderLogin {
  readonly accountID: string;
  readonly planType: string;
}

const dayMs = 24 * 60 * 60 * 1000;

// The unsigned token that the CLI reads its account and plan from. It holds no email and no secret:
// the gateway sets the real access token on each request. The CLI reads exp as whole seconds, and
// skips its expiry check when exp has a fraction.
export function buildPlaceholderJWT(login: PlaceholderLogin, nowMs: number): string {
  const header = { alg: 'none', typ: 'JWT' };

  const payload = {
    'https://api.openai.com/auth': {
      chatgpt_account_id: login.accountID,
      chatgpt_plan_type: login.planType,
    },
    exp: Math.floor((nowMs + dayMs) / 1000),
  };

  return `${encodeSegment(header)}.${encodeSegment(payload)}.placeholder`;
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
