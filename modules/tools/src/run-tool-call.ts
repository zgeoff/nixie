import type { ContentSource, Decision, Definitions, JSONObject, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import type { DecisionPoint, PolicyDecision } from '@heynixie/policy';
import type { CallToolResult } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';
import { toolCalledCodec } from './tool-called-codec';
import { toolResultCodec } from './tool-result-codec';
import type {
  ActionQueue,
  DirectResult,
  RegisteredTool,
  ResultSources,
  SchemaCheck,
  ToolCall,
  ToolImage,
  ToolRegistry,
  ToolRun,
} from './types';

export interface ToolCallOptions {
  readonly registry: ToolRegistry;
  readonly decide: DecisionPoint;

  readonly log: Log;

  readonly definitions: () => Definitions;
  readonly queue: ActionQueue;

  readonly queuedWaitMs: number;
}

export interface ToolCallRequest {
  readonly tool: string;
  readonly input: JSONObject;
  readonly toolUseID: string | null;
}

export async function runToolCall(
  request: ToolCallRequest,
  run: ToolRun,
  options: ToolCallOptions,
): Promise<CallToolResult> {
  const call: ToolCall = { ...request, callID: crypto.randomUUID() };
  const recorder = makeCallRecorder(call, run, options);
  const registered = options.registry.findTool(call.tool);
  const inputCheck = checkListedInput(registered, call, run);

  if (!inputCheck.isValid) {
    return writeInvalidCall(recorder, inputCheck.errors);
  }

  const policy = options.decide({ tool: call.tool, toolList: run.tools });

  const callSequence = await recorder.writeCall(policy);
  const settled = await runDecidedCall({ policy, registered, call, run, callSequence, options });

  return recorder.writeResult(callSequence, settled);
}

type SettledOutcome = 'result' | 'invalid' | 'denied' | 'error' | 'queued' | 'failed' | 'unknown';

interface Settled {
  readonly outcome: SettledOutcome;
  readonly actionID: string | null;
  readonly sources: ResultSources;
  readonly content: JSONObject;
  readonly reply:
    | {
        readonly kind: 'typed';
        readonly result: JSONObject;
        readonly images: readonly ToolImage[];
      }
    | { readonly kind: 'text'; readonly text: string; readonly isError: boolean };
}

interface CallRecorder {
  readonly writeCall: (policy: PolicyDecision | null) => Promise<number>;
  readonly writeResult: (callSequence: number, settled: Settled) => Promise<CallToolResult>;
}

function makeCallRecorder(call: ToolCall, run: ToolRun, options: ToolCallOptions): CallRecorder {
  const definitions = options.definitions();
  const ids = { callID: call.callID, runID: run.runID, toolUseID: call.toolUseID };
  const recordInput = options.registry.findTool(call.tool)?.definition.recordInput;

  return {
    writeCall: async (policy) => {
      const [written] = await writeRecords(options.log, [
        {
          kind: 'tool_called',
          definitions,
          thread: run.thread,
          payload: toolCalledCodec.encode({
            ...ids,
            tool: call.tool,
            model: run.model.model,
            profile: run.model.profile,
          }),
          erasable: { input: recordInput?.(call.input) ?? call.input },
          ...(policy === null ? {} : { decision: policy.decision }),
        },
      ]);

      invariant(written, 'the log wrote no record for the tool call');

      return written.sequence;
    },
    writeResult: async (callSequence, settled) => {
      const contentSource = pickLeastTrusted(Object.values(settled.sources));

      await writeRecords(options.log, [
        {
          kind: 'tool_result',
          definitions,
          thread: run.thread,
          parent: callSequence,
          payload: toolResultCodec.encode({
            ...ids,
            outcome: settled.outcome,
            actionID: settled.actionID,
            sources: settled.sources,
          }),
          erasable: settled.content,
          ...(contentSource === null ? {} : { contentSource }),
        },
      ]);

      return toCallToolResult(settled);
    },
  };
}

const trustOrder: readonly ContentSource[] = ['untrusted', 'owner_data', 'owner'];

function pickLeastTrusted(sources: readonly ContentSource[]): ContentSource | null {
  return trustOrder.find((source) => sources.includes(source)) ?? null;
}

function toCallToolResult(settled: Settled): CallToolResult {
  const reply = settled.reply;

  if (reply.kind === 'text') {
    return { content: [{ type: 'text', text: reply.text }], isError: reply.isError };
  }

  if (reply.images.length === 0) {
    return { content: [], structuredContent: reply.result };
  }

  return {
    content: [
      { type: 'text', text: JSON.stringify(reply.result) },
      ...reply.images.map((image) => ({
        type: 'image' as const,
        data: Buffer.from(image.bytes).toString('base64'),
        mimeType: image.mediaType,
      })),
    ],
  };
}

// A tool missing from the run's list skips the schema, so its errors never show the tool to the
// model, and the decision point denies the call.
function checkListedInput(
  registered: RegisteredTool | null,
  call: ToolCall,
  run: ToolRun,
): SchemaCheck {
  return registered !== null && run.tools.includes(call.tool)
    ? registered.parseInput(call.input)
    : { isValid: true };
}

async function writeInvalidCall(recorder: CallRecorder, errors: string): Promise<CallToolResult> {
  const callSequence = await recorder.writeCall(null);

  // the errors repeat the input's own keys, which the model chose
  return recorder.writeResult(
    callSequence,
    buildMessage('invalid', errors, { source: 'untrusted' }),
  );
}

interface MessageOptions {
  readonly source?: ContentSource;
  readonly isError?: boolean;
  readonly actionID?: string;
}

function buildMessage(
  outcome: SettledOutcome,
  message: string,
  messageOptions: MessageOptions = {},
): Settled {
  return {
    outcome,
    actionID: messageOptions.actionID ?? null,
    sources: { message: messageOptions.source ?? 'owner_data' },
    content: { message },
    reply: { kind: 'text', text: message, isError: messageOptions.isError ?? true },
  };
}

interface DecidedCall {
  readonly policy: PolicyDecision;
  readonly registered: RegisteredTool | null;
  readonly call: ToolCall;
  readonly run: ToolRun;
  readonly callSequence: number;
  readonly options: ToolCallOptions;
}

function runDecidedCall(decided: DecidedCall): Promise<Settled> {
  const { policy, registered, ...rest } = decided;

  if (policy.decision.outcome === 'deny' || registered === null) {
    const message = `denied: ${policy.sentence ?? 'no rule allowed this call'}`;

    // a registry or scope sentence repeats the tool name, which the model chose
    const source = policy.decision.rule === null ? 'untrusted' : 'owner_data';

    return Promise.resolve(buildMessage('denied', message, { source }));
  }

  return tryRunAllowedCall({ ...rest, registered, decision: policy.decision });
}

interface AllowedCall {
  readonly registered: RegisteredTool;
  readonly decision: Decision;
  readonly call: ToolCall;
  readonly run: ToolRun;

  readonly callSequence: number;
  readonly options: ToolCallOptions;
}

async function tryRunAllowedCall(allowed: AllowedCall): Promise<Settled> {
  try {
    return await runAllowedCall(allowed);
  } catch (error) {
    const message = `the tool ${allowed.registered.definition.name} failed: ${String(error)}`;

    return buildMessage('error', message, { source: 'untrusted' });
  }
}

function runAllowedCall(allowed: AllowedCall): Promise<Settled> {
  return allowed.registered.definition.execution === 'direct'
    ? runDirect(allowed)
    : runQueued(allowed);
}

async function runDirect(allowed: AllowedCall): Promise<Settled> {
  const outcome = await allowed.registered.definition.run(allowed.call, { run: allowed.run });

  // a tool's error can quote what an outside service said, so it counts as outside content
  return outcome.status === 'error'
    ? buildMessage('error', outcome.message, { source: 'untrusted' })
    : buildTypedResult(allowed.registered, outcome, null);
}

function buildTypedResult(
  registered: RegisteredTool,
  typed: DirectResult,
  actionID: string | null,
): Settled {
  const result = typed.result;

  if (!registered.parseOutput(result).isValid) {
    const messageOptions = actionID === null ? {} : { actionID };

    return buildMessage(
      'error',
      `the tool ${registered.definition.name} returned a result outside its output schema`,
      messageOptions,
    );
  }

  return {
    outcome: 'result',
    actionID,
    sources: registered.definition.declaration.results,
    content: { result: typed.record ?? result },
    reply: { kind: 'typed', result, images: typed.images ?? [] },
  };
}

async function runQueued(allowed: AllowedCall): Promise<Settled> {
  const actionID = await allowed.options.queue.enqueue({
    call: allowed.call,
    run: allowed.run,
    decision: allowed.decision,
    callSequence: allowed.callSequence,
  });

  const outcome = await allowed.options.queue
    .waitForOutcome(actionID, allowed.options.queuedWaitMs)
    .catch(() => null);

  if (outcome === null) {
    return buildMessage('queued', `queued as ${actionID}`, { isError: false, actionID });
  }

  if (outcome.outcome === 'done') {
    return buildTypedResult(allowed.registered, outcome, actionID);
  }

  // The tool result record keeps a cancel under failed, because the release before refuses an
  // outcome its record codec does not list, and only the text names the cancel.
  const recorded = outcome.outcome === 'cancelled' ? 'failed' : outcome.outcome;

  return buildMessage(recorded, `action ${actionID} ${outcome.outcome}: ${outcome.reason}`, {
    source: 'untrusted',
    isError: false,
    actionID,
  });
}
