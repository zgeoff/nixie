import type { WriterSubject } from './writer-types';

// The subjects the note-taker reads and writes, in the order its tools list them.
export const writerSubjects = ['owner', 'shared'] as const satisfies readonly WriterSubject[];
