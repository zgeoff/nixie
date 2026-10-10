import type { SandboxSpec } from '@heynixie/sandbox';
import { SandboxSpecRefusedError, requireSandboxSpec } from '@heynixie/sandbox';
import type { PublicEgressConfig } from './parse-imp-config';
import type { ImpPort } from './types';

// Checks what the shared rule cannot: public egress needs the deployment's host addresses and an
// impd that enforces imp's public policy, and each grant's secret must cover its one host alone.
export async function requireImpSpec(
  port: ImpPort,
  publicEgress: PublicEgressConfig | null,
  spec: SandboxSpec,
): Promise<void> {
  requireSandboxSpec(spec);
  if (spec.egress.kind === 'public') {
    await requirePublicEgress(port, publicEgress);
  }
  await Promise.all(spec.grants.map((grant) => requireGrantHost(port, grant.secret, grant.host)));
}

async function requirePublicEgress(
  port: ImpPort,
  publicEgress: PublicEgressConfig | null,
): Promise<void> {
  if (publicEgress === null || publicEgress.hostAddresses.length === 0) {
    throw new SandboxSpecRefusedError(
      'public egress without the host addresses in IMP_HOST_ADDRESSES',
    );
  }
  const features = await port.readFeatures();

  if (!features.publicEgress || !features.isEgressEnforced) {
    throw new SandboxSpecRefusedError('public egress on an impd that does not enforce it');
  }
}

// a grant never reaches further than its spec says
async function requireGrantHost(port: ImpPort, secret: string, host: string): Promise<void> {
  const hosts = await port.readSecretHosts(secret);

  if (hosts?.length !== 1 || hosts[0] !== host) {
    throw new SandboxSpecRefusedError(
      `grant ${secret} must cover ${host} alone, and covers ${JSON.stringify(hosts)}`,
    );
  }
}
