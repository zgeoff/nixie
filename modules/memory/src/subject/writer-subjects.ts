import type { WriterSubject } from '../writer/writer-model';

export const writerSubjects = ['owner', 'shared'] as const satisfies readonly WriterSubject[];
