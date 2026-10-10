import { clientHeaderName } from '@heynixie/contract';

// Builds the headers of a call that the Start server makes while it renders for a browser. The
// device session from the browser's cookie travels as a bearer token, and Start adds no credential
// of its own, so a render carries exactly the authority of the browser that asked for it.
export function buildForwardHeaders(sessionToken: string | undefined): Record<string, string> {
  if (sessionToken === undefined || sessionToken === '') {
    return { [clientHeaderName]: 'web' };
  }

  return { authorization: `Bearer ${sessionToken}`, [clientHeaderName]: 'web' };
}
