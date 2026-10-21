import { rangePattern } from './range-pattern';

export interface PublicEgressConfig {
  readonly hostAddresses: readonly string[];
  readonly egressDeny: readonly string[];
}

export interface ImpConfig {
  readonly url: string;
  readonly token: string;
  readonly publicEgress: PublicEgressConfig | null;
}

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

function splitRanges(name: string, value: string | undefined): readonly string[] {
  const ranges = (value ?? '').split(/[\s,]+/u).filter((range) => range.length > 0);

  for (const range of ranges) {
    if (!rangePattern.test(range)) {
      throw new Error(`${name} holds ${range}, which is not an address or a network`);
    }
  }

  return ranges;
}
