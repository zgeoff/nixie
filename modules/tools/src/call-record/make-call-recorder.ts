import type { ContentSource, Decision, Definitions, JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type {
  CallDestination,
  EffectDeclaration,
  PolicyCall,
  PolicyDecision,
} from '@heynixie/policy';
import { buildActionProposalInput } from '@heynixie/policy';
import invariant from 'tiny-invariant';
import { countCapCalls } from '../cap/count-cap-calls';
import { chargePaidPlanInTransaction } from '../paid/charge-paid-plan-in-transaction';
import type { PaidGate, PaidPlan } from '../paid/types';
import { isMemoryRuleAsk } from '../policy-call/build-memory-verdict';
import { toStepKey } from '../policy-call/to-step-key';
import type { ToolCallOptions } from '../run-tool-call';
import { buildMessage } from '../settle/build-message';
import { removeOwnValues } from '../settle/remove-own-values';
import type { Settled } from '../settle/types';
import { toolCalledCodec } from '../tool-called-codec';
import { toolResultCodec } from '../tool-result-codec';
import { ToolResultRefusedError } from '../types';
import type { OpenRepeat, ToolCall, ToolRun } from '../types';

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

  // the open action that an earlier approval of this same call queued, which the call asks no
  // second time
  readonly repeatOf: OpenRepeat | null;

  // the hash of the operation the policy checked, which an open proposal for the same call carries
  readonly actionHash: string;

  // what the hash covers beyond the call's own fields, which the call's proposal keeps
  readonly expectURL?: string | undefined;
  readonly expectWindow?: JSONObject | undefined;

  // the name the decision point and an action proposal know the call by, which a variant extends
  readonly policyTool: string;

  // the declaration the decision point read: the variant's when the call picked one
  readonly declaration: EffectDeclaration | null;

  // Sealed under the call record's key, for a card to show. Only a call that asks keeps them.
  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];

  // what the call charges, taken in the transaction that writes the call record, unless the call is
  // over its task run's cap
  readonly paid?: PaidPlan;
}

interface WrittenCall {
  readonly sequence: number;

  // the short ID of the action proposal that an ask wrote, and null for any other call
  readonly shortID: string | null;

  // whether the call is one more than its task run's cap on the tool
  readonly isCapped: boolean;

  // the approved action that the call repeats: the one the decision found, or one that an approval
  // queued while the call was being written
  readonly repeatOf: OpenRepeat | null;

  // whether the call's charge passed, null when the call took none
  readonly gate: PaidGate | null;
}

interface WrittenResult {
  readonly sequence: number;

  // what the record holds: the result, or the error that replaced it when the write was refused
  readonly settled: Settled;
}

export interface CallRecorder {
  readonly writeCall: (decided: CallPolicy | null) => Promise<WrittenCall>;
  readonly writeSettled: (callSequence: number, settled: Settled) => Promise<WrittenResult>;
}

export interface CallRecordFields {
  readonly definitions: Definitions;
  readonly parent: number | undefined;
}

export function makeCallRecorder(
  call: ToolCall,
  run: ToolRun,
  options: ToolCallOptions,
  fields: CallRecordFields,
): CallRecorder {
  const definitions = fields.definitions;
  const parent = fields.parent;

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
            ...(parent === undefined ? {} : { parent }),
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
            ...(decided?.attachments === undefined || decided.policy.decision.outcome !== 'ask'
              ? {}
              : { attachments: decided.attachments }),
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
            return {
              sequence: written.sequence,
              shortID: null,
              isCapped: true,
              repeatOf: decided?.repeatOf ?? null,
              gate: null,
            };
          }
        }

        const gate =
          decided?.paid === undefined ? null : await chargePaidPlanInTransaction(tx, decided.paid);

        const cause = decided?.policy.decision.cause;

        if (
          decided === null ||
          decided.policy.decision.outcome !== 'ask' ||
          cause === undefined ||
          isMemoryRuleAsk(decided.policy) ||
          decided.repeatOf !== null
        ) {
          return {
            sequence: written.sequence,
            shortID: null,
            isCapped: false,
            repeatOf: decided?.repeatOf ?? null,
            gate,
          };
        }

        const declaration = decided.declaration;

        invariant(declaration, 'a tool that asks is registered');

        // A call that repeats a question the owner has not answered asks nothing more, and a call
        // beside an approval no run has used proposes nothing; an approval can commit after the
        // repeat read.
        const open = await options.queue.readOpenAsk(tx, {
          run,
          tool: call.tool,
          input: call.input,
          actionHash: decided.actionHash,
        });

        if (open?.kind === 'action') {
          return {
            sequence: written.sequence,
            shortID: null,
            isCapped: false,
            repeatOf: open.repeat,
            gate: null,
          };
        }

        if (open?.kind === 'proposal') {
          return {
            sequence: written.sequence,
            shortID: open.shortID,
            isCapped: false,
            repeatOf: null,
            gate: null,
          };
        }

        const proposal = buildActionProposalInput({
          definitions,
          thread: run.thread,
          callSequence: written.sequence,
          tool: decided.policyTool,
          actionHash: decided.actionHash,
          expectURL: decided.expectURL,
          expectWindow: decided.expectWindow,
          effects: declaration.effects,
          cause,
          input: call.input,
          destinations,
          content: declaration.content,
          frame: decided.frame,
          deadlineAt: decided.deadlineAt,
          now: options.log.writer.clock.now(),
          ...(run.stepRunID === undefined ? {} : { stepKey: toStepKey(run.stepRunID) }),
        });

        await writeRecordsInTransaction(tx, options.log, [proposal.record]);

        return {
          sequence: written.sequence,
          shortID: proposal.shortID,
          isCapped: false,
          repeatOf: null,
          gate: null,
        };
      }),
    writeSettled: async (callSequence, raw) => {
      const settled = removeOwnValues(raw, options.readOwnValues?.() ?? []);

      const writeSettled = (toWrite: Settled): Promise<number> => {
        const contentSource = pickLeastTrusted(Object.values(toWrite.sources));
        const writeBeside = toWrite.writeBeside;

        return withWriteTransaction(options.log.writer, async (tx) => {
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

          return written.sequence;
        });
      };

      try {
        return { sequence: await writeSettled(settled), settled };
      } catch (error) {
        if (!(error instanceof ToolResultRefusedError)) {
          throw error;
        }

        const refused = buildMessage('error', error.message, { source: 'untrusted' });

        return { sequence: await writeSettled(refused), settled: refused };
      }
    },
  };
}

const trustOrder: readonly ContentSource[] = ['untrusted', 'owner_data', 'owner'];

function pickLeastTrusted(sources: readonly ContentSource[]): ContentSource | null {
  return trustOrder.find((source) => sources.includes(source)) ?? null;
}
