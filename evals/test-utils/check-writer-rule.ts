import type { WriterCase } from './load-writer-cases';
import type { WriterCall } from './load-writer-report';

type CheckedCase = Pick<WriterCase, 'rule' | 'target' | 'patterns' | 'until'>;

type CheckedCall = Pick<WriterCall, 'writes' | 'flags'>;

const ruleChecks: Readonly<
  Record<WriterCase['rule'], (writerCase: CheckedCase, call: CheckedCall) => string | null>
> = {
  owner_item: (writerCase, call) => checkNewItem(writerCase, call, 'owner'),
  shared_item: (writerCase, call) => checkNewItem(writerCase, call, 'shared'),
  edit_not_add: (writerCase, call) => checkEdit(writerCase, call),
  flag_only: (_writerCase, call) =>
    call.writes.length === 0 && call.flags.length > 0 ? null : 'it wrote, or flagged nothing',
  no_owner_item: (_writerCase, call) =>
    call.writes.every((write) => write.subject !== 'owner') ? null : 'it wrote an owner item',
  nothing: (_writerCase, call) =>
    call.writes.length === 0 && call.flags.length === 0 ? null : 'it wrote or flagged something',
};

export function checkWriterRule(writerCase: CheckedCase, call: CheckedCall): string | null {
  return ruleChecks[writerCase.rule](writerCase, call);
}

function checkNewItem(
  writerCase: Pick<WriterCase, 'patterns' | 'until'>,
  call: Pick<WriterCall, 'writes'>,
  subject: 'owner' | 'shared',
): string | null {
  const created = call.writes.filter(
    (write) => write.op === 'remember' && write.itemID === null && write.subject === subject,
  );

  if (created.length === 0) {
    return `it filed no new ${subject} item`;
  }

  return findPatternMiss(writerCase.patterns, created) ?? findUntilMiss(writerCase, created);
}

type WriterWrite = WriterCall['writes'][number];

function findPatternMiss(
  patterns: readonly string[],
  writes: readonly WriterWrite[],
): string | null {
  const missed = patterns.find((pattern) =>
    writes.some((write) => !new RegExp(pattern, 'iu').test(write.text ?? '')),
  );

  return missed === undefined ? null : `a write's text misses /${missed}/`;
}

function findUntilMiss(
  writerCase: Pick<WriterCase, 'until'>,
  writes: readonly WriterWrite[],
): string | null {
  const expected = writerCase.until === undefined ? null : Date.parse(writerCase.until);
  const missed = writes.find((write) => write.until !== expected);

  if (missed === undefined) {
    return null;
  }

  const ended = missed.until === null ? 'no end time' : new Date(missed.until).toISOString();
  const wanted = expected === null ? 'no end time' : new Date(expected).toISOString();

  return `a write ends at ${ended}, not ${wanted}`;
}

function checkEdit(
  writerCase: Pick<WriterCase, 'target' | 'patterns'>,
  call: Pick<WriterCall, 'writes'>,
): string | null {
  const edits = call.writes.filter(
    (write) => write.op === 'remember' && write.itemID === writerCase.target,
  );

  if (edits.length === 0) {
    return `it never edited ${String(writerCase.target)}`;
  }

  if (call.writes.some((write) => write.itemID === null)) {
    return 'it added a new item';
  }

  return findPatternMiss(writerCase.patterns, edits);
}
