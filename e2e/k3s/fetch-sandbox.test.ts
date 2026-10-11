import { expect, test } from 'bun:test';
import { fetchImageArgv, startWebFetch } from '../../apps/server/src/index';
import { buildConnectProbe } from '../../apps/server/src/test-utils/build-connect-probe';
import { buildSandboxSpec } from '../../modules/sandbox/src/index';
import { findUncoveredAddresses } from './test-utils/find-uncovered-addresses';
import { loadLiveDeployment } from './test-utils/load-live-deployment';
import { parseLiveEnv } from './test-utils/parse-live-env';
import { requireLiveValue } from './test-utils/require-live-value';
import { startLiveSandboxAdapter } from './test-utils/start-live-sandbox-adapter';

// A live check against a deployed nixie, which docs/runbooks/live-checks.md runs. It skips unless
// the kubeconfig and an impd token are set, and builds its own fetch sandboxes as nixie does.
const live = parseLiveEnv(process.env);

async function setupTest() {
  const kubectl = requireLiveValue(live.kubectl, 'NIXIE_LIVE_KUBECONFIG');
  const token = requireLiveValue(live.impdToken, 'NIXIE_LIVE_IMPD_TOKEN');
  const deployment = await loadLiveDeployment(kubectl);
  const sandboxes = await startLiveSandboxAdapter({
    url: deployment.config.imp.url,
    token,
    publicEgress: deployment.config.imp.publicEgress,
  });

  return {
    adapter: sandboxes.adapter,
    stack: sandboxes.stack,
    deployment,
    deniedRanges: [
      ...(deployment.config.imp.publicEgress?.hostAddresses ?? []),
      ...(deployment.config.imp.publicEgress?.egressDeny ?? []),
    ],
  };
}

const hasLiveTarget = live.kubectl !== null && live.impdToken !== null;

test.skipIf(!hasLiveTarget)(
  'it lists every node, pod and service address of the cluster as internal',
  async () => {
    const ctx = await setupTest();

    expect(
      findUncoveredAddresses(
        [...ctx.deployment.nodeAddresses, ctx.deployment.podAddress, ctx.deployment.serviceAddress],
        ctx.deniedRanges,
      ),
    ).toStrictEqual([]);
  },
  60_000,
);

test.skipIf(!hasLiveTarget)(
  'it fetches a public page through a fetch sandbox on the deployment’s fetch image',
  async () => {
    const ctx = await setupTest();
    const webFetch = startWebFetch({
      adapter: ctx.adapter,
      image: ctx.deployment.images.fetch.name,
      argv: fetchImageArgv,
      deniedRanges: ctx.deniedRanges,
      config: ctx.deployment.config.web_fetch,
    });

    ctx.stack.defer(() => webFetch.stop());

    const outcome = await webFetch.tool.run(
      {
        callID: 'call-1',
        tool: 'web_fetch',
        input: { url: 'https://example.com/' },
        toolUseID: null,
      },
      {
        run: {
          runID: 'live-check',
          thread: 'conversation',
          tools: ['web_fetch'],
          model: { model: 'live-check', profile: 'live-check' },
        },
      },
    );

    expect(outcome).toMatchObject({
      status: 'ok',
      result: {
        url: 'https://example.com/',
        status: 200,
        text: expect.toInclude('Example Domain'),
      },
    });
  },
  180_000,
);

test.skipIf(!hasLiveTarget)(
  'it lets a fetch sandbox reach the internet and never impd, the node, the pod and service ranges or the tailnet',
  async () => {
    const ctx = await setupTest();
    const sandbox = await ctx.adapter.create(
      buildSandboxSpec({
        kind: 'fetch',
        image: ctx.deployment.images.fetch.name,
        owner: 'live-check',
        limits: ctx.deployment.config.web_fetch.sandboxLimits,
      }),
    );

    ctx.stack.defer(() => sandbox.destroy());

    const impd = new URL(ctx.deployment.config.imp.url);
    const impdPort =
      impd.port === '' && impd.protocol === 'https:' ? 443 : Number(impd.port || '80');

    // the guest cannot resolve impd's name, so this machine resolves it; each target holds a
    // listener, so only the network can refuse the guest's connection
    const impdAddresses = await Bun.dns.lookup(impd.hostname);
    const hostAddresses = ctx.deployment.config.imp.publicEgress?.hostAddresses ?? [];
    const targets: readonly (readonly [string, number])[] = [
      ...impdAddresses.map((entry) => [entry.address, impdPort] as const),
      ...hostAddresses.map((range) => [range.split('/')[0] ?? '', impdPort] as const),

      // the kubelet listens on every node, and nixie on its pod and its Service
      ...ctx.deployment.nodeAddresses.map((address) => [address, 10_250] as const),
      [ctx.deployment.podAddress, 8080],
      [ctx.deployment.serviceAddress, 8080],

      // imp sends every guest packet for port 53 to impd's resolver, so the tailnet probe uses 80
      [live.tailnetAddress, 80],
    ];
    const runProbe = async ([host, port]: readonly [string, number]) => {
      const result = await sandbox.exec(buildConnectProbe(fetchImageArgv[0] ?? 'bun', host, port));

      return `${host}:${port} ${new TextDecoder().decode(result.stdout.bytes).trim()}`;
    };

    const control = await runProbe(['1.1.1.1', 443]);
    const outcomes = await Promise.all(targets.map((target) => runProbe(target)));

    expect(control).toBe('1.1.1.1:443 connected');
    expect(outcomes).toSatisfyAll((outcome: string) => /:\d+ failed /u.test(outcome));
  },
  180_000,
);
