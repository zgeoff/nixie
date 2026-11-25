export type ScopeReadVerdict = 'granted' | 'not_granted' | 'api_disabled' | 'unknown';

// What one read call says about its scope. Google refuses a call with 403 for a scope the owner did
// not grant, and for an API the project has not enabled; only the error's reason tells them apart.
export function classifyScopeRead(status: number, body: string): ScopeReadVerdict {
  if (status >= 200 && status < 300) {
    return 'granted';
  }

  if (status !== 401 && status !== 403) {
    return 'unknown';
  }

  const isDisabled = body.includes('accessNotConfigured') || body.includes('SERVICE_DISABLED');

  return isDisabled ? 'api_disabled' : 'not_granted';
}
