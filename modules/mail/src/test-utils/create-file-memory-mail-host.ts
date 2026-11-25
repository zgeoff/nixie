import type { MemoryMailHost, MemoryMailHostOptions } from './build-memory-mail-host';
import { buildMemoryMailHost } from './build-memory-mail-host';
import { readMemoryHostState } from './read-memory-host-state';
import { writeMemoryHostState } from './write-memory-host-state';

interface FileMemoryMailHostOptions extends Omit<MemoryMailHostOptions, 'state' | 'onChange'> {
  // the file that keeps the host's mail, so a host that starts again over it continues
  readonly stateFile: string;
}

// A memory host that keeps its mail, its sent mail and its IDs in a file, so a restart of nixie
// loses none of them.
export function createFileMemoryMailHost(options: FileMemoryMailHostOptions): MemoryMailHost {
  const state = readMemoryHostState(options.stateFile);

  return buildMemoryMailHost({
    address: options.address,
    now: options.now,
    ...(state === null ? {} : { state }),
    onChange: (changed) => {
      writeMemoryHostState(options.stateFile, changed);
    },
  });
}
