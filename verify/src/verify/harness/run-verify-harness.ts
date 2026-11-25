import { startFakeATCGateway } from '@heynixie/coding-atc/test-utils';
import type { ContractClient } from '@heynixie/contract';
import { getDataFilePath } from '@heynixie/log';
import {
  createTestModelGateway,
  testGatewayControlToken,
} from '@heynixie/model-gateway/test-utils';
import type { TestModelGateway } from '@heynixie/model-gateway/test-utils';
import {
  createSpawnedNixie,
  createTestClient,
  readTestBundle,
  startFakeGoogleSite,
} from '@heynixie/server/test-utils';
import type { ScriptedModel } from '@heynixie/testing';
import { createBuiltWeb, createFrontProxy, readWebBuild } from '@heynixie/web/test-utils';
import { buildScriptedReplies } from './build-scripted-replies';
import { localMemoryConfig } from './local-memory-config';
import { readLastModelInput } from './read-last-model-input';
import { runComputerSession } from './run-computer-session';
import { runDeviceLayout } from './run-device-layout';
import { runDeviceShow } from './run-device-show';
import { sendSpendProbe } from './send-spend-probe';
import { serveControl } from './serve-control';
import { startFakeRateSite } from './start-fake-rate-site';

interface RunningState {
  isRunning: boolean;
}

// The app of the verify CLI's `local` target. It prints one ready line with its endpoints, then a
// line per conversation record for the stream driver, and stops everything on SIGTERM.
export async function runVerifyHarness(): Promise<void> {
  // The stack stops everything and removes the data directory when this function ends: after a
  // stop, which ends the record stream, and after a failed start alike.
  await using stack = new AsyncDisposableStack();

  const stopped = new AbortController();

  process.once('SIGTERM', () => {
    stopped.abort();
  });

  // A start with NIXIE_VERIFY_CODING=1 runs the coding runner on a gateway double, and makes it
  // the runner that task.start advertises: the start tool cannot advertise 2 variants yet, so
  // that start has no sandbox tasks.
  const gateway = process.env['NIXIE_VERIFY_CODING'] === '1' ? startFakeATCGateway() : null;

  if (gateway !== null) {
    stack.defer(() => gateway.stop());
  }

  // A start with NIXIE_VERIFY_SPEND=1 sends every model request through a spending gateway with 2
  // routes: the profile's route `scripted`, and the route `second`, whose day limit one reply
  // passes. A rate site answers for the display currency.
  const isSpendOn = process.env['NIXIE_VERIFY_SPEND'] === '1';
  const spend: { gateway: TestModelGateway | null } = { gateway: null };
  const rates = isSpendOn ? startFakeRateSite() : null;

  if (rates !== null) {
    stack.defer(() => rates.stop(true));
  }

  // the test build reaches Google's endpoints at this site, so no journey reaches Google
  const google = startFakeGoogleSite();

  stack.defer(() => google.stop());

  // the test build answers each image call with a stub, so the key is a placeholder
  const nixie = await createSpawnedNixie(stack, {
    googleURL: google.url,
    ...(gateway === null ? {} : { atcURL: gateway.url }),
    memoryConfig: localMemoryConfig,
    ...(rates === null
      ? {}
      : {
          modelCredential: 'sandbox-backend' as const,
          routeModel: async (upstreamURL: string) => {
            const started = await createTestModelGateway({
              upstreamURL,
              periods: {
                zone: 'Australia/Sydney',
                countBySandbox: true,
                secondRoute: { id: 'second', limits: { day: 1.5, month: 50 } },
              },
            });

            spend.gateway = started;

            stack.defer(() => started.stop());

            return { baseURL: started.url, config: buildSpendConfigLines(started, rates.url.href) };
          },
        }),
    extraConfig: [
      'images:',
      '  default: openai',
      '  profiles:',
      '    openai:',
      '      provider: openai',
      '      model: image-test-1',
      '      credential: deployment:images',
      '      prices: { 1024x1024: 40000, 1536x1024: 60000, 1024x1536: 60000 }',
      ...(gateway === null ? [] : buildCodingConfigLines()),
    ],
    extraSecrets: [
      'connector_credentials:',
      '  images: stub-image-key',
      ...(isSpendOn ? ['settings:', `  gateway-control: ${testGatewayControlToken}`] : []),
      ...(gateway === null ? [] : [`atc_token: ${gateway.token}`]),
    ],
  });

  const server = nixie.harness.start();
  const running: RunningState = { isRunning: true };

  void watchExit(server.exited, running);

  const api = await createTestClient(server);
  const webServerPath = await readWebBuild();
  const web = await createBuiltWeb(api.url, webServerPath);

  stack.defer(web.stop);

  const liveOpens = { count: 0 };

  const front = createFrontProxy({
    apiURL: api.url,
    webURL: web.url,
    onAPIRequest: (pathname) => {
      if (pathname === '/rpc/live/follow') {
        liveOpens.count += 1;
      }
    },
  });

  stack.defer(() => front.stop(true));

  const loads = { count: 0 };

  // the page the assistant's browser opens; its .test host resolves to this loopback server only in
  // the test build's browser, so no journey reaches the internet
  const site = Bun.serve({
    port: 0,
    routes: {
      '/': () => {
        loads.count += 1;

        return new Response(
          `<h1>Hello from the page</h1><p>Plain page for the browser. Load ${String(loads.count)}</p>`,
          { headers: { 'content-type': 'text/html' } },
        );
      },
      '/next': new Response('<h1>The next page</h1><p>Second page for the browser.</p>', {
        headers: { 'content-type': 'text/html' },
      }),
    },
  });

  stack.defer(() => site.stop(true));

  const control = serveControl({
    isNixieRunning: () => running.isRunning,
    addReply: (reply) => {
      const replies = buildScriptedReplies(reply);

      nixie.model.addReplies(...replies);

      return replies.length;
    },
    useComputer: (use) =>
      runComputerSession(api.client, nixie.model, {
        input: use,
        siteURL: `http://pages.test:${String(site.port)}/`,
      }),
    showOnDevice: (show) => runDeviceShow(api.client, nixie.model, show),
    layoutOnDevice: (layout) => runDeviceLayout(api.client, nixie.model, layout),
    advanceClock: async (minutes) => {
      await nixie.harness.advance(minutes * 60_000);

      return minutes;
    },
    countModelRequests: (text) => countModelRequests(nixie.model, text),
    probeRoute: (route) => sendSpendProbe(spend.gateway, nixie.model, route),
    readTasks: async () => {
      const listed = await api.client.tasks.list();
      const records = await nixie.readRecords();

      return {
        tasks: listed.tasks.map((task) => ({
          taskID: task.taskID,
          name: task.name,
          state: task.state,
          records: records
            .filter((record) => record.thread === task.taskID)
            .map((record) => record.kind),
        })),
      };
    },
    readModelInput: () => ({ text: readLastModelInput(nixie.model.requests) }),
    readActionProposals: async () => {
      const listed = await api.client.approvals.listItems();

      return {
        proposals: listed.items.flatMap((item) => {
          const tool = /^Run (?<tool>\S+)/u.exec(item.body.approveLabel)?.groups?.['tool'];

          return item.proposal.kind === 'action' && tool !== undefined
            ? [{ proposalID: item.proposal.proposalID, tool }]
            : [];
        }),
      };
    },
    readLiveOpens: () => liveOpens.count,
  });

  stack.defer(() => control.stop(true));

  const bundle = await readTestBundle(true);

  writeLine({
    event: 'ready',
    web: front.url.href,
    control: control.url.href,
    config: nixie.configPath,
    cli: bundle.entry,
    db: getDataFilePath(nixie.dataDir, 'nixie.db'),
  });

  try {
    await writeRecordLines(api.client, stopped.signal);
  } catch (error) {
    // the stop signals the whole process group, so nixie stops and the stream fails
    if (!stopped.signal.aborted) {
      throw error;
    }
  }
}

function buildSpendConfigLines(gateway: TestModelGateway, ratesURL: string): string[] {
  return [
    'spendStop:',
    `  control: ${gateway.control.url}`,
    '  token: deployment:gateway-control',
    `  modelURL: ${gateway.url}`,
    'display:',
    '  currency: AUD',
    `  rates_url: ${ratesURL}`,
  ];
}

function buildCodingConfigLines(): string[] {
  return [
    'coding:',
    '  atc:',
    '    url: https://atc.example.test/mcp',
    '    principal: service:nixie',
    '    token: deployment:atc_token',
    '    targets:',
    '      - { daemon: cloud, target: cloud }',
    '    defaultTarget: cloud/cloud',
  ];
}

async function watchExit(exited: Promise<unknown>, running: RunningState): Promise<void> {
  await exited;

  running.isRunning = false;
}

// how long a check waits for the model to receive text
const modelWaitMs = 10_000;

// A request that the model has not received yet counts too once it arrives, so the wait is for the
// turn that a record wakes.
async function countModelRequests(model: ScriptedModel, text: string): Promise<number> {
  const deadlineMs = Date.now() + modelWaitMs;

  for (;;) {
    const count = model.requests.filter((request) =>
      JSON.stringify(request.body).includes(text),
    ).length;

    if (count > 0 || Date.now() >= deadlineMs) {
      return count;
    }

    await Bun.sleep(100);
  }
}

function writeLine(line: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

// Each record on the conversation thread, in the order nixie wrote them.
async function writeRecordLines(client: ContractClient, signal: AbortSignal): Promise<void> {
  const records = await client.live.follow(
    { afterSequence: 0, thread: 'conversation' },
    { signal },
  );

  for await (const event of records) {
    if (event.kind !== 'record') {
      continue;
    }

    writeLine({
      event: 'record',
      sequence: event.record.sequence,
      kind: event.record.kind,
      text: event.record.message?.text ?? null,
      voidedReply: event.record.voidedReply?.sequence ?? null,
    });
  }
}

if (import.meta.main) {
  await runVerifyHarness();

  process.exit(0);
}
