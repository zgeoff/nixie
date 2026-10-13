import type { MemoryOrigin } from './types';

// Says in plain words who saved a memory version, as the model reads it: the conversation is the
// model itself, and an item the owner saved names them, or "the owner" when no name is set.
export function formatOrigin(origin: MemoryOrigin, ownerName: string | null): string {
  switch (origin) {
    case 'conversation': {
      return 'you saved';
    }
    case 'memory_writer': {
      return 'your note-taker saved';
    }
    case 'task': {
      return 'a task saved';
    }
    case 'owner': {
      return `${ownerName ?? 'the owner'} saved`;
    }
  }
}
