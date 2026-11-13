import type { WriterSubject } from './writer-model';

export const writerSubjects = ['owner', 'shared'] as const satisfies readonly WriterSubject[];
