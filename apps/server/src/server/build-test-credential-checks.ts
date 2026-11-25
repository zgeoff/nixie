import type { CredentialStoreOptions } from '@heynixie/credentials';
import { resolveTestHostAddresses } from './resolve-test-host-addresses';

// A loopback HTTPS site that a test serves in place of an outside service.
export interface TestCredentialSite {
  readonly names: readonly string[];

  // the certificate authority the site signs with
  readonly ca: string;
}

type TestCredentialChecks = Pick<CredentialStoreOptions, 'resolveHost' | 'test'>;

// Without a site, each request goes to the mock network. With one, each request takes the pinned
// connection a release build takes, to the site alone, so no other host is reached.
export function buildTestCredentialChecks(site: TestCredentialSite | null): TestCredentialChecks {
  if (site === null) {
    return {
      resolveHost: resolveTestHostAddresses,
      test: { transport: (url: string, init: RequestInit) => fetch(url, init) },
    };
  }

  return {
    resolveHost: (host) =>
      site.names.includes(host)
        ? Promise.resolve(['127.0.0.1'])
        : Promise.reject(new Error(`${host} is not a name of the test site`)),
    test: { checkAddress: (address) => address === '127.0.0.1', ca: site.ca },
  };
}
