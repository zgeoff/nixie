import type { SandboxSpec } from '@heynixie/sandbox';
import type { ImpPort } from '../types';
import { isGatewayGrant } from './is-gateway-grant';

export interface GatewayGrantProbe {
  readonly sandboxID: string;
  readonly spec: Pick<SandboxSpec, 'grants'>;
  readonly modelURL: string;
}

export async function probeGatewayGrants(
  port: ImpPort,
  probe: GatewayGrantProbe,
): Promise<boolean> {
  const grants = await port.readGrants(probe.sandboxID);

  const entries = await Promise.all(
    probe.spec.grants.map(
      async (grant) => [grant.secret, await port.readSecretUpstreams(grant.secret)] as const,
    ),
  );

  return isGatewayGrant({ ...probe, grants, upstreams: Object.fromEntries(entries) });
}
