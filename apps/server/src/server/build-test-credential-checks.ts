import type { CredentialStoreOptions } from '@heynixie/credentials';
import { makeGoogleTransport } from '../test/make-google-transport';
import { resolveTestHostAddresses } from './resolve-test-host-addresses';

// A loopback HTTPS site that a test serves in place of an outside service.
export interface TestCredentialSite {
  readonly names: readonly string[];

  // the certificate authority the site signs with
  readonly ca: string;
}

type TestCredentialChecks = Pick<CredentialStoreOptions, 'resolveHost' | 'test'>;

// Without a site, each request goes to the mock network, except a request to a Google test host,
// which goes to the fake Google site at `googleURL` when there is one. With a site, each request
// takes the pinned connection a release build takes, to the site alone, so no other host is reached.
export function buildTestCredentialChecks(
  site: TestCredentialSite | null,
  googleURL: string | null,
): TestCredentialChecks {
  if (site === null) {
    return {
      resolveHost: resolveTestHostAddresses,
      test: { transport: makeGoogleTransport(googleURL) },
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
