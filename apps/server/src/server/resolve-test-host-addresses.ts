import { resolveHostAddresses } from '@heynixie/egress';

// A test build serves each `.test` host of the mock network at a public address, so the fetcher's
// address checks run on the same path as in a release build.
export function resolveTestHostAddresses(host: string): Promise<readonly string[]> {
  return host.endsWith('.test') ? Promise.resolve(['93.184.216.34']) : resolveHostAddresses(host);
}
