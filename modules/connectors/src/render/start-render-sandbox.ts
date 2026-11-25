import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec } from '@heynixie/sandbox';
import type { RenderRequest } from '@heynixie/wire';
import { decodeRenderReply, encodeRenderMessage, renderFrameLimitBytes } from '@heynixie/wire';
import type { TimeLimit } from '../utils/wait-or-time-out';
import { waitOrTimeOut } from '../utils/wait-or-time-out';

export interface RenderSandboxOptions {
  readonly adapter: SandboxAdapter;
  readonly image: string;
  readonly argv: readonly string[];
  readonly sandboxLimits: SandboxLimits;

  // the time one render may take, from the sandbox's creation to its picture
  readonly renderTimeoutMs?: number;

  readonly clock?: Clock;
}

export type RenderOutcome =
  | {
      readonly kind: 'picture';
      readonly png: Uint8Array<ArrayBuffer>;
      readonly refused: readonly string[];
    }
  | { readonly kind: 'failed'; readonly reason: string };

export interface RenderSandbox {
  // Draws the request in a new render sandbox, and destroys the sandbox after. A second call
  // waits for the first, so one render runs at a time.
  readonly draw: (request: RenderRequest) => Promise<RenderOutcome>;

  readonly stop: () => Promise<void>;
}

interface RenderState {
  queue: Promise<void>;
  isStopped: boolean;

  // true until a sweep removes the render sandboxes a past process or a failed destroy left
  needsSweep: boolean;
}

export function startRenderSandbox(options: RenderSandboxOptions): RenderSandbox {
  const state: RenderState = { queue: Promise.resolve(), isStopped: false, needsSweep: true };

  return {
    draw: async (request) => {
      const previous = state.queue;
      const ended = Promise.withResolvers<void>();

      state.queue = ended.promise;

      await previous;

      try {
        if (state.isStopped) {
          return { kind: 'failed', reason: 'the render sandbox is stopped' };
        }

        return await runRender(options, state, request);
      } finally {
        ended.resolve();
      }
    },
    stop: async () => {
      state.isStopped = true;

      await state.queue;
    },
  };
}

const defaultRenderTimeoutMs = 60_000;

async function runRender(
  options: RenderSandboxOptions,
  state: RenderState,
  request: RenderRequest,
): Promise<RenderOutcome> {
  const clock = options.clock ?? systemClock;

  const limit: TimeLimit = {
    clock,
    deadline: clock.now() + (options.renderTimeoutMs ?? defaultRenderTimeoutMs),
    message: 'the render passed its time limit',
  };

  const creating = createRenderSandbox(options, state);

  const sandbox = await waitOrTimeOut(creating, limit).catch((error: unknown) => {
    void removeLateSandbox(creating, state);

    return error instanceof Error ? error : new Error(String(error));
  });

  if (sandbox instanceof Error) {
    return { kind: 'failed', reason: sandbox.message };
  }

  try {
    return await readPicture(sandbox, options, request, limit);
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await destroyOrSweepLater(sandbox, state, limit);
  }
}

// the owner of every render sandbox, which a start reads to remove any a past process left behind
export const renderSandboxOwner = 'device_render';

async function createRenderSandbox(
  options: RenderSandboxOptions,
  state: RenderState,
): Promise<Sandbox> {
  if (state.needsSweep) {
    const leftovers = await options.adapter.list(renderSandboxOwner);

    await Promise.all(leftovers.map((sandbox) => sandbox.destroy()));

    state.needsSweep = false;
  }

  try {
    return await options.adapter.create(
      buildSandboxSpec({
        kind: 'render',
        image: options.image,
        owner: renderSandboxOwner,
        limits: options.sandboxLimits,
      }),
    );
  } catch (error) {
    // an adapter that fails a create after its runtime made the sandbox can fail to remove it too
    state.needsSweep = true;
    throw error;
  }
}

// destroys the sandbox that a create made after its render passed its time limit, once it arrives
async function removeLateSandbox(creating: Promise<Sandbox>, state: RenderState): Promise<void> {
  try {
    const sandbox = await creating;

    await sandbox.destroy();
  } catch {
    state.needsSweep = true;
  }
}

async function readPicture(
  sandbox: Sandbox,
  options: RenderSandboxOptions,
  request: RenderRequest,
  limit: TimeLimit,
): Promise<RenderOutcome> {
  const stream = await waitOrTimeOut(
    sandbox.spawn({ argv: options.argv, maxMessageBytes: renderFrameLimitBytes }),
    limit,
  );

  try {
    await waitOrTimeOut(stream.send(encodeRenderMessage(request)), limit);

    const first = await waitOrTimeOut(
      stream.messages[Symbol.asyncIterator]()
        .next()
        .then((next) => next.value ?? null),
      limit,
    );

    const exit = await waitOrTimeOut(stream.exit, limit);

    if (exit.code !== 0) {
      return {
        kind: 'failed',
        reason: `the render guest exited with ${exit.code ?? exit.signal ?? 'no code'}`,
      };
    }

    if (first === null) {
      return { kind: 'failed', reason: 'the render guest closed its output with no reply' };
    }

    const reply = decodeRenderReply(first);

    return reply.kind === 'failed'
      ? reply
      : {
          kind: 'picture',
          png: new Uint8Array(Buffer.from(reply.base64, 'base64')),
          refused: reply.refused,
        };
  } catch (error) {
    await stream.stop();

    throw error;
  }
}

// a destroy that fails or never ends leaves the sandbox to a sweep before the next create
async function destroyOrSweepLater(
  sandbox: Sandbox,
  state: RenderState,
  limit: TimeLimit,
): Promise<void> {
  try {
    await waitOrTimeOut(sandbox.destroy(), { ...limit, deadline: limit.clock.now() + 30_000 });
  } catch {
    state.needsSweep = true;
  }
}
