import type { Logger } from '@heynixie/logger';
import type { SecretFinder } from '@heynixie/secret-scan';

const secretRefusalEvent = 'device_fetch.secret_refused';

interface DeviceURLScanOptions {
  readonly findSecret: SecretFinder;
  readonly logger: Logger;
}

// The scan that a declared URL of a device page passes, as the web fetch's own scan stops a sent
// URL: the sentence that refuses a URL that holds a secret, or null. A page's URL is never one the
// owner typed, so none is exempt.
export function makeDeviceURLScan(options: DeviceURLScanOptions): (url: string) => string | null {
  return (url) => {
    const found = options.findSecret(url);

    if (found === null) {
      return null;
    }

    options.logger(secretRefusalEvent, { rule: found.rule });

    return `the URL holds a secret (rule ${found.rule}), so it was not fetched`;
  };
}
