import type { WriteCaller, WriteSource } from '../gate/gate-context';

// The sources of a write. A quote in words the owner typed gives `owner`. No quote, a quote the gate
// cannot place, a photo and a self-note give `outside`. A write from a task run adds `task`.
export function pickWriteSources(
  isOwnerQuote: boolean,
  caller: Pick<WriteCaller, 'origin'>,
): readonly WriteSource[] {
  const base: WriteSource = isOwnerQuote ? 'owner' : 'outside';

  return caller.origin === 'task' ? [base, 'task'] : [base];
}
