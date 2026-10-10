import type { ContentSource, Definitions, JSONObject, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import type { DecisionPoint, PolicyDecision } from '@heynixie/policy';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type {
  ActionQueue,
  RegisteredTool,
  ResultSources,
  ToolCall,
  ToolRegistry,
  ToolRun,
} from './types';

export interface ToolCallOptions {
  readonly registry: ToolRegistry;
  readonly decide: DecisionPoint;

  // a log the call's records append to
  readonly log: Log;

  // the definitions in force, whose snapshot hash the call's records carry
  readonly definitions: () => Definitions;
  readonly queue: ActionQueue;

  // how long an allowed queued call waits for its outcome inside the turn
  readonly queuedWaitMs: number;
}

// A tools/call request as the endpoint received it.
export interface ToolCallRequest {
  readonly tool: string;
  readonly input: JSONObject;
  readonly toolUseID: string | null;
}

// Runs one tool call through the steps every call takes: the input schema, the decision point, the
// tool or the action queue, then the records of the call, its decision and its result. The model
// reads a typed result as structuredContent, and every other outcome as one text block.
export async function runToolCall(
  request: ToolCallRequest,
  run: ToolRun,
  options: ToolCallOptions,
): Promise<CallToolResult> {
  const call: ToolCall = { ...request, callID: crypto.randomUUID() };
  const recorder = makeCallRecorder(call, run, options);
  const registered = options.registry.findTool(call.tool);
  const inputCheck = registered?.parseInput(call.input) ?? { isValid: true };

  if (!inputCheck.isValid) {
    return writeInvalidCall(recorder, inputCheck.errors);
  }

  const policy = options.decide({ tool: call.tool, toolList: run.tools });
  const callSequence = await recorder.writeCall(policy);
  const settled = await runDecidedCall({ policy, registered, call, run, callSequence, options });

  return recorder.writeResult(callSequence, settled);
}

type SettledOutcome = 'result' | 'invalid' | 'denied' | 'error' | 'queued' | 'failed' | 'unknown';

// A settled call: what the result's record holds, and what the model receives.
interface Settled {
  readonly outcome: SettledOutcome;
  readonly actionID: string | null;
  readonly sources: ResultSources;
  readonly content: JSONObject;
  readonly reply:
    | { readonly kind: 'typed'; readonly result: JSONObject }
    | { readonly kind: 'text'; readonly text: string; readonly isError: boolean };
}

interface CallRecorder {
  readonly writeCall: (policy: PolicyDecision | null) => Promise<number>;
  readonly writeResult: (callSequence: number, settled: Settled) => Promise<CallToolResult>;
}

function makeCallRecorder(call: ToolCall, run: ToolRun, options: ToolCallOptions): CallRecorder {
  // one snapshot for both records, so a replay of the decision reads the definitions it ran under
  const definitions = options.definitions();
  const ids = { callID: call.callID, runID: run.runID, toolUseID: call.toolUseID };

  return {
    writeCall: async (policy) => {
      const [written] = await writeRecords(options.log, [
        {
          kind: 'tool_called',
          definitions,
          thread: run.thread,
          payload: { ...ids, tool: call.tool },
          erasable: { input: call.input },
          ...(policy === null ? {} : { decision: policy.decision }),
        },
      ]);

      if (written === undefined) {
        throw new Error('the log wrote no record for the tool call');
      }
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
          payload: {
            ...ids,
            outcome: settled.outcome,
            actionID: settled.actionID,
            sources: settled.sources,
          },
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
  return settled.reply.kind === 'typed'
    ? { content: [], structuredContent: settled.reply.result }
    : { content: [{ type: 'text', text: settled.reply.text }], isError: settled.reply.isError };
}

interface MessageOptions {
  readonly source?: ContentSource;
  readonly isError?: boolean;
  readonly actionID?: string;
}

// A message nixie writes itself, such as a deny or a schema error, comes from nixie's own state.
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

// An input that breaks the schema never reaches the decision point, so its call has no decision.
async function writeInvalidCall(recorder: CallRecorder, errors: string): Promise<CallToolResult> {
  const callSequence = await recorder.writeCall(null);

  return recorder.writeResult(callSequence, buildMessage('invalid', errors));
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

  // the registry stage denies a tool the registry does not hold, so an allowed call has its tool
  if (policy.decision.outcome === 'deny' || registered === null) {
    const message = `denied: ${policy.sentence ?? 'no rule allowed this call'}`;

    return Promise.resolve(buildMessage('denied', message));
  }
  return runAllowedCall({ ...rest, registered });
}

interface AllowedCall {
  readonly registered: RegisteredTool;
  readonly call: ToolCall;
  readonly run: ToolRun;

  // the sequence of the call's record, which holds the decision that allowed it
  readonly callSequence: number;
  readonly options: ToolCallOptions;
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
    : buildTypedResult(allowed.registered, outcome.result, null);
}

function buildTypedResult(
  registered: RegisteredTool,
  result: JSONObject,
  actionID: string | null,
): Settled {
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
    content: { result },
    reply: { kind: 'typed', result },
  };
}

async function runQueued(allowed: AllowedCall): Promise<Settled> {
  const actionID = crypto.randomUUID();
  await allowed.options.queue.enqueue({
    actionID,
    call: allowed.call,
    run: allowed.run,
    callSequence: allowed.callSequence,
  });

  const outcome = await allowed.options.queue.waitForOutcome(
    actionID,
    allowed.options.queuedWaitMs,
  );

  if (outcome === null) {
    return buildMessage('queued', `queued as ${actionID}`, { isError: false, actionID });
  }
  if (outcome.outcome === 'done') {
    return buildTypedResult(allowed.registered, outcome.result, actionID);
  }

  // the call was allowed and the action ran, so its outcome is no tool error
  return buildMessage(outcome.outcome, `action ${actionID} ${outcome.outcome}: ${outcome.reason}`, {
    source: 'untrusted',
    isError: false,
    actionID,
  });
}
