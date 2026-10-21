import type { WriterCase } from './load-writer-cases';
import type { WriterCall } from './load-writer-report';

type CheckedCase = Pick<WriterCase, 'rule' | 'target' | 'patterns'>;

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
  writerCase: Pick<WriterCase, 'patterns'>,
  call: Pick<WriterCall, 'writes'>,
  subject: 'owner' | 'shared',
): string | null {
  const created = call.writes.filter(
    (write) => write.op === 'remember' && write.itemID === null && write.subject === subject,
  );

  return created.length === 0
    ? `it filed no new ${subject} item`
    : findPatternMiss(writerCase.patterns, created);
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
