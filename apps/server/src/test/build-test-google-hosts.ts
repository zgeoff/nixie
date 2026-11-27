import type { GoogleHosts } from '@heynixie/google';

export const testGoogleHostSuffix = '.google.test';

// Google's endpoints for a test build. The browser follows the authorize URL, so it names the fake
// site's own address; every other URL names a `.test` host that the credential store's transport
// sends to the site, so the fetcher's address checks run on the same path as in a release build.
export function buildTestGoogleHosts(siteURL: string): GoogleHosts {
  return {
    authorizeURL: `${siteURL}/authorize`,
    tokenURL: `https://oauth${testGoogleHostSuffix}/token`,
    revokeURL: `https://oauth${testGoogleHostSuffix}/revoke`,
    issuer: `https://accounts${testGoogleHostSuffix}`,
    gmailOrigin: `https://gmail${testGoogleHostSuffix}`,
    apisOrigin: `https://apis${testGoogleHostSuffix}`,
  };
}
