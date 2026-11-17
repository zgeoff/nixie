import type { SandboxSpec } from '@heynixie/sandbox';
import { SandboxSpecRefusedError, requireSandboxSpec } from '@heynixie/sandbox';
import type { ImpFeatures, ImpPort, ModelGateway } from '../types';
import type { PublicEgressConfig } from './parse-imp-config';

export async function requireImpSpec(
  port: ImpPort,
  publicEgress: PublicEgressConfig | null,
  spec: SandboxSpec,
  modelGateway: ModelGateway | null,
): Promise<void> {
  requireSandboxSpec(spec);

  const features = await port.readFeatures();

  if (!features.hasBackupOptOut) {
    throw new SandboxSpecRefusedError('a sandbox on an impd that would back it up');
  }

  if (spec.egress.kind !== 'public' && !features.isEgressEnforced) {
    throw new SandboxSpecRefusedError('closed egress on an impd that does not enforce it');
  }

  if (spec.egress.kind === 'public') {
    requirePublicEgress(features, publicEgress);
  }

  await Promise.all(spec.grants.map((grant) => requireGrantHost(port, grant.secret, grant.host)));

  if (modelGateway !== null) {
    requireGrantRoutes(spec);

    await Promise.all(
      spec.grants.map((grant) => requireGrantUpstream(port, grant.secret, modelGateway.modelURL)),
    );
  }
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

async function requireGrantHost(port: ImpPort, secret: string, host: string): Promise<void> {
  const hosts = await port.readSecretHosts(secret);

  if (hosts?.length !== 1 || hosts[0] !== host) {
    throw new SandboxSpecRefusedError(
      `grant ${secret} must cover ${host} alone, and covers ${JSON.stringify(hosts)}`,
    );
  }
}

// Every grant sends to the gateway, and a grant with no route would reach every route of its sandbox.
function requireGrantRoutes(spec: SandboxSpec): void {
  const unrouted = spec.grants.find((grant) => typeof grant.route !== 'string');

  if (unrouted !== undefined) {
    throw new SandboxSpecRefusedError(
      `grant ${unrouted.secret} names no gateway route, and with spendStop set each grant reaches one route`,
    );
  }
}

// With the gateway counting every model request, a model secret must send to the gateway, or its
// requests would reach the provider uncounted.
async function requireGrantUpstream(
  port: ImpPort,
  secret: string,
  modelURL: string,
): Promise<void> {
  const upstreams = await port.readSecretUpstreams(secret);

  if (upstreams === null) {
    throw new SandboxSpecRefusedError(
      `the model secret ${secret} is missing from impd, and with spendStop set the server adds no model secret`,
    );
  }

  if (!upstreams.every((upstream) => upstream !== null && isSameOrigin(upstream, modelURL))) {
    throw new SandboxSpecRefusedError(
      `the model secret ${secret} must send to ${modelURL}, and sends to ${JSON.stringify(upstreams)}`,
    );
  }
}

function isSameOrigin(first: string, second: string): boolean {
  const origin = URL.parse(first)?.origin;

  return origin !== undefined && origin === URL.parse(second)?.origin;
}
