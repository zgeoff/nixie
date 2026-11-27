import { expect, test } from 'bun:test';
import { buildDeviceTools, startPageFetches } from '@heynixie/devices';
import { startTestDevices } from '@heynixie/devices/test-utils';
import type { RuleEntry } from '@heynixie/policy';
import { makeDecisionPoint } from '@heynixie/policy';
import { waitForCondition } from '@heynixie/testing';
import type { ToolCallOptions, ToolRun } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildStubActionQueue } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';

// device.region runs through the policy module's decision point, which judges the host of each
// declared fetch as a destination of a read, and the runner starts only the fetches of a page that
// the call showed
async function setupTest(rules: readonly RuleEntry[]) {
  const ctx = await startTestDevices({ fetching: { allowedHosts: ['tides.example'] } });
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const tools = buildDeviceTools({
    log: ctx.log,
    definitions: ctx.definitions,
    clock: ctx.clock,
    streams: ctx.streams,
    readCallSession: ctx.readCallSession,
    fetching: ctx.site.fetching,
  });

  const regionTool = tools.find((tool) => tool.name === 'device.region');

  invariant(regionTool, 'the device tools hold device.region');

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: tools.map((tool) => tool.name),
    model: { model: 'model-a', profile: 'chat-direct' },
    stepRunID: 'conversation@1',
  };

  const decide = makeDecisionPoint({
    findDeclaration: (tool) => (tool === 'device.region' ? regionTool.declaration : null),
    readInputs: () => Promise.resolve({ rules, places: [], tools: new Map() }),
    findTaskDestinations: () => [],
    readConsent: () => Promise.resolve(null),
  });

  const toolOptions: ToolCallOptions = {
    registry: buildToolRegistry(tools),
    decide,
    log: ctx.log,
    definitions: ctx.definitions,
    queue: buildStubActionQueue().queue,
    queuedWaitMs: 10_000,
  };

  return {
    ...ctx,
    device,
    showPage: (url: string) =>
      runToolCall(
        {
          tool: 'device.region',
          input: {
            device: device.deviceID,
            region: 'pond',
            content: { kind: 'html', html: '<p>tides</p>', fetches: [{ url }] },
          },
          toolUseID: 'toolu_1',
        },
        run,
        toolOptions,
      ),
    readPond: async () => {
      const layout = await ctx.readLayout(device.deviceID);

      return layout?.regions.find((region) => region.name === 'pond')?.shown ?? null;
    },

    // starts the runner and waits for it to finish its first pass, when it sleeps
    runFetches: async () => {
      const stop = startPageFetches({
        log: ctx.log,
        clock: ctx.clock,
        streams: ctx.streams,
        fetching: ctx.site.fetching,
        onFailure: (error) => {
          throw error;
        },
      });

      ctx.stack.defer(stop);

      await waitForCondition(() => ctx.clock.countPending() > 0);
    },
  };
}

test('it neither shows the page nor sends a request when a rule denies the host of a new call', async () => {
  const ctx = await setupTest([
    {
      id: 'deny-tides',
      revision: 2,
      rule: {
        id: 'deny-tides',
        outcome: 'deny',
        effects: ['read'],
        destinations: ['tides.example'],
      },
    },
  ]);

  ctx.site.addPage('https://tides.example/today', '{"high":"14:05"}');

  await ctx.showPage('https://tides.example/today');
  await ctx.runFetches();

  expect([await ctx.readPond(), ctx.site.requests]).toStrictEqual([null, []]);
});

test('it fetches the page that a rule allows the host of, as the control of the denial', async () => {
  const ctx = await setupTest([
    {
      id: 'allow-tides',
      revision: 2,
      rule: {
        id: 'allow-tides',
        outcome: 'allow',
        effects: ['note', 'read'],
        destinations: ['tides.example'],
      },
    },
  ]);

  ctx.site.addPage('https://tides.example/today', '{"high":"14:05"}');

  await ctx.showPage('https://tides.example/today');
  await ctx.runFetches();

  expect(ctx.site.requests).toStrictEqual(['https://tides.example/today']);
});
