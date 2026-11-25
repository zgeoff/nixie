import type { JSONObject, Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildActionHash } from '@heynixie/policy';
import { z } from 'zod';
import { makeCallRecorder } from '../call-record/make-call-recorder';
import { runPaidCall } from '../paid/run-paid-call';
import { pickVariant } from '../policy-call/pick-variant';
import { omitRelatedMemory } from '../related/omit-related-memory';
import type { ToolCallOptions } from '../run-tool-call';
import { buildMessage } from '../settle/build-message';
import { buildTypedResult } from '../settle/build-typed-result';
import type { Settled } from '../settle/types';
import { toolCalledCodec } from '../tool-called-codec';
import type { RegisteredTool, ToolCall, ToolImage, ToolRun } from '../types';
import { probePreparedAsApproved } from './probe-prepared-as-approved';

// A call the owner approved, which the run of the step that holds the task runs instead of the
// model's own call.
export interface ApprovedCallRequest {
  // the ID of the approved action, which the result record names
  readonly actionID: string;
  readonly tool: string;

  // the arguments the owner approved
  readonly input: JSONObject;
  readonly callSequence: number;

  // the hash of the operation the owner approved: tool, input, destinations and deadline
  readonly actionHash: string;
}

// What an approved call returned, which its turn reads in place of what the result record keeps. It
// holds no `related`: a turn can read it after a forget of a related item.
export interface ApprovedReply {
  readonly result: JSONObject;
  readonly images: readonly ToolImage[];
}

export type ApprovedRun =
  | {
      readonly status: 'done';
      readonly resultSequence: number;

      // What the tool returned. A tool can record less than it returns, such as the IDs of the
      // entries it read, so only the step that ran the call holds the full result and its images.
      readonly result: JSONObject;
      readonly images: readonly ToolImage[];
    }
  | { readonly status: 'failed'; readonly resultSequence: number }

  // the tool refused the call and changed nothing; the result says why
  | {
      readonly status: 'refused';
      readonly resultSequence: number;
      readonly code: string;
      readonly result: JSONObject;
      readonly images: readonly ToolImage[];
    }

  // the tool is gone, or is not one that runs inside the turn: nothing ran
  | { readonly status: 'unavailable' }

  // the stored call or its arguments differ from what the owner approved: nothing ran
  | { readonly status: 'changed' };

// Runs the approved call of a tool that runs inside the turn, once, and writes its result as a
// second result of the call's own record. The caller guards the run against a second one: this
// reads the stored call again and refuses arguments that differ from the approved operation.
export async function runApprovedCall(
  request: ApprovedCallRequest,
  run: ToolRun,
  options: ToolCallOptions,
): Promise<ApprovedRun> {
  const found = options.registry.findTool(request.tool);

  if (found === null || found.definition.execution !== 'direct') {
    return { status: 'unavailable' };
  }

  const stored = await readApprovedCall(options.log, request);

  if (stored === null) {
    return { status: 'changed' };
  }

  // the owner approved the call under the form the call loaded
  if (stored.pinHash !== found.definition.pinHash) {
    return { status: 'changed' };
  }

  const call: ToolCall = {
    callID: stored.callID,
    tool: request.tool,
    input: request.input,
    toolUseID: stored.toolUseID,
  };

  // a variant's declaration names the sources of its own results, as it does for the model's call
  const variant = pickVariant(found, call);

  if (variant?.status === 'error') {
    return { status: 'unavailable' };
  }

  const registered = variant === null ? found : variant.registered;

  if (!(await probePreparedAsApproved(registered, request.input, stored.destinations, { run }))) {
    return { status: 'changed' };
  }

  const settled = await tryRunApproved(registered, call, options, {
    run,
    callSequence: request.callSequence,
    actionID: request.actionID,
  });

  const recorder = makeCallRecorder(call, run, options, {
    definitions: options.definitions(),
    parent: undefined,
    pinHash: found.definition.pinHash,
  });

  const written = await recorder.writeSettled(request.callSequence, settled);

  return toApprovedRun(written.sequence, written.settled);
}

interface StoredApprovedCall {
  readonly callID: string;
  readonly toolUseID: string | null;
  readonly destinations: readonly string[];
  readonly pinHash: string | undefined;
}

const approvedCalledSchema = z.object({
  destinations: z.object({ value: z.string() }).array().default([]),
});

async function readApprovedCall(
  log: Log,
  request: ApprovedCallRequest,
): Promise<StoredApprovedCall | null> {
  const [entry] = await readRecords(log, { afterSequence: request.callSequence - 1, limit: 1 });

  const record = entry?.record;

  if (
    record === undefined ||
    record.sequence !== request.callSequence ||
    record.kind !== 'tool_called' ||
    record.erasable.status !== 'readable'
  ) {
    return null;
  }

  const payload = toolCalledCodec.decode(record.payload);
  const erasable = approvedCalledSchema.parse(record.erasable.fields);

  const hash = buildActionHash({
    tool: payload.tool,
    input: request.input,
    destinations: erasable.destinations.map((destination) => destination.value),
    deadlineAt: payload.deadlineAt ?? null,
  });

  return payload.tool === request.tool && hash === request.actionHash
    ? {
        callID: payload.callID,
        toolUseID: payload.toolUseID,
        pinHash: payload.pinHash,
        destinations: erasable.destinations.map((destination) => destination.value),
      }
    : null;
}

interface ApprovedRunFacts {
  readonly run: ToolRun;
  readonly callSequence: number;
  readonly actionID: string;
}

async function tryRunApproved(
  registered: RegisteredTool,
  call: ToolCall,
  options: ToolCallOptions,
  facts: ApprovedRunFacts,
): Promise<Settled> {
  try {
    const outcome = await runPaidCall(registered, { call, run: facts.run }, options, () =>
      registered.definition.run(call, { run: facts.run, callSequence: facts.callSequence }),
    );

    if (outcome.status === 'budget_reached') {
      return buildMessage('denied', outcome.message, {
        source: 'owner_data',
        actionID: facts.actionID,
      });
    }

    // a tool's error can quote what an outside service said, so it counts as outside content
    return outcome.status === 'error'
      ? buildMessage('error', outcome.message, {
          source: 'untrusted',
          hidden: outcome.hidden,
          actionID: facts.actionID,
        })
      : buildTypedResult(
          registered,
          { ...outcome, result: omitRelatedMemory(outcome.result) },
          facts.actionID,
        );
  } catch (error) {
    return buildMessage(
      'error',
      `the tool ${registered.definition.name} failed: ${String(error)}`,
      { source: 'untrusted', actionID: facts.actionID },
    );
  }
}

function toApprovedRun(resultSequence: number, settled: Settled): ApprovedRun {
  // a result that reports its service's own failure is no done action
  if (
    settled.outcome !== 'result' ||
    settled.reply.kind !== 'typed' ||
    settled.reply.isError === true
  ) {
    return { status: 'failed', resultSequence };
  }

  const reply = { resultSequence, result: settled.reply.result, images: settled.reply.images };

  return settled.refusalCode === undefined
    ? { status: 'done', ...reply }
    : { status: 'refused', code: settled.refusalCode, ...reply };
}
