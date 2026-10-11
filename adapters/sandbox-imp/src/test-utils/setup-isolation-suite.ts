import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { buildImpSandboxAdapter } from '../build-imp-sandbox-adapter';
import type { PublicEgressConfig } from '../parse-imp-config';
import type { ImpPort } from '../types';
import { startTestRecorder } from './start-test-recorder';

// the isolation test's secret for the model host; remove succeeds when the secret is gone already
export interface IsolationSecret {
  readonly add: () => Promise<void>;
  readonly remove: () => Promise<void>;
}

export interface IsolationSuiteOptions {
  readonly port: ImpPort;
  readonly publicEgress: PublicEgressConfig | null;
  readonly guestToolPort?: number;
  readonly secret: IsolationSecret;
  readonly conversationSpec: SandboxSpec;

  // the bearer token the tool endpoint takes
  readonly toolToken: string;
}

export interface IsolationSuite {
  readonly adapter: SandboxAdapter;
  readonly conversation: Sandbox;

  // removes every imp the suite's owner holds, then the secret, the recorder and the tool endpoint
  readonly teardown: () => Promise<void>;
}

// Sets up the isolation test's tool endpoint, recorder, secret and conversation imp. Each step
// registers its undo before it runs, and teardown runs every undo even when one fails, so neither a
// failed setup nor a failed test leaves an imp or the secret on the host.
export async function setupIsolationSuite(options: IsolationSuiteOptions): Promise<IsolationSuite> {
  const stack = new AsyncDisposableStack();
  const teardown = () => stack.disposeAsync();

  try {
    const adapter = await setupAdapter(options, stack);

    stack.defer(() => removeOwnedSandboxes(adapter, options.conversationSpec.owner));
    return { adapter, conversation: await adapter.create(options.conversationSpec), teardown };
  } catch (error) {
    await teardown().catch((cleanupError: unknown) => {
      throw new AggregateError(
        [error, cleanupError],
        'the isolation setup and its cleanup failed',
        {
          cause: error,
        },
      );
    });
    throw error;
  }
}

async function setupAdapter(
  options: IsolationSuiteOptions,
  stack: Pick<AsyncDisposableStack, 'defer'>,
): Promise<SandboxAdapter> {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-isolation-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));
  stack.defer(startToolEndpoint(join(dir, 'tools.sock'), options.toolToken));

  const ctx = await startTestRecorder();

  stack.defer(ctx.stop);

  // an add that fails after impd stored the secret still leaves it to remove
  stack.defer(options.secret.remove);
  await options.secret.add();

  return buildImpSandboxAdapter({
    port: options.port,
    recorder: ctx.recorder,
    config: { publicEgress: options.publicEgress },
    toolTarget: () => ({ path: join(dir, 'tools.sock') }),
    ...(options.guestToolPort === undefined ? {} : { guestToolPort: options.guestToolPort }),
  });
}

function startToolEndpoint(socketPath: string, toolToken: string): () => Promise<void> {
  const tools = Bun.serve({
    unix: socketPath,
    fetch: (request) =>
      request.headers.get('authorization') === `Bearer ${toolToken}`
        ? Response.json({ result: { sum: 42 } })
        : new Response('refused', { status: 401 }),
  });

  return () => tools.stop(true);
}

// Destroys every sandbox the recorder still holds for the owner, the conversation and any public
// imp a test made, and reports each failure once all have run.
async function removeOwnedSandboxes(adapter: SandboxAdapter, owner: string): Promise<void> {
  const sandboxes = await adapter.list(owner);
  const results = await Promise.allSettled(sandboxes.map((sandbox) => sandbox.destroy()));
  const errors = results.flatMap((result): unknown[] =>
    result.status === 'rejected' ? [result.reason] : [],
  );

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `${errors.length} of ${sandboxes.length} isolation imps failed to destroy`,
    );
  }
}
