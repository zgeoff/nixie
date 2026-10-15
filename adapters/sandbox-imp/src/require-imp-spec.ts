import type { SandboxSpec } from '@heynixie/sandbox';
import { SandboxSpecRefusedError, requireSandboxSpec } from '@heynixie/sandbox';
import type { PublicEgressConfig } from './parse-imp-config';
import type { ImpFeatures, ImpPort } from './types';

// Checks what the shared rule cannot: the imp must stay out of impd's backups, public egress needs
// the deployment's host addresses and an impd that enforces imp's public policy, and each grant's
// secret must cover its one host alone.
export async function requireImpSpec(
  port: ImpPort,
  publicEgress: PublicEgressConfig | null,
  spec: SandboxSpec,
): Promise<void> {
  requireSandboxSpec(spec);

  const features = await port.readFeatures();

  if (!features.hasBackupOptOut) {
    throw new SandboxSpecRefusedError('a sandbox on an impd that would back it up');
  }

  if (spec.egress.kind === 'public') {
    requirePublicEgress(features, publicEgress);
  }

  await Promise.all(spec.grants.map((grant) => requireGrantHost(port, grant.secret, grant.host)));
}

function requirePublicEgress(features: ImpFeatures, publicEgress: PublicEgressConfig | null): void {
  if (publicEgress === null || publicEgress.hostAddresses.length === 0) {
    throw new SandboxSpecRefusedError(
      'public egress without the host addresses in imp.host_addresses',
    );
  }

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
