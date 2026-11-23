import type { ContractOutputs } from '@heynixie/contract';
import { store } from './store';

const answeringKinds: ReadonlySet<string> = new Set([
  'computer.handover_asked',
  'computer.handover_closed',
  'computer.takeover_started',
]);

// The standing ask: the newest of an ask, its close and a take-over's start is the ask itself.
export function readMockHandover(): ContractOutputs['computer']['readHandover'] {
  const records = store.records.all();

  const [newest] = records
    .filter((record) => record.thread === 'conversation' && answeringKinds.has(record.kind))
    .toSorted((first, second) => second.sequence - first.sequence);

  const readAtSequence = Math.max(0, ...records.map((record) => record.sequence));

  if (newest?.kind !== 'computer.handover_asked') {
    return { ask: null, readAtSequence };
  }

  return {
    ask: { sequence: newest.sequence, reason: newest.message?.text ?? null },
    readAtSequence,
  };
}
