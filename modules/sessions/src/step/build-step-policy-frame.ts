import type { LogRecord } from '@heynixie/log';
import type { RuleSource } from '@heynixie/policy';
import { taskMessageCodec, triggerMailWokeCodec } from '@heynixie/tasks';
import type { StepPolicyFrame } from '@heynixie/tools';
import type { SessionFrame } from '../types';

// What a step's tool calls tell the decision point about the turn they belong to: where the call
// runs, which owner message started it, which messages a task passed on, which mail woke it, and
// where its content came from. The caller adds to `sources` as more content reaches the model.
export function buildStepPolicyFrame(
  frame: SessionFrame,
  records: readonly LogRecord[],
  sources: readonly RuleSource[],
): StepPolicyFrame {
  const arrivedMails = collectArrivedMails(records);

  if (frame.kind !== 'task') {
    const turn = records.findLast((record) => record.kind === 'owner_message');

    return {
      context: 'conversation',
      definitionID: null,
      turnMessageSequence: turn?.sequence ?? null,
      onBehalfOf: [],
      sources,
      arrivedMails,
    };
  }

  return {
    context: 'task',
    definitionID: null,
    turnMessageSequence: null,
    onBehalfOf: collectLinkedMessages(records),
    sources,
    arrivedMails,
  };
}

function collectArrivedMails(records: readonly LogRecord[]): readonly string[] {
  const ids = records
    .filter((record) => record.kind === triggerMailWokeCodec.kind)
    .flatMap((record) => triggerMailWokeCodec.tryDecodePartial(record.payload)?.mails ?? [])
    .filter((mail) => !isTextMailbox(mail.mailbox))
    .map((mail) => mail.messageID);

  return [...new Set(ids)].toSorted();
}

// Only a mail's sender can be a reply target. A text's sender is a number or a name, which no reply
// reaches.
function isTextMailbox(mailbox: string): boolean {
  return mailbox.startsWith('source:');
}

function collectLinkedMessages(records: readonly LogRecord[]): readonly number[] {
  const linked = records
    .filter((record) => record.kind === 'task_message')
    .flatMap((record) => taskMessageCodec.tryDecodePartial(record.payload)?.onBehalfOf ?? [])
    .map(Number)
    .filter((sequence) => Number.isSafeInteger(sequence));

  return [...new Set(linked)].toSorted((left, right) => left - right);
}
