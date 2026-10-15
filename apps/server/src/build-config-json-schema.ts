import { z } from 'zod';
import { deploymentConfigSchema } from './deployment-config-schema';

// The deployment configuration as the JSON Schema that each release publishes. It holds the input
// that nixie reads, defaults included, and leaves out the rules that span keys, such as a role that
// points at a missing profile, which nixie refuses at start.
export function buildConfigJSONSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(deploymentConfigSchema, { io: 'input', target: 'draft-2020-12' }),
    title: 'nixie deployment configuration',
    description:
      'The config.yaml that nixie reads once at start, /etc/nixie/config.yaml by default',
  };
}
