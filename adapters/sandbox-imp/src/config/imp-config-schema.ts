import { z } from 'zod';
import { rangePattern } from '../memory/range-pattern';
import type { PublicEgressConfig } from './parse-imp-config';

const rangeSchema = z.string().regex(rangePattern, 'an address or a network, such as 10.0.0.0/8');

export interface ImpSection {
  readonly url: string;
  readonly publicEgress: PublicEgressConfig | null;
}

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
