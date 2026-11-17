import type { SandboxSpec } from '@heynixie/sandbox';
import type { GrantRow } from '../types';
import { buildGrantPath } from './build-grant-path';

export interface GatewayGrantFacts {
  readonly sandboxID: string;
  readonly spec: Pick<SandboxSpec, 'grants'>;
  readonly modelURL: string;
  readonly grants: readonly GrantRow[];

  // the upstream of each rule of each granted secret, null for a secret that impd lacks
  readonly upstreams: Readonly<Record<string, readonly (string | null)[] | null>>;
}

// Whether an imp that already exists holds each grant of its spec the way the gateway needs: limited
// to the path of its own sandbox and route, on a secret that sends to the gateway. A sandbox made before the
// gateway was set fails this, and is replaced.
export function isGatewayGrant(facts: GatewayGrantFacts): boolean {
  const modelOrigin = URL.parse(facts.modelURL)?.origin;

  return facts.spec.grants.every((grant) => {
    const held = facts.grants.find((row) => row.secret === grant.secret);
    const upstreams = facts.upstreams[grant.secret] ?? null;

    // a grant stored without a route was made before a grant held one, so its filter reaches every
    // route of the sandbox
    return (
      grant.route !== undefined &&
      held?.paths?.length === 1 &&
      held.paths[0] === buildGrantPath(facts.sandboxID, grant.route) &&
      upstreams !== null &&
      upstreams.every(
        (upstream) =>
          upstream !== null &&
          modelOrigin !== undefined &&
          URL.parse(upstream)?.origin === modelOrigin,
      )
    );
  });
}
