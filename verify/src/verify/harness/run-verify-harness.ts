import type { ContractClient } from '@heynixie/contract';
import { getDataFilePath } from '@heynixie/log';
import { createSpawnedNixie, createTestClient, readTestBundle } from '@heynixie/server/test-utils';
import { createBuiltWeb, createFrontProxy, readWebBuild } from '@heynixie/web/test-utils';
import { buildScriptedReplies } from './build-scripted-replies';
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

  // the test build answers each image call with a stub, so the key is a placeholder
  const nixie = await createSpawnedNixie(stack, {
    extraConfig: [
      'images:',
      '  default: main',
      '  profiles:',
      '    main:',
      '      provider: openai',
      '      model: image-test-1',
      '      credential: deployment:images',
      '      prices: { 1024x1024: 40000, 1536x1024: 60000, 1024x1536: 60000 }',
    ],
    extraSecrets: ['connector_credentials:', '  images: stub-image-key'],
  });

  const server = nixie.harness.start();
  const running: RunningState = { isRunning: true };

  void watchExit(server.exited, running);

  const api = await createTestClient(server);
  const webServerPath = await readWebBuild();
  const web = await createBuiltWeb(api.url, webServerPath);

  stack.defer(web.stop);

  const front = createFrontProxy({ apiURL: api.url, webURL: web.url });

  stack.defer(() => front.stop(true));

  // the page the assistant's browser opens; its .test host resolves to this loopback server only in
  // the test build's browser, so no journey reaches the internet
  const site = Bun.serve({
    port: 0,
    routes: {
      '/': new Response('<h1>Hello from the page</h1><p>Plain page for the browser.</p>', {
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

async function watchExit(exited: Promise<unknown>, running: RunningState): Promise<void> {
  await exited;

  running.isRunning = false;
}

function writeLine(line: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

// Each record on the conversation thread, in the order nixie wrote them.
async function writeRecordLines(client: ContractClient, signal: AbortSignal): Promise<void> {
  const records = await client.records.follow(
    { afterSequence: 0, thread: 'conversation' },
    { signal },
  );

  for await (const event of records) {
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
