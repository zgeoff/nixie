import { basename, dirname, extname, join } from 'node:path';

// The folder that holds one run's recordings, named after its output file, so two runs of the same
// candidate never write to the same recording.
export function toRecordingsDir(out: string): string {
  return join(dirname(out), 'recordings', basename(out, extname(out)));
}
