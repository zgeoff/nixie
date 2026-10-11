import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLiveDeployment } from './load-live-deployment';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-live-deployment-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, stub: join(import.meta.dir, 'run-stub-kubectl.ts') };
}

test('it loads the pod’s configuration and manifest and the cluster’s addresses', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'replies.json'),
    JSON.stringify({
      '/etc/nixie/config.yaml': [
        'models:',
        '  profiles:',
        '    chat: { base_url: https://api.anthropic.com, credential: deployment:anthropic, auth_header: x-api-key, model: claude-sonnet-5-5, effort: medium }',
        '  roles: { conversation: chat }',
        'imp: { url: https://impd.example.com, host_addresses: [192.0.2.10/32], egress_deny: [10.42.0.0/16] }',
        'definitions: { source: { kind: path, path: /definitions } }',
      ].join('\n'),
      '/app/sandbox-manifest.json': [
        '{"conversation":"ghcr.io/zgeoff/nixie-conversation@sha256:1111111111111111111111111111111111111111111111111111111111111111",',
        '"fetch":"ghcr.io/zgeoff/nixie-fetch@sha256:2222222222222222222222222222222222222222222222222222222222222222"}',
      ].join(''),
      'jsonpath={.items[*].status.addresses[?(@.type=="InternalIP")].address}':
        '192.0.2.10 192.0.2.11',
      'jsonpath={.items[*].status.addresses[?(@.type=="ExternalIP")].address}': '203.0.113.7',
      'jsonpath={.status.podIP}': '10.42.0.7',
      'jsonpath={.spec.clusterIP}': '10.43.0.20\n',
    }),
  );

  const deployment = await loadLiveDeployment({
    argv: [process.execPath, ctx.stub, '--replies', join(ctx.dir, 'replies.json')],
    kubeconfig: '/tmp/kubeconfig',
    namespace: 'nixie',
  });

  expect(deployment).toMatchObject({
    config: {
      imp: {
        url: 'https://impd.example.com',
        publicEgress: { hostAddresses: ['192.0.2.10/32'], egressDeny: ['10.42.0.0/16'] },
      },
    },
    images: {
      fetch: {
        name: 'nixie-fetch-222222222222',
        ref: 'ghcr.io/zgeoff/nixie-fetch@sha256:2222222222222222222222222222222222222222222222222222222222222222',
      },
    },
    nodeAddresses: ['192.0.2.10', '192.0.2.11', '203.0.113.7'],
    podAddress: '10.42.0.7',
    serviceAddress: '10.43.0.20',
  });
});

test('it refuses a configuration the schema refuses', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'replies.json'),
    JSON.stringify({
      '/etc/nixie/config.yaml': 'models: {}\n',
      '/app/sandbox-manifest.json': '{}',
      'jsonpath={.items[*].status.addresses[?(@.type=="InternalIP")].address}': '',
      'jsonpath={.items[*].status.addresses[?(@.type=="ExternalIP")].address}': '',
      'jsonpath={.status.podIP}': '',
      'jsonpath={.spec.clusterIP}': '',
    }),
  );

  expect(
    loadLiveDeployment({
      argv: [process.execPath, ctx.stub, '--replies', join(ctx.dir, 'replies.json')],
      kubeconfig: '/tmp/kubeconfig',
      namespace: 'nixie',
    }),
  ).rejects.toThrow();
});
