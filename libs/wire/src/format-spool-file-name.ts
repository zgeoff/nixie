import { match } from 'ts-pattern';
import type { SpoolFileName } from './spool-file-name';

export function formatSpoolFileName(name: SpoolFileName): string {
  const stem = `${name.captureID}.${name.writer}.${String(name.counter)}`;

  return match(name)
    .with({ kind: 'part' }, () => `${stem}.part`)
    .with({ kind: 'cap' }, (cap) => `${stem}.${String(cap.upstreamStatus)}.cap`)
    .with({ kind: 'miss' }, () => `${stem}.miss`)
    .exhaustive();
}
