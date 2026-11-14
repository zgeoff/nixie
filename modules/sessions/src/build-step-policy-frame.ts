import type { LogRecord } from '@heynixie/log';
import type { RuleSource } from '@heynixie/policy';
import { taskMessageCodec } from '@heynixie/tasks';
import type { StepPolicyFrame } from '@heynixie/tools';
import type { SessionFrame } from './types';

// What a step's tool calls tell the decision point about the turn they belong to: where the call
// runs, which owner message started it, which messages a task passed on, and where the step's
// content came from.
export function buildStepPolicyFrame(
  frame: SessionFrame,
  records: readonly LogRecord[],
): StepPolicyFrame {
  const sources = collectSources(records);

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

function collectSources(records: readonly LogRecord[]): readonly RuleSource[] {
  const sources = records.flatMap((record): RuleSource[] => {
    if (record.kind === 'task_message') {
      return ['task'];
    }

    if (record.contentSource === 'owner') {
      return ['owner'];
    }

    if (record.contentSource === 'owner_data') {
      return ['own_data'];
    }

    return record.contentSource === 'untrusted' ? ['outside'] : [];
  });

  return [...new Set(sources)].toSorted();
}

function collectLinkedMessages(records: readonly LogRecord[]): readonly number[] {
  const linked = records
    .filter((record) => record.kind === 'task_message')
    .flatMap((record) => taskMessageCodec.tryDecodePartial(record.payload)?.onBehalfOf ?? [])
    .map(Number)
    .filter((sequence) => Number.isSafeInteger(sequence));

  return [...new Set(linked)].toSorted((left, right) => left - right);
}
