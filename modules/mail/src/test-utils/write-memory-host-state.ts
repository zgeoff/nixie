import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MemoryHostState } from './types';

// Writes the state beside its file first, so a host that stops in the middle leaves the earlier one.
export function writeMemoryHostState(path: string, state: MemoryHostState): void {
  const text = JSON.stringify({
    instance: state.instance,
    inbox: state.inbox.map((mail) => ({ ...mail, raw: encodeBytes(mail.raw) })),
    sent: state.sent.map((mail) => ({ ...mail, raw: encodeBytes(mail.raw) })),
  });

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

function encodeBytes(raw: Uint8Array): string {
  return Buffer.from(raw).toString('base64');
}
