import type { SpoolFileName } from './spool-file-name';

export function formatSpoolFileName(name: SpoolFileName): string {
  const stem = `${name.captureID}.${name.writer}.${String(name.counter)}`;

  if (name.kind === 'part') {
    return `${stem}.part`;
  }

  if (name.kind === 'cap') {
    return `${stem}.${String(name.upstreamStatus)}.cap`;
  }

  return `${stem}.miss`;
}
