import type { LogRecord } from '@heynixie/log';
import type { RuleSource } from '@heynixie/policy';
import { taskMessageCodec } from '@heynixie/tasks';
import type { StepPolicyFrame } from '@heynixie/tools';
import type { SessionFrame } from '../types';

// What a step's tool calls tell the decision point about the turn they belong to: where the call
// runs, which owner message started it, which messages a task passed on, and where its content came
// from. The caller adds to `sources` as more content reaches the model.
export function buildStepPolicyFrame(
  frame: SessionFrame,
  records: readonly LogRecord[],
  sources: readonly RuleSource[],
): StepPolicyFrame {
  if (frame.kind === 'conversation') {
    const turn = records.findLast((record) => record.kind === 'owner_message');

    return {
      context: 'conversation',
      definitionID: null,
      turnMessageSequence: turn?.sequence ?? null,
      onBehalfOf: [],
      sources,
    };
  }

  return {
    context: 'task',
    definitionID: null,
    turnMessageSequence: null,
    onBehalfOf: collectLinkedMessages(records),
    sources,
  };
}

function collectLinkedMessages(records: readonly LogRecord[]): readonly number[] {
  const linked = records
    .filter((record) => record.kind === 'task_message')
    .flatMap((record) => taskMessageCodec.tryDecodePartial(record.payload)?.onBehalfOf ?? [])
    .map(Number)
    .filter((sequence) => Number.isSafeInteger(sequence));

  return [...new Set(linked)].toSorted((left, right) => left - right);
}
