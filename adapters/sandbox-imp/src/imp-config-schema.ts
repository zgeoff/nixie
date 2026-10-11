import { z } from 'zod';
import type { PublicEgressConfig } from './parse-imp-config';
import { rangePattern } from './range-pattern';

const rangeSchema = z.string().regex(rangePattern, 'an address or a network, such as 10.0.0.0/8');

// The imp section of the deployment configuration: impd's URL and the public egress ranges that
// impd reads too; impd's token is a secret. Without host addresses the adapter refuses public
// egress, because a host address the list leaves out is reachable from a public imp.
export const impConfigSchema = z
  .strictObject({
    url: z.url({ protocol: /^https?$/u }),
    host_addresses: z.array(rangeSchema).default([]),
    egress_deny: z.array(rangeSchema).default([]),
  })
  .transform((config): ImpSection => ({
    url: config.url,
    publicEgress:
      config.host_addresses.length === 0
        ? null
        : { hostAddresses: config.host_addresses, egressDeny: config.egress_deny },
  }));

export interface ImpSection {
  readonly url: string;
  readonly publicEgress: PublicEgressConfig | null;
}
