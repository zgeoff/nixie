import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { Sandbox, SandboxAdapter, SandboxSpec } from '@heynixie/sandbox';
import { buildSandboxSpec, sandboxSizes } from '@heynixie/sandbox';
import type { ToolCall, ToolContext, ToolOutcome } from '@heynixie/tools';
import type { TimeLimit } from '../utils/wait-or-time-out';
import { waitOrTimeOut } from '../utils/wait-or-time-out';
import type { CodeRunInput } from './code-run-input';
import { parseCodeRunInput } from './code-run-input';
import { codeRunLimits } from './code-run-limits';
import { codeRunMessages } from './code-run-messages';
import { codeRunOwnerPrefix } from './destroy-code-run-sandboxes';
import { destroyCodeSandbox } from './destroy-code-sandbox';
import { finishCodeRun } from './finish-code-run';
import type { CodeRunTracking } from './get-code-run-tracker';
import { getCodeRunTracker } from './get-code-run-tracker';
import type { CodeRunSlots } from './make-code-run-slots';
import type { CodeRunInputDeps, ResolvedInputs } from './resolve-code-run-inputs';
import { resolveCodeRunInputs } from './resolve-code-run-inputs';
import { runCodeProgram } from './run-code-program';

export interface CodeRunDeps extends CodeRunInputDeps {
  readonly adapter: SandboxAdapter;
  readonly clock: Clock;
  readonly logger: Logger;

  // the code image's name in the sandbox runtime
  readonly image: string;

  // the most pixels of an image's longer side that reaches the model
  readonly imageLongEdge: number;
  readonly slots: CodeRunSlots;
}

// Runs one code call: it takes a slot, resolves every input, runs the program in a sandbox of its
// own, and destroys the sandbox on every way out.
export async function runCodeRun(
  deps: CodeRunDeps,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const parsed = parseCodeRunInput(call.input);

  if (parsed.kind === 'refused') {
    return { status: 'error', message: parsed.message };
  }

  if (!deps.slots.take()) {
    return { status: 'error', message: codeRunMessages.runsAtOnce };
  }

  const state = { isSandboxed: false };
  const tracking = getCodeRunTracker(deps.adapter).start(call.callID);

  try {
    const resolution = await resolveCodeRunInputs(deps, context.run, parsed.input);

    if (resolution.kind === 'refused') {
      return { status: 'error', message: resolution.message };
    }

    state.isSandboxed = true;

    return await runInSandbox(deps, {
      call,
      context,
      input: parsed.input,
      inputs: resolution.inputs,
      tracking,
    });
  } finally {
    tracking.end();

    // a call that reached its sandbox frees the slot once the sandbox is destroyed
    if (!state.isSandboxed) {
      deps.slots.release();
    }
  }
}

interface SandboxedCall {
  readonly call: ToolCall;
  readonly context: ToolContext;
  readonly input: CodeRunInput;
  readonly inputs: ResolvedInputs;
  readonly tracking: CodeRunTracking;
}

async function runInSandbox(deps: CodeRunDeps, sandboxed: SandboxedCall): Promise<ToolOutcome> {
  const limit = {
    clock: deps.clock,
    deadline: deps.clock.now() + codeRunLimits.callMs,
    message: codeRunMessages.callTimeout,
  };

  const creating = deps.adapter.create(buildCodeRunSpec(deps, sandboxed.call));

  const created = await createWithinLimit(creating, limit);

  if (created.kind === 'failed') {
    void destroyLateSandbox(deps, creating);
    deps.logger('code_run.create_failed', toErrorFields(created.error), 'warn');

    return {
      status: 'error',
      message: isTimeout(created.error) ? codeRunMessages.callTimeout : codeRunMessages.startFailed,
    };
  }

  const sandbox = created.sandbox;

  // a forget that came while the sandbox was being created found none to destroy
  if (sandboxed.tracking.isForgotten()) {
    await destroyCodeSandbox(deps, sandbox, () => {
      deps.slots.release();
    });

    return { status: 'error', message: codeRunMessages.sessionEnded };
  }

  const stop = new AbortController();

  const outcome = { isTimedOut: false };

  try {
    return await waitOrTimeOut(runInCreatedSandbox(deps, sandbox, sandboxed, stop), limit);
  } catch (error) {
    stop.abort();

    outcome.isTimedOut = isTimeout(error);

    deps.logger('code_run.failed', { sandbox: sandbox.id, ...toErrorFields(error) }, 'warn');

    return {
      status: 'error',
      message: isTimeout(error) ? codeRunMessages.callTimeout : codeRunMessages.runFailed,
      hidden: { sandbox: sandbox.id },
    };
  } finally {
    const destroying = destroyCodeSandbox(deps, sandbox, () => {
      deps.slots.release();
    });

    // a call past its limit returns at the limit, and the destroy goes on in the background
    if (outcome.isTimedOut) {
      void destroying;
    } else {
      await destroying;
    }
  }
}

function buildCodeRunSpec(deps: CodeRunDeps, call: ToolCall): SandboxSpec {
  return buildSandboxSpec({
    kind: 'code_run',
    image: deps.image,
    owner: `${codeRunOwnerPrefix}${call.callID}`,
    limits: sandboxSizes.codeRun,
  });
}

type CreatedSandbox =
  | { readonly kind: 'created'; readonly sandbox: Sandbox }
  | { readonly kind: 'failed'; readonly error: unknown };

async function createWithinLimit(
  creating: Promise<Sandbox>,
  limit: TimeLimit,
): Promise<CreatedSandbox> {
  try {
    return { kind: 'created', sandbox: await waitOrTimeOut(creating, limit) };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

// A create that outlasts its limit still makes a sandbox, which goes as soon as it arrives.
async function destroyLateSandbox(deps: CodeRunDeps, creating: Promise<Sandbox>): Promise<void> {
  try {
    const late = await creating;

    await destroyCodeSandbox(deps, late, () => {
      deps.slots.release();
    });
  } catch {
    deps.slots.release();
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === codeRunMessages.callTimeout;
}

async function runInCreatedSandbox(
  deps: CodeRunDeps,
  sandbox: Sandbox,
  sandboxed: SandboxedCall,
  stop: AbortController,
): Promise<ToolOutcome> {
  const program = await runCodeProgram({
    sandbox,
    clock: deps.clock,
    input: sandboxed.input,
    inputs: sandboxed.inputs,
    stop,
  });

  return finishCodeRun({
    program,
    run: sandboxed.context.run,
    sandboxID: sandbox.id,
    skills: sandboxed.inputs.skills,
    imageLongEdge: deps.imageLongEdge,
  });
}
