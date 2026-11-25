import { startFakeATCGateway } from '@heynixie/coding-atc/test-utils';
import type { ContractClient } from '@heynixie/contract';
import { getDataFilePath } from '@heynixie/log';
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
import type { CallState } from './run-call-step';
import { runCallStep } from './run-call-step';
import { runComputerSession } from './run-computer-session';
import { runDeviceLayout } from './run-device-layout';
import { runDeviceShow } from './run-device-show';
import { serveControl } from './serve-control';

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

  // A start with NIXIE_VERIFY_MAIL=1 gives nixie its own mailbox, on a host in memory.
  const hasMail = process.env['NIXIE_VERIFY_MAIL'] === '1';

  // the test build reaches Google's endpoints at this site, so no journey reaches Google
  const google = startFakeGoogleSite();

  stack.defer(() => google.stop());

  // the test build answers each image call with a stub, so the key is a placeholder
  // A start with NIXIE_VERIFY_CALLS=1 turns calls on, with the test build's fake speech layer.
  const isCallsOn = process.env['NIXIE_VERIFY_CALLS'] === '1';

  const nixie = await createSpawnedNixie(stack, {
    ...(isCallsOn ? { voicePricePerMinute: 0.05 } : {}),
    googleURL: google.url,
    ...(gateway === null ? {} : { atcURL: gateway.url }),
    memoryConfig: localMemoryConfig,
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
      ...(hasMail ? buildMailConfigLines() : []),
    ],
    extraSecrets: [
      'connector_credentials:',
      '  images: stub-image-key',
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
    layoutOnDevice: (layout) => runDeviceLayout(api.client, nixie.model, layout),
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
        },
        callState,
        call.step,
      ),
    deliverMail: async (mail) => {
      await server.request('deliverMail', mail);
    },
    advanceClock: async (minutes) => {
      await nixie.harness.advance(minutes * 60_000);

      return minutes;
    },
    countModelRequests: (text) => countModelRequests(nixie.model, text),
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

function buildMailConfigLines(): string[] {
  return ['mail:', '  address: assistant@nixie.example.org'];
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
