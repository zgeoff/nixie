import { basename, dirname, join } from 'node:path';

// The folder that holds one run's recordings, named after its whole output file name, so two
// output files never share a folder, even when only their extensions differ.
export function toRecordingsDir(out: string): string {
  return join(dirname(out), 'recordings', basename(out));
}
