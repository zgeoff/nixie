import type { MemoryOrigin } from './types';

// Says in plain words who saved a memory version, as the model reads it: the conversation is the
// model itself, and an item the owner saved names them, or "the owner" when no name is set.
export function formatOrigin(origin: MemoryOrigin, ownerName: string | null): string {
  return origin === 'owner' ? `${ownerName ?? 'the owner'} saved` : originWords[origin];
}

const originWords: Readonly<Record<Exclude<MemoryOrigin, 'owner'>, string>> = {
  conversation: 'you saved',
  memory_writer: 'your note-taker saved',
  task: 'a task saved',
};
