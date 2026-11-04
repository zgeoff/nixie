import { parseJSONOrNull } from '@heynixie/wire';
import { z } from 'zod';

export interface MockRequestFacts {
  readonly path: string;
  readonly body: string;

  // the model requests the mock still refuses with 401
  readonly failures: number;
}

export interface MockResponse {
  readonly status: number;
  readonly reply: 'error' | 'accounts' | 'stream';

  // the grant type of a request to the token endpoint, or null for any other path
  readonly grantType: string | null;
  readonly failuresLeft: number;
}

export function pickMockResponse({ path, body, failures }: MockRequestFacts): MockResponse {
  if (path.endsWith('/responses')) {
    return failures > 0
      ? { status: 401, reply: 'error', grantType: null, failuresLeft: failures - 1 }
      : { status: 200, reply: 'stream', grantType: null, failuresLeft: 0 };
  }
  if (path.endsWith('/accounts/check')) {
    return { status: 200, reply: 'accounts', grantType: null, failuresLeft: failures };
  }
  if (path === '/oauth/token') {
    return { status: 401, reply: 'error', grantType: parseGrantType(body), failuresLeft: failures };
  }
  return { status: 404, reply: 'error', grantType: null, failuresLeft: failures };
}

function parseGrantType(body: string): string | null {
  const parsed = z.object({ grant_type: z.string() }).safeParse(parseJSONOrNull(body));

  return parsed.success ? parsed.data.grant_type : new URLSearchParams(body).get('grant_type');
}
