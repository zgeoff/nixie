import { clientHeaderName } from '@heynixie/contract';

// Start adds no credential of its own, so a server render carries exactly the authority of the
// browser that asked for it.
export function buildForwardHeaders(sessionToken: string | undefined): Record<string, string> {
  if (sessionToken === undefined || sessionToken === '') {
    return { [clientHeaderName]: 'web' };
  }

  return { authorization: `Bearer ${sessionToken}`, [clientHeaderName]: 'web' };
}
