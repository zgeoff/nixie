import type { WriterSubject } from './writer-types';

export const writerSubjects = ['owner', 'shared'] as const satisfies readonly WriterSubject[];
