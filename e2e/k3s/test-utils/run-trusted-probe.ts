import { buildConnectProbe } from '../../../apps/server/src/test-utils/build-connect-probe';
import type { KubectlTarget, ProbeTarget } from './parse-live-env';
import { runKubectl } from './run-kubectl';

// A probe target, and the trusted network that may reach it: nixie's pod for impd, the node and
// the cluster, and the machine that runs the check for a tailnet address.
export interface TrustedProbeTarget extends ProbeTarget {
  readonly from: 'pod' | 'local';
}

// Runs the TCP connect probe from the target's trusted network and returns what it prints:
// connected, or failed with the reason. A fetch sandbox's failed probe shows isolation only when
// this probe connects, because a target with no listener refuses every network alike.
export async function runTrustedProbe(
  kubectl: KubectlTarget,
  target: TrustedProbeTarget,
): Promise<string> {
  if (target.from === 'pod') {
    const probe = buildConnectProbe('bun', target.host, target.port);
    const stdout = await runKubectl(kubectl, [
      'exec',
      'nixie-0',
      '--container',
      'nixie',
      '--',
      'env',
      ...Object.entries(probe.env ?? {}).map(([name, value]) => `${name}=${value}`),
      ...probe.argv,
    ]);

    return stdout.trim();
  }
  const probe = buildConnectProbe(process.execPath, target.host, target.port);
  const child = Bun.spawn([...probe.argv], { env: { ...probe.env }, stdout: 'pipe' });
  const stdout = await new Response(child.stdout).text();

  return stdout.trim();
}
