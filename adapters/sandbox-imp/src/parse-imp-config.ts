// The deployment's ranges for public egress, the same lists impd reads, which the adapter takes as
// config. Without host addresses the adapter refuses public egress, because a host address the
// list leaves out is reachable from a public imp.
export interface PublicEgressConfig {
  readonly hostAddresses: readonly string[];
  readonly egressDeny: readonly string[];
}

export interface ImpConfig {
  readonly url: string;
  readonly token: string;
  readonly publicEgress: PublicEgressConfig | null;
}

// Parses the imp adapter's config from the environment: IMP_URL and IMP_TOKEN, and the public
// egress ranges in IMP_HOST_ADDRESSES and IMP_EGRESS_DENY, each a list of addresses or networks
// split by commas or spaces.
export function parseImpConfig(env: Readonly<Record<string, string | undefined>>): ImpConfig {
  const url = env['IMP_URL'] ?? '';
  const token = env['IMP_TOKEN'] ?? '';

  if (!URL.canParse(url) || !/^https?:$/u.test(new URL(url).protocol)) {
    throw new Error("IMP_URL must be impd's http or https URL");
  }
  if (token.length === 0) {
    throw new Error('IMP_TOKEN must hold an impd token');
  }
  const hostAddresses = splitRanges('IMP_HOST_ADDRESSES', env['IMP_HOST_ADDRESSES']);
  const egressDeny = splitRanges('IMP_EGRESS_DENY', env['IMP_EGRESS_DENY']);

  return {
    url,
    token,
    publicEgress: hostAddresses.length === 0 ? null : { hostAddresses, egressDeny },
  };
}

// an IPv4 or IPv6 address with an optional prefix length
const rangePattern =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|[\da-f:]*:[\da-f:.]*(?:\/\d{1,3})?)$/iu;

function splitRanges(name: string, value: string | undefined): readonly string[] {
  const ranges = (value ?? '').split(/[\s,]+/u).filter((range) => range.length > 0);

  for (const range of ranges) {
    if (!rangePattern.test(range)) {
      throw new Error(`${name} holds ${range}, which is not an address or a network`);
    }
  }
  return ranges;
}
