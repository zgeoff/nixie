import type { BudgetsContext } from '@heynixie/budgets';
import type { Decision, Definitions, JSONObject, Log } from '@heynixie/log';
import type {
  CallDestination,
  DecisionPoint,
  Effect,
  EffectDeclaration,
  NamingRule,
  PolicyDecision,
} from '@heynixie/policy';
import { buildActionHash, makeFaultSafeDecisionPoint, toStoredDecision } from '@heynixie/policy';
import { mintBlockID, renderFenced } from '@heynixie/wire';
import type { CallToolResult } from '@modelcontextprotocol/server';
import invariant from 'tiny-invariant';
import { isDefinitionMoved } from './call-record/is-definition-moved';
import type { DefinitionVersion } from './call-record/is-definition-moved';
import { makeCallRecorder } from './call-record/make-call-recorder';
import type { CallRecorder } from './call-record/make-call-recorder';
import { renderChangedSentence } from './call-record/render-changed-sentence';
import { callCapRefusal } from './cap/call-cap-refusal';
import { runPaidCall } from './paid/run-paid-call';
import { buildMemoryVerdict, isMemoryRuleAsk } from './policy-call/build-memory-verdict';
import { buildToolPolicyCall } from './policy-call/build-tool-policy-call';
import { pickVariant } from './policy-call/pick-variant';
import { readAskedRepeat } from './policy-call/read-asked-repeat';
import { resolveCallDeadline } from './policy-call/resolve-call-deadline';
import { resolveCallDestinations } from './policy-call/resolve-call-destinations';
import { resolveCallPolicyFacts } from './policy-call/resolve-call-policy-facts';
import { buildMessage } from './settle/build-message';
import { buildTypedResult } from './settle/build-typed-result';
import { readQueuedResult } from './settle/read-queued-result';
import type { Settled } from './settle/types';
import type {
  ActionQueue,
  DirectResult,
  MemoryWriteVerdict,
  OpenRepeat,
  Prepared,
  RegisteredTool,
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

  // what a paid tool charges; a deployment with a paid tool sets it
  readonly budgets?: BudgetsContext;

  // the values nixie holds as its own, read when each result settles, so no result reaches the
  // model or the log with one of them in it
  readonly readOwnValues?: () => readonly string[];

  // The names of the tools that no step lists for now, such as a connector's tools whose scope the
  // owner left out. Each list and each call reads it again, so a conversation follows a consent
  // that changes it.
  readonly readHeldBackTools?: () => Promise<readonly string[]>;
}

export interface ToolCallRequest {
  readonly tool: string;
  readonly input: JSONObject;
  readonly toolUseID: string | null;

  // the record that the call's tool_called takes as its parent
  readonly parent?: number;
}

export async function runToolCall(
  request: ToolCallRequest,
  run: ToolRun,
  options: ToolCallOptions,
): Promise<CallToolResult> {
  const { parent, ...fields } = request;
  const call: ToolCall = { ...fields, callID: crypto.randomUUID() };
  const definitions = options.definitions();
  const found = options.registry.findTool(call.tool);
  const pinHash = found?.definition.pinHash;
  const recorder = makeCallRecorder(call, run, options, { definitions, parent, pinHash });
  const loaded = { pinHash, definitionsHash: found?.definition.definitionsHash };

  // The declaration came from one snapshot, and the call records the snapshot it started under, so
  // a call records the snapshot that supplied the declaration it ran under.
  if (
    found !== null &&
    run.tools.includes(call.tool) &&
    found.definition.definitionsHash !== undefined &&
    found.definition.definitionsHash !== definitions.snapshotHash
  ) {
    return writeRefusedCall(recorder, renderChangedSentence(call.tool));
  }

  const inputCheck = checkListedInput(found, call, run);

  if (!inputCheck.isValid) {
    return writeInvalidCall(recorder, inputCheck.errors);
  }

  const isListed = found !== null && run.tools.includes(call.tool);
  const variant = isListed ? pickVariant(found, call) : null;

  if (variant?.status === 'error') {
    return writeInvalidCall(recorder, variant.message);
  }

  const registered = variant?.status === 'picked' ? variant.registered : found;
  const policyTool = variant?.status === 'picked' ? variant.policyTool : call.tool;

  const resolution =
    registered !== null && isListed
      ? await resolveCallDestinations(registered, call.input, run)
      : { status: 'ok' as const, destinations: [] };

  if (resolution.status === 'error') {
    return writeInvalidCall(recorder, resolution.message);
  }

  const refusal =
    registered !== null && isListed
      ? await registered.definition.clear?.(call.input, { run })
      : null;

  if (refusal !== null && refusal !== undefined) {
    return writeRefusedCall(recorder, refusal);
  }

  const prepare = registered !== null && isListed ? registered.definition.prepare : undefined;
  const prepared = prepare === undefined ? null : await prepare(call.input, { run });

  if (prepared !== null && !isPrepared(prepared)) {
    invariant(registered, 'a prepare step belongs to a registered tool');

    return writeDirectResult(recorder, registered, prepared);
  }

  // what the tool read about the call's input stands in for the declared destinations
  const destinations =
    prepared === null
      ? resolution.destinations
      : prepared.destinations.map((value) => ({
          value: value.normalize('NFC'),
          replyTarget: false,
        }));

  const effects = prepared?.effects;

  const deadline =
    registered !== null && isListed
      ? await resolveCallDeadline(registered, call.input, run)
      : { status: 'ok' as const, deadlineAt: null };

  if (deadline.status === 'error') {
    return writeInvalidCall(recorder, deadline.message);
  }

  const deadlineAt = deadline.deadlineAt;

  const facts =
    registered !== null && isListed
      ? await resolveCallPolicyFacts(registered, call.input, run)
      : null;

  if (facts?.status === 'error') {
    return writeInvalidCall(recorder, facts.message);
  }

  const decisionTimeout =
    options.decisionDeadlineMs === undefined ? {} : { deadlineMs: options.decisionDeadlineMs };

  const decide = makeFaultSafeDecisionPoint(options.decide, decisionTimeout);
  const policyArgs = withPreparedAmount(facts?.args ?? call.input, registered, prepared);

  const policyCall = buildToolPolicyCall(run, {
    tool: policyTool,
    input: policyArgs,
    destinations,
    definitions,
    at: options.log.writer.clock.now(),
    ...(effects === undefined ? {} : { effects }),
    ...(facts === null ? {} : { sources: facts.sources }),
  });

  const policy = await decide(policyCall);

  const stored = toStoredDecision(policy.decision, policyCall);

  const actionHash = buildActionHash({
    tool: call.tool,
    input: call.input,
    destinations: destinations.map((destination) => destination.value),
    deadlineAt,
    expectURL: prepared?.expectURL,
    expectWindow: prepared?.expectWindow,
  });

  const repeatOf = await readAskedRepeat({
    registered,
    policy,
    call,
    run,
    queue: options.queue,
    actionHash,
  });

  const written = await recorder.writeCall({
    policy,
    stored,
    destinations,
    args: policyArgs,
    frame: policyCall,
    deadlineAt,
    repeatOf,
    actionHash,
    expectURL: prepared?.expectURL,
    expectWindow: prepared?.expectWindow,
    policyTool,
    declaration: pickCallDeclaration(registered, effects),
    ...(prepared?.attachments === undefined ? {} : { attachments: prepared.attachments }),
  });

  await prepared?.settleAttachments?.(written.sequence);

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
        repeatOf: written.repeatOf,
        destinations,
        deadlineAt,
        prepared,
        loaded,
        options,
      });

  const recorded = await recorder.writeSettled(written.sequence, settled);

  return toCallToolResult(recorded.settled);
}

// A refusal is nixie's own sentence, so it reaches the model as plain error text.
async function writeRefusedCall(recorder: CallRecorder, refusal: string): Promise<CallToolResult> {
  const written = await recorder.writeCall(null);

  const refused = await recorder.writeSettled(
    written.sequence,
    buildMessage('error', refusal, { source: 'owner_data' }),
  );

  return toCallToolResult(refused.settled);
}

function toCallToolResult(settled: Settled): CallToolResult {
  const reply = settled.reply;

  if (reply.kind === 'text') {
    const text = reply.isOutside === true ? renderFencedText(reply.text) : reply.text;

    return { content: [{ type: 'text', text }], isError: reply.isError };
  }

  // The Claude Code CLI ends its turn after a result with this key and makes no further model call.
  const endTurn = settled.endsTurn === true ? { _meta: { 'claude/endTurn': true } } : {};
  const isError = reply.isError === true ? { isError: true } : {};

  // Outside text reaches the model inside the one fence, and never as structured content.
  if (isUntrustedResult(settled)) {
    return {
      content: [
        { type: 'text', text: renderFencedResult(reply.result) },
        ...reply.images.map(toImageBlock),
      ],
      ...isError,
      ...endTurn,
    };
  }

  if (reply.images.length === 0) {
    return { content: [], structuredContent: reply.result, ...isError, ...endTurn };
  }

  return {
    content: [
      { type: 'text', text: JSON.stringify(reply.result) },
      ...reply.images.map(toImageBlock),
    ],
    ...isError,
    ...endTurn,
  };
}

function renderFencedText(text: string): string {
  return renderFenced({
    tag: 'tool-result',
    attributes: { source: 'untrusted' },
    text,
    fence: mintBlockID(),
  });
}

// A result is outside text when every one of its fields is untrusted. A result that mixes sources
// reaches the model as it is, and its tool marks its own outside fields.
function isUntrustedResult(settled: Settled): boolean {
  const sources = Object.values(settled.sources);

  return sources.every((source) => source === 'untrusted');
}

// A result of one text field reads as that text, and any other result as its JSON.
function renderFencedResult(result: JSONObject): string {
  const keys = Object.keys(result);
  const text = result['text'];
  const body = keys.length === 1 && typeof text === 'string' ? text : JSON.stringify(result);

  return renderFencedText(body);
}

function toImageBlock(image: ToolImage) {
  return {
    type: 'image' as const,
    data: Buffer.from(image.bytes).toString('base64'),
    mimeType: image.mediaType,
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
  const written = await recorder.writeCall(null);

  // the errors repeat the input's own keys, which the model chose
  const invalid = await recorder.writeSettled(
    written.sequence,
    buildMessage('invalid', errors, { source: 'untrusted' }),
  );

  return toCallToolResult(invalid.settled);
}

function isPrepared(value: Prepared | DirectResult): value is Prepared {
  return 'destinations' in value;
}

// A prepare step that ends the call, such as a refusal, records the call with no decision.
async function writeDirectResult(
  recorder: CallRecorder,
  registered: RegisteredTool,
  result: DirectResult,
): Promise<CallToolResult> {
  const written = await recorder.writeCall(null);

  const settled = buildTypedResult(registered, result, null);

  const recorded = await recorder.writeSettled(written.sequence, settled);

  return toCallToolResult(recorded.settled);
}

// A prepared amount stands in for the argument the declaration names as the call's amount.
function withPreparedAmount(
  args: JSONObject,
  registered: RegisteredTool | null,
  prepared: Prepared | null,
): JSONObject {
  const name = registered?.definition.declaration.amount ?? null;

  return prepared?.amount === undefined || name === null
    ? args
    : { ...args, [name]: prepared.amount };
}

// A prepared call's effects join the declared ones in the proposal the call may write.
function pickCallDeclaration(
  registered: RegisteredTool | null,
  effects: readonly Effect[] | undefined,
): EffectDeclaration | null {
  const declaration = registered?.definition.declaration ?? null;

  return declaration === null || effects === undefined
    ? declaration
    : { ...declaration, effects: joinEffects(declaration.effects, effects) };
}

function joinEffects(declared: readonly Effect[], added: readonly Effect[]): readonly Effect[] {
  return [...new Set([...declared, ...added])];
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
  readonly repeatOf: OpenRepeat | null;
  readonly destinations: readonly CallDestination[];
  readonly deadlineAt: number | null;
  readonly prepared: Prepared | null;
  readonly loaded: DefinitionVersion;
  readonly options: ToolCallOptions;
}

function runDecidedCall(decided: DecidedCall): Promise<Settled> {
  const { policy, stored, registered, shortID, repeatOf, ...rest } = decided;

  if (policy.decision.outcome === 'ask' && !isMemoryRuleAsk(policy)) {
    if (repeatOf !== null && registered !== null) {
      // an action that the task's step runs settles in no turn that repeats the call
      return readQueuedResult(registered, rest.options.queue, {
        actionID: repeatOf.actionID,
        timeoutMs: repeatOf.runsInStep ? 0 : rest.options.queuedWaitMs,
        reserveImages: rest.run.session?.reserveImages,
      });
    }

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
    ...(policy.namingRules === undefined ? {} : { namingRules: policy.namingRules }),
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
  readonly prepared: Prepared | null;
  readonly loaded: DefinitionVersion;
  readonly options: ToolCallOptions;

  readonly verdict?: MemoryWriteVerdict;
  readonly namingRules?: readonly NamingRule[];
}

async function tryRunAllowedCall(allowed: AllowedCall): Promise<Settled> {
  // A relist can move the pin, and a seed can move the declaration, while the decision was pending.
  // The call's input was read against the form and the declaration it loaded, so it runs only under
  // those.
  const current = allowed.options.registry.findTool(allowed.call.tool);

  if (
    isDefinitionMoved(
      allowed.loaded,
      {
        pinHash: current?.definition.pinHash,
        definitionsHash: current?.definition.definitionsHash,
      },
      allowed.options.definitions().snapshotHash,
    )
  ) {
    return buildMessage('error', renderChangedSentence(allowed.call.tool), {
      source: 'owner_data',
    });
  }

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
  const outcome = await runPaidCall(
    allowed.registered,
    { call: allowed.call, run: allowed.run },
    allowed.options,
    () =>
      allowed.registered.definition.run(allowed.call, {
        run: allowed.run,
        callSequence: allowed.callSequence,
        ...(allowed.verdict === undefined ? {} : { verdict: allowed.verdict }),
        ...(allowed.namingRules === undefined ? {} : { namingRules: allowed.namingRules }),
      }),
  );

  if (outcome.status === 'budget_reached') {
    return buildMessage('denied', outcome.message, { source: 'owner_data' });
  }

  // a tool's error can quote what an outside service said, so it counts as outside content
  return outcome.status === 'error'
    ? buildMessage('error', outcome.message, { source: 'untrusted', hidden: outcome.hidden })
    : buildTypedResult(allowed.registered, outcome, null);
}

async function runQueued(allowed: AllowedCall): Promise<Settled> {
  const enqueued = await allowed.options.queue.enqueue({
    call: allowed.call,
    run: allowed.run,
    decision: allowed.decision,
    callSequence: allowed.callSequence,
    actionHash: buildActionHash({
      tool: allowed.call.tool,
      input: allowed.call.input,
      destinations: allowed.destinations.map((destination) => destination.value),
      deadlineAt: allowed.deadlineAt,
      expectURL: allowed.prepared?.expectURL,
      expectWindow: allowed.prepared?.expectWindow,
    }),
    deadlineAt: allowed.deadlineAt,
    effects: joinEffects(
      allowed.registered.definition.declaration.effects,
      allowed.prepared?.effects ?? [],
    ),
    destinations: allowed.destinations,
    content: allowed.registered.definition.declaration.content,
  });

  if (enqueued.status === 'asked') {
    return buildAskMessage(enqueued.shortID);
  }

  return readQueuedResult(allowed.registered, allowed.options.queue, {
    actionID: enqueued.actionID,
    timeoutMs: allowed.options.queuedWaitMs,
    reserveImages: allowed.run.session?.reserveImages,
  });
}
