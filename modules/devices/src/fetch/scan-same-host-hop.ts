import type { HopVerdict } from '@heynixie/connectors';

interface HopTarget {
  readonly url: string;

  // the host that was asked
  readonly host: string;
}

// Lets a redirect through only when it stays on the host that was asked, on https, and holds no
// secret. The reason of a refusal never holds the URL, which may hold the secret.
export function scanSameHostHop(
  hop: HopTarget,
  scanURL: (url: string) => string | null,
): HopVerdict {
  const target = new URL(hop.url);

  if (target.host !== hop.host) {
    return { kind: 'refuse', reason: `the fetch of ${hop.host} redirected to another host` };
  }

  if (target.protocol !== 'https:') {
    return {
      kind: 'refuse',
      reason: `the fetch of ${hop.host} redirected to a URL that is not https`,
    };
  }

  const secretRefusal = scanURL(hop.url);

  return secretRefusal === null ? { kind: 'pass' } : { kind: 'refuse', reason: secretRefusal };
}
