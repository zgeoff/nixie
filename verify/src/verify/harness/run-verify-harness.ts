import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { startFakeATCGateway } from '@heynixie/coding-atc/test-utils';
import type { ContractClient } from '@heynixie/contract';
import { getDataFilePath } from '@heynixie/log';
import { startStandInMcpLoopback } from '@heynixie/mcp/test-utils';
import {
  createTestModelGateway,
  testGatewayControlToken,
} from '@heynixie/model-gateway/test-utils';
import type { TestModelGateway } from '@heynixie/model-gateway/test-utils';
import {
  connectTestGoogle,
  createSpawnedNixie,
  createTestClient,
  readTestBundle,
  startDeviceTestSite,
  startFakeGoogleSite,
} from '@heynixie/server/test-utils';
import type { ScriptedModel } from '@heynixie/testing';
import {
  buildFakeMicrophoneScript,
  buildLoopbackPeerScript,
  createBuiltWeb,
  createFrontProxy,
  readWebBuild,
} from '@heynixie/web/test-utils';
import { approveHeldInstall } from './approve-held-install';
import { approveHeldMandate } from './approve-held-mandate';
import { approveHeldMcp } from './approve-held-mcp';
import { approveHeldRegion } from './approve-held-region';
import { buildScriptedReplies } from './build-scripted-replies';
import { collectActionProposals } from './collect-action-proposals';
import { collectGuestAddresses } from './collect-guest-addresses';
import { localMemoryConfig } from './local-memory-config';
import { readLastModelInput } from './read-last-model-input';
import type { CallState } from './run-call-step';
import { runCallStep } from './run-call-step';
import { runComputerSession } from './run-computer-session';
import { runDeviceLayout } from './run-device-layout';
import { runDeviceShow } from './run-device-show';
import { sendSpendProbe } from './send-spend-probe';
import { serveControl } from './serve-control';
import { startFakeRateSite } from './start-fake-rate-site';
import { trustSite } from './trust-site';

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

  // A start with NIXIE_VERIFY_CODING=1 runs the coding runner on a gateway double, so the
  // conversation's coding.start tool starts a session on it.
  const gateway = process.env['NIXIE_VERIFY_CODING'] === '1' ? startFakeATCGateway() : null;

  if (gateway !== null) {
    stack.defer(() => gateway.stop());
  }

  // A start with NIXIE_VERIFY_SPEND=1 sends every model request through a spending gateway with 2
  // routes: the profile's route `scripted`, and the route `second`, which has no limit of its own and
  // is on the provider `reserve`, whose day limit one reply passes. A rate site answers for the display currency.
  const isSpendOn = process.env['NIXIE_VERIFY_SPEND'] === '1';
  const spend: { gateway: TestModelGateway | null } = { gateway: null };
  const rates = isSpendOn ? startFakeRateSite() : null;

  if (rates !== null) {
    stack.defer(() => rates.stop(true));
  }

  // A start with NIXIE_VERIFY_MAIL=1 gives nixie its own mailbox, on a host in memory.
  const hasMail = process.env['NIXIE_VERIFY_MAIL'] === '1';

  // A start with NIXIE_VERIFY_PHONE=1 gives nixie its own phone, on a provider in memory.
  const hasPhone = process.env['NIXIE_VERIFY_PHONE'] === '1';

  // A start with NIXIE_VERIFY_MCP=1 adds an MCP server to nixie's config: a stand-in on a loopback
  // port, with its own authorization server, that lists one tool.
  const mcp =
    process.env['NIXIE_VERIFY_MCP'] === '1'
      ? startStandInMcpLoopback({
          tools: [
            {
              name: 'lookup',
              description: 'Look up an issue by its number',
              inputSchema: { type: 'object', properties: { number: { type: 'integer' } } },
              annotations: { readOnlyHint: true },
            },
          ],
        })
      : null;

  if (mcp !== null) {
    stack.defer(() => mcp.stop());
  }

  // the test build reaches Google's endpoints at this site, so no journey reaches Google
  const google = await startFakeGoogleSite();

  stack.defer(() => google.stop());

  // the tide page and the package registry that a device page reaches, on a loopback address that
  // the test build's fetch stand-in reads in place of the web
  const deviceSite = startDeviceTestSite();

  stack.defer(() => deviceSite.stop());

  // the test build answers each image call with a stub, so the key is a placeholder
  // A start with NIXIE_VERIFY_CALLS=1 turns calls on, with the test build's fake speech layer.
  const isCallsOn = process.env['NIXIE_VERIFY_CALLS'] === '1';

  // A start with NIXIE_VERIFY_NO_COMPUTER=1 leaves the computer's section out of the config.
  const isComputerOff = process.env['NIXIE_VERIFY_NO_COMPUTER'] === '1';

  // A start with NIXIE_VERIFY_NO_DEVICES=1 leaves the devices section out of the config.
  const isDevicesOff = process.env['NIXIE_VERIFY_NO_DEVICES'] === '1';

  // A start with NIXIE_VERIFY_NO_IMAGES=1 leaves the images section out of the config.
  const isImagesOff = process.env['NIXIE_VERIFY_NO_IMAGES'] === '1';

  // A start with NIXIE_VERIFY_NO_SEARCH=1 leaves the search section out of the config.
  const isSearchOff = process.env['NIXIE_VERIFY_NO_SEARCH'] === '1';

  // A start with NIXIE_VERIFY_NO_GOOGLE=1 connects the fake Google account, then takes the google
  // section out of the config and starts nixie again on the same data, so a stored connection meets
  // a nixie that has no Google.
  const isGoogleDropped = process.env['NIXIE_VERIFY_NO_GOOGLE'] === '1';

  const nixie = await createSpawnedNixie(stack, {
    ...(isComputerOff ? { isComputerOff: true } : {}),
    ...(isDevicesOff ? { isDevicesOff: true } : {}),
    ...(isCallsOn ? { voicePricePerMinute: 0.05 } : { isVoiceOff: true }),
    googleURL: google.url,
    fetchSiteURL: deviceSite.url,
    googleAPI: google.api,
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
                secondProvider: { id: 'reserve', limits: { day: 1.5, month: 50 } },
                secondRoute: { id: 'second', limits: null, provider: 'reserve' },
              },
            });

            spend.gateway = started;

            stack.defer(() => started.stop());

            return { baseURL: started.url, config: buildSpendConfigLines(started, rates.url.href) };
          },
        }),
    extraConfig: [
      ...(isImagesOff
        ? []
        : [
            'images:',
            '  default: openai',
            '  profiles:',
            '    openai:',
            '      provider: openai',
            '      model: image-test-1',
            '      credential: deployment:images',
            '      prices: { 1024x1024: 40000, 1536x1024: 60000, 1024x1536: 60000 }',
          ]),
      ...(isSearchOff
        ? []
        : ['search:', '  credential: deployment:search', '  api_url: https://search.test']),
      'web_fetch:',
      '  package_registry: https://registry.test',
      ...(gateway === null ? [] : buildCodingConfigLines()),
      ...(hasMail ? buildMailConfigLines() : []),
      ...(hasPhone ? buildPhoneConfigLines() : []),
      ...(mcp === null ? [] : buildMcpConfigLines(mcp.mcpURL, mcp.clientID)),
    ],
    extraSecrets: [
      'connector_credentials:',
      '  images: stub-image-key',
      '  search: stub-search-key',
      '  twilio: stub-twilio-secret',
      ...(isSpendOn ? ['settings:', `  gateway-control: ${testGatewayControlToken}`] : []),
      ...(gateway === null ? [] : [`atc_token: ${gateway.token}`]),
    ],
  });

  // A start with NIXIE_VERIFY_HOLD_SPAWNS=1 adds a rule that asks before the coding spawn that
  // follows an approved start, so the spawn waits behind a card of its own.
  if (gateway !== null && process.env['NIXIE_VERIFY_HOLD_SPAWNS'] === '1') {
    await writeFile(
      join(dirname(nixie.configPath), 'definitions', 'rules', 'hold-spawns.yaml'),
      'ask-coding-spawns:\n  outcome: ask\n  tools: [coding.spawn]\n',
    );
  }

  // how far the harness moved nixie's clock, which stamps a Gmail mail so it falls after its rule
  const advancedMs = { total: 0 };

  // the requests that the fake Gmail answered before nixie's last start
  const gmailBaseline = { requests: 0 };
  let server = nixie.harness.start();

  let api = await createTestClient(server);

  if (isGoogleDropped) {
    await connectTestGoogle(api);

    await server.sendStopSignal();
    await server.waitForExit();

    const config = await readFile(nixie.configPath, 'utf8');

    await writeFile(nixie.configPath, config.replace('\ngoogle: {}', ''));

    server = nixie.harness.start();

    api = await createTestClient(server, { token: api.token });

    gmailBaseline.requests = google.gmail.requests.length;
  }

  const running: RunningState = { isRunning: true };

  void watchExit(server.exited, running);

  const webServerPath = await readWebBuild();
  const web = await createBuiltWeb(api.url, webServerPath);

  stack.defer(web.stop);

  const liveOpens = { count: 0 };

  const front = createFrontProxy({
    apiURL: api.url,
    webURL: web.url,

    // a browser that has no microphone gets a silent one, and its peer connection an end that
    // answers, so a call can start and connect in the browser
    ...(isCallsOn
      ? {
          headScript: `${buildFakeMicrophoneScript({ answer: 'allow' })}\n${buildLoopbackPeerScript()}`,
        }
      : {}),
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

  const callState: CallState = { callID: null, gate: null };

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
    layoutOnDevice: (layout) => {
      // the owner's answers, which the journey's browser holds a device session too narrow to give
      if (layout.step === 'approve') {
        return approveHeldRegion(api.client);
      }

      if (layout.step === 'approve-install') {
        return approveHeldInstall((operation, args) => server.request(operation, args));
      }

      return runDeviceLayout(api.client, nixie.model, { ...layout, step: layout.step });
    },
    trustSite: (domain, trust) =>
      trustSite((operation, args) => server.request(operation, args), domain, trust),
    approveHeldMandate: () =>
      approveHeldMandate((operation, args) => server.request(operation, args)),
    approveHeldMcp: (label) =>
      approveHeldMcp((operation, args) => server.request(operation, args), label),
    runCallStep: (call) =>
      runCallStep(
        {
          client: api.client,
          model: nixie.model,
          advanceClock: (durationMs) => nixie.harness.advance(durationMs),
          startCall: () => server.request('placeHarnessCall', null),
          emitSpeech: (event) =>
            server.request('emitSpeech', { sessionID: 'fake-session-1', event }),
          readSpeechCalls: () => server.request('readSpeechCalls', null),
          readStartedCallID: async () => {
            const records = await nixie.readRecords();

            return (
              records.findLast((record) => record.kind === 'call.started')?.payload['callID'] ??
              null
            );
          },
        },
        callState,
        call.step,
      ),
    deliverMail: async (mail) => {
      await server.request('deliverMail', mail);
    },
    deliverText: async (text) => {
      await server.request('deliverText', text);
    },
    setSessionState: (state) => {
      if (gateway === null) {
        throw new Error('the harness runs no coding gateway: start it with NIXIE_VERIFY_CODING=1');
      }

      for (const session of gateway.sessions.values()) {
        session.state = state;
      }

      return gateway.sessions.size;
    },
    readGmailRequests: () => ({ requests: google.gmail.requests.length - gmailBaseline.requests }),
    deliverGmail: (mail) => {
      google.gmail.seed({ ...mail, sentAtMs: Date.now() + advancedMs.total });
    },
    advanceClock: async (minutes) => {
      await nixie.harness.advance(minutes * 60_000);

      advancedMs.total += minutes * 60_000;

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
      const records = await nixie.readRecords();

      return { proposals: collectActionProposals(listed.items, records) };
    },
    readLiveOpens: () => liveOpens.count,
    readCalendarWrites: () => ({
      writes: google.calendar.writes.map((write) => {
        const event = google.calendar.events.get(write.calendar)?.get(write.id);

        return {
          method: write.method,
          sendUpdates: write.sendUpdates,
          title: typeof event?.['summary'] === 'string' ? event['summary'] : '',
          guests: collectGuestAddresses(event?.['attendees']),
        };
      }),
    }),
    readDriveFiles: () => ({
      files: [...google.drive.files.values()].map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        text: new TextDecoder().decode(file.bytes),
      })),
    }),
    readGmailSent: () => ({
      sent: google.gmail.sent.map((mail) => ({
        to: mail.headers.find(([name]) => name.toLowerCase() === 'to')?.[1] ?? '',
        messageID: mail.headers.find(([name]) => name.toLowerCase() === 'message-id')?.[1] ?? '',
      })),
    }),
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
    '    url: https://atc.example.test',
    '    principal: service:nixie',
    '    token: deployment:atc_token',
    '    targets:',
    '      - { daemon: cloud, target: cloud }',
    '    defaultTarget: cloud/cloud',
  ];
}

function buildMailConfigLines(): string[] {
  return ['mail:', '  address: assistant@nixie.example.org'];
}

function buildPhoneConfigLines(): string[] {
  return [
    'phone:',
    '  number: "+61411111111"',
    '  poll_interval: 1s',
    '  twilio:',
    '    account_sid: AC00000000000000000000000000000000',
    '    api_key_sid: SK00000000000000000000000000000000',
    '    credential: deployment:twilio',
  ];
}

function buildMcpConfigLines(url: string, clientID: string): string[] {
  return [
    'mcp:',
    '  servers:',
    '    tracker:',
    `      url: ${url}`,
    `      clientID: ${clientID}`,
    '      scope: read write',
    '      privateRange: 127.0.0.0/8',
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
