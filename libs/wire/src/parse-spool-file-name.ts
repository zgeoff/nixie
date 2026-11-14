import { captureIDPattern } from './capture-tag';
import type { SpoolFileName } from './spool-file-name';

const decimalPattern = /^[1-9][0-9]{0,14}$/u;
const writerPattern = /^[0-9a-f]+$/u;

export function parseSpoolFileName(name: string): SpoolFileName | null {
  const parts = name.split('.');
  const kind = parts.at(-1);
  const [captureID = '', writer = '', counter = '', status = ''] = parts;

  if (
    !captureIDPattern.test(captureID) ||
    !writerPattern.test(writer) ||
    !decimalPattern.test(counter)
  ) {
    return null;
  }

  if (parts.length === 4 && (kind === 'part' || kind === 'miss')) {
    return { kind, captureID, writer, counter: Number(counter) };
  }

  if (parts.length === 5 && kind === 'cap' && decimalPattern.test(status)) {
    return { kind, captureID, writer, counter: Number(counter), upstreamStatus: Number(status) };
  }

  return null;
}
