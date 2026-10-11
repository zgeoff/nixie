import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { createConversationTask, tasksProjections } from '@heynixie/tasks';
import type { TestClock } from '@heynixie/testing';
import { buildTestClock } from '@heynixie/testing';
import { apiProjections } from '../api-projections';
import { buildAPIApp } from '../build-api-app';
import { defaultAPISettings } from '../default-api-settings';
import type { APIContext } from '../types';

interface TestAPI {
  readonly dataDir: string;
  readonly writer: Writer;
  readonly clock: TestClock;
  readonly context: APIContext;

  // the API's origin on a loopback port, such as http://127.0.0.1:41234
  readonly url: string;
}

// Starts the API as the server would on a fresh data directory, with the conversation's task, a test
// clock at 1,000,000 ms and the default settings, served on a loopback port. When the test finishes
// it stops the server and the writer, then removes the directory.
export async function startTestAPI(): Promise<TestAPI> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(`${tmpdir()}/nixie-api-`);

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const context = await buildTestContext(writer);
  const app = buildAPIApp(context).listen({ hostname: '127.0.0.1', port: 0 });

  stack.defer(async () => {
    await app.stop(true);
  });
  return {
    dataDir,
    writer,
    clock: context.clock,
    context,
    url: `http://127.0.0.1:${app.server?.port}`,
  };
}

async function buildTestContext(
  writer: Writer,
): Promise<APIContext & { readonly clock: TestClock }> {
  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const context = {
    log: {
      writer,
      deploymentKey,
      projections: [...logProjections, ...tasksProjections, ...apiProjections],
    },
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    settings: defaultAPISettings,
  };

  await createConversationTask(context);
  return context;
}
