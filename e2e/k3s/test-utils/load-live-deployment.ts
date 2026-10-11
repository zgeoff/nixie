import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeploymentConfig, SandboxImages } from '../../../apps/server/src/index';
import { deploymentConfigSchema, loadSandboxManifest } from '../../../apps/server/src/index';
import type { KubectlTarget } from './parse-live-env';
import { runKubectl } from './run-kubectl';

// What the fetch sandbox check reads from a deployed nixie: the configuration and the sandbox
// manifest in its running pod, and the addresses of the cluster's nodes, of nixie's pod and of
// nixie's Service.
export interface LiveDeployment {
  readonly config: DeploymentConfig;
  readonly images: SandboxImages;
  readonly nodeAddresses: readonly string[];
  readonly podAddress: string;
  readonly serviceAddress: string;
}

// Loads the deployment from the cluster. The configuration and the manifest come from the files
// nixie's container read at its start, so the check builds its sandboxes as nixie does.
export async function loadLiveDeployment(kubectl: KubectlTarget): Promise<LiveDeployment> {
  const configText = await readPodFile(kubectl, '/etc/nixie/config.yaml');
  const manifestText = await readPodFile(kubectl, '/app/sandbox-manifest.json');
  const nodeAddresses = await runKubectl(kubectl, [
    'get',
    'nodes',
    '--output',
    'jsonpath={.items[*].status.addresses[?(@.type=="InternalIP")].address}',
  ]);
  const podAddress = await runKubectl(kubectl, [
    'get',
    'pod',
    'nixie-0',
    '--output',
    'jsonpath={.status.podIP}',
  ]);
  const serviceAddress = await runKubectl(kubectl, [
    'get',
    'service',
    'nixie',
    '--output',
    'jsonpath={.spec.clusterIP}',
  ]);

  return {
    config: deploymentConfigSchema.parse(Bun.YAML.parse(configText)),
    images: await loadManifestText(manifestText),
    nodeAddresses: nodeAddresses.split(/\s+/u).filter((address) => address !== ''),
    podAddress: podAddress.trim(),
    serviceAddress: serviceAddress.trim(),
  };
}

function readPodFile(kubectl: KubectlTarget, path: string): Promise<string> {
  return runKubectl(kubectl, ['exec', 'nixie-0', '--container', 'nixie', '--', 'cat', path]);
}

// nixie's own manifest loader names each image as nixie does, and it reads from a file
async function loadManifestText(text: string): Promise<SandboxImages> {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-live-manifest-'));

  try {
    await writeFile(join(dir, 'sandbox-manifest.json'), text);
    return await loadSandboxManifest(join(dir, 'sandbox-manifest.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
