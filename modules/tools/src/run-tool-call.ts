import type {
  ContentSource,
  Decision,
  Definitions,
  JSONObject,
  Log,
  WriteTransaction,
} from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { CallDestination, DecisionPoint, PolicyCall, PolicyDecision } from '@heynixie/policy';
import {
  buildActionHash,
  buildActionProposalInput,
  makeFaultSafeDecisionPoint,
  toStoredDecision,
} from '@heynixie/policy';
import type { CallToolResult } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';
import { callCapRefusal } from './cap/call-cap-refusal';
import { countCapCalls } from './cap/count-cap-calls';
import { buildMemoryVerdict, isMemoryRuleAsk } from './policy-call/build-memory-verdict';
import { buildToolPolicyCall } from './policy-call/build-tool-policy-call';
import { resolveCallDeadline } from './policy-call/resolve-call-deadline';
import { resolveCallDestinations } from './policy-call/resolve-call-destinations';
import { resolveCallPolicyFacts } from './policy-call/resolve-call-policy-facts';
import { toStepKey } from './policy-call/to-step-key';
import { toolCalledCodec } from './tool-called-codec';
import { toolResultCodec } from './tool-result-codec';
import { ToolResultRefusedError } from './types';
import type {
  ActionQueue,
  DirectResult,
  MemoryWriteVerdict,
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

  // a decision point that runs past this denies the call; 30 seconds when absent
  readonly decisionDeadlineMs?: number;

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
  const definitions = options.definitions();
  const recorder = makeCallRecorder(call, run, options, definitions);
  const registered = options.registry.findTool(call.tool);
  const inputCheck = checkListedInput(registered, call, run);

  if (!inputCheck.isValid) {
    return writeInvalidCall(recorder, inputCheck.errors);
  }

  const resolution =
    registered !== null && run.tools.includes(call.tool)
      ? await resolveCallDestinations(registered, call.input, run)
      : { status: 'ok' as const, destinations: [] };

  if (resolution.status === 'error') {
    return writeInvalidCall(recorder, resolution.message);
  }

  const destinations = resolution.destinations;

  const deadline =
    registered !== null && run.tools.includes(call.tool)
      ? await resolveCallDeadline(registered, call.input, run)
      : { status: 'ok' as const, deadlineAt: null };

  if (deadline.status === 'error') {
    return writeInvalidCall(recorder, deadline.message);
  }

  const deadlineAt = deadline.deadlineAt;

  const facts =
    registered !== null && run.tools.includes(call.tool)
      ? await resolveCallPolicyFacts(registered, call.input, run)
      : null;

  if (facts?.status === 'error') {
    return writeInvalidCall(recorder, facts.message);
  }

  const decisionTimeout =
    options.decisionDeadlineMs === undefined ? {} : { deadlineMs: options.decisionDeadlineMs };

  const decide = makeFaultSafeDecisionPoint(options.decide, decisionTimeout);
  const policyArgs = facts?.args ?? call.input;

  const policyCall = buildToolPolicyCall(run, {
    tool: call.tool,
    input: policyArgs,
    destinations,
    definitions,
    at: options.log.writer.clock.now(),
    ...(facts === null ? {} : { sources: facts.sources }),
  });

  const policy = await decide(policyCall);

  const stored = toStoredDecision(policy.decision, policyCall);

  const written = await recorder.writeCall({
    policy,
    stored,
    destinations,
    args: policyArgs,
    frame: policyCall,
    deadlineAt,
  });

  const settled = written.isCapped
    ? buildMessage('denied', renderCallCapRefusal(run, call.tool), { source: 'owner_data' })
    : await runDecidedCall({
        policy,
        stored,
        registered,
        call,
        run,
        callSequence: written.sequence,
        shortID: written.shortID,
        destinations,
        deadlineAt,
        options,
      });

  return recorder.writeResult(written.sequence, settled);
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

  // sealed under the result record's key, in order
  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];

  // runs in the transaction that writes the result record
  readonly writeBeside?: (tx: WriteTransaction, resultSequence: number) => Promise<void>;
}

interface CallPolicy {
  readonly policy: PolicyDecision;
  readonly stored: Decision;
  readonly destinations: readonly CallDestination[];

  // the arguments the decision read, which a replay of the stored decision reads again
  readonly args: JSONObject;

  // the frame the call ran under, which a no_rule ask records
  readonly frame: Pick<PolicyCall, 'context' | 'definitionID' | 'sources'>;

  // the time after which the call's action must not start, null when it has none
  readonly deadlineAt: number | null;
}

interface WrittenCall {
  readonly sequence: number;

  // the short ID of the action proposal that an ask wrote, and null for any other call
  readonly shortID: string | null;

  // whether the call is one more than its task run's cap on the tool
  readonly isCapped: boolean;
}

interface CallRecorder {
  readonly writeCall: (decided: CallPolicy | null) => Promise<WrittenCall>;
  readonly writeResult: (callSequence: number, settled: Settled) => Promise<CallToolResult>;
}

function makeCallRecorder(
  call: ToolCall,
  run: ToolRun,
  options: ToolCallOptions,
  definitions: Definitions,
): CallRecorder {
  const ids = {
    callID: call.callID,
    runID: run.runID,
    toolUseID: call.toolUseID,
    ...(run.taskRun === undefined ? {} : { taskRunID: run.taskRun.runID }),
  };

  const recordInput = options.registry.findTool(call.tool)?.definition.recordInput;

  return {
    writeCall: (decided) =>
      withWriteTransaction(options.log.writer, async (tx) => {
        const recorded = decided?.args ?? call.input;
        const input = recordInput?.(recorded) ?? recorded;
        const destinations = decided?.destinations ?? [];

        const [written] = await writeRecordsInTransaction(tx, options.log, [
          {
            kind: 'tool_called',
            definitions,
            thread: run.thread,
            payload: toolCalledCodec.encode({
              ...ids,
              tool: call.tool,
              model: run.model.model,
              profile: run.model.profile,
              ...(decided === null || decided.deadlineAt === null
                ? {}
                : { deadlineAt: decided.deadlineAt }),
            }),
            erasable: {
              input,
              ...(destinations.length === 0
                ? {}
                : {
                    destinations: destinations.map((destination) => ({
                      value: destination.value,
                      replyTarget: destination.replyTarget,
                    })),
                  }),
            },
            ...(decided === null ? {} : { decision: decided.stored }),
          },
        ]);

        invariant(written, 'the log wrote no record for the tool call');

        const cap = decided === null ? undefined : run.taskRun?.calls[call.tool];

        if (cap !== undefined && run.taskRun !== undefined) {
          const earlier = await countCapCalls(tx, {
            thread: run.thread,
            taskRunID: run.taskRun.runID,
            tool: call.tool,
            beforeSequence: written.sequence,
          });

          if (earlier >= cap) {
            return { sequence: written.sequence, shortID: null, isCapped: true };
          }
        }

        const cause = decided?.policy.decision.cause;

        if (
          decided === null ||
          decided.policy.decision.outcome !== 'ask' ||
          cause === undefined ||
          isMemoryRuleAsk(decided.policy)
        ) {
          return { sequence: written.sequence, shortID: null, isCapped: false };
        }

        const registered = options.registry.findTool(call.tool);

        invariant(registered, 'a tool that asks is registered');

        const proposal = buildActionProposalInput({
          definitions,
          thread: run.thread,
          callSequence: written.sequence,
          tool: call.tool,
          effects: registered.definition.declaration.effects,
          cause,
          input: call.input,
          destinations,
          content: registered.definition.declaration.content,
          frame: decided.frame,
          deadlineAt: decided.deadlineAt,
          now: options.log.writer.clock.now(),
          ...(run.stepRunID === undefined ? {} : { stepKey: toStepKey(run.stepRunID) }),
        });

        await writeRecordsInTransaction(tx, options.log, [proposal.record]);

        return { sequence: written.sequence, shortID: proposal.shortID, isCapped: false };
      }),
    writeResult: async (callSequence, settled) => {
      const writeSettled = async (toWrite: Settled): Promise<void> => {
        const contentSource = pickLeastTrusted(Object.values(toWrite.sources));
        const writeBeside = toWrite.writeBeside;

        await withWriteTransaction(options.log.writer, async (tx) => {
          const [written] = await writeRecordsInTransaction(tx, options.log, [
            {
              kind: 'tool_result',
              definitions,
              thread: run.thread,
              parent: callSequence,
              payload: toolResultCodec.encode({
                ...ids,
                outcome: toWrite.outcome,
                actionID: toWrite.actionID,
                sources: toWrite.sources,
              }),
              erasable: toWrite.content,
              ...(toWrite.attachments === undefined ? {} : { attachments: toWrite.attachments }),
              ...(contentSource === null ? {} : { contentSource }),
            },
          ]);

          invariant(written, 'the log wrote no record for the tool result');

          await writeBeside?.(tx, written.sequence);
        });
      };

      try {
        await writeSettled(settled);

        return toCallToolResult(settled);
      } catch (error) {
        if (!(error instanceof ToolResultRefusedError)) {
          throw error;
        }

        const refused = buildMessage('error', error.message, { source: 'untrusted' });

        await writeSettled(refused);

        return toCallToolResult(refused);
      }
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

interface MessageOptions {
  readonly source?: ContentSource;
  readonly isError?: boolean;
  readonly actionID?: string;
  readonly hidden?: JSONObject | undefined;
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
    content: buildHiddenFields({ message }, messageOptions.hidden),
    reply: { kind: 'text', text: message, isError: messageOptions.isError ?? true },
  };
}

// hidden is stored only when the tool set it to an object with 1 key or more
function buildHiddenFields(fields: JSONObject, hidden: JSONObject | undefined): JSONObject {
  return hidden !== undefined && Object.keys(hidden).length > 0 ? { ...fields, hidden } : fields;
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
  const written = await recorder.writeCall(null);

  // the errors repeat the input's own keys, which the model chose
  return recorder.writeResult(
    written.sequence,
    buildMessage('invalid', errors, { source: 'untrusted' }),
  );
}

function renderCallCapRefusal(run: ToolRun, tool: string): string {
  const cap = run.taskRun?.calls[tool] ?? 0;

  return callCapRefusal.replace('{n}', String(cap)).replace('{tool}', tool);
}

interface DecidedCall {
  readonly policy: PolicyDecision;
  readonly stored: Decision;
  readonly registered: RegisteredTool | null;
  readonly call: ToolCall;
  readonly run: ToolRun;
  readonly callSequence: number;
  readonly shortID: string | null;
  readonly destinations: readonly CallDestination[];
  readonly deadlineAt: number | null;
  readonly options: ToolCallOptions;
}

function runDecidedCall(decided: DecidedCall): Promise<Settled> {
  const { policy, stored, registered, shortID, ...rest } = decided;

  if (policy.decision.outcome === 'ask' && !isMemoryRuleAsk(policy)) {
    return Promise.resolve(buildAskMessage(shortID));
  }

  if (policy.decision.outcome === 'deny' || registered === null) {
    const sentence = policy.sentence ?? 'no rule allowed this call';

    // a deny of a rule or a fault prints its own sentence, and the others get a prefix
    const message = sentence.startsWith('Not allowed') ? sentence : `denied: ${sentence}`;

    // a registry or scope sentence repeats the tool name, which the model chose
    const isModelText = policy.decision.stage <= 2 && policy.decision.fault === undefined;

    return Promise.resolve(
      buildMessage('denied', message, { source: isModelText ? 'untrusted' : 'owner_data' }),
    );
  }

  const verdict = buildMemoryVerdict(policy);

  return tryRunAllowedCall({
    ...rest,
    registered,
    decision: stored,
    ...(verdict === undefined ? {} : { verdict }),
  });
}

function buildAskMessage(shortID: string | null): Settled {
  invariant(shortID !== null && shortID !== '', 'an ask wrote an action proposal');

  return buildMessage(
    'queued',
    `Waiting for approval as \`${shortID}\`. You can keep working; you will hear the answer in your inbox.`,
    { isError: false },
  );
}

interface AllowedCall {
  readonly registered: RegisteredTool;
  readonly decision: Decision;
  readonly call: ToolCall;
  readonly run: ToolRun;

  readonly callSequence: number;
  readonly destinations: readonly CallDestination[];
  readonly deadlineAt: number | null;
  readonly options: ToolCallOptions;

  readonly verdict?: MemoryWriteVerdict;
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
  const outcome = await allowed.registered.definition.run(allowed.call, {
    run: allowed.run,
    ...(allowed.verdict === undefined ? {} : { verdict: allowed.verdict }),
  });

  // a tool's error can quote what an outside service said, so it counts as outside content
  return outcome.status === 'error'
    ? buildMessage('error', outcome.message, { source: 'untrusted', hidden: outcome.hidden })
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
    content: buildResultFields(typed, result),
    reply: { kind: 'typed', result, images: typed.images ?? [] },
    ...(typed.attachments === undefined ? {} : { attachments: typed.attachments }),
    ...(typed.writeBeside === undefined ? {} : { writeBeside: typed.writeBeside }),
  };
}

function buildResultFields(typed: DirectResult, result: JSONObject): JSONObject {
  return buildHiddenFields({ result: typed.record ?? result }, typed.hidden);
}

async function runQueued(allowed: AllowedCall): Promise<Settled> {
  const actionID = await allowed.options.queue.enqueue({
    call: allowed.call,
    run: allowed.run,
    decision: allowed.decision,
    callSequence: allowed.callSequence,
    actionHash: buildActionHash({
      tool: allowed.call.tool,
      input: allowed.call.input,
      destinations: allowed.destinations.map((destination) => destination.value),
      deadlineAt: allowed.deadlineAt,
    }),
    deadlineAt: allowed.deadlineAt,
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
