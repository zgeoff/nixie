import type { Projection } from '@heynixie/log';
import { notebookLinksProjection } from './notebook-links-projection';
import { notebookNotesProjection } from './notebook-notes-projection';
import { notebookVersionsProjection } from './notebook-versions-projection';

export const notebookProjections: readonly Projection[] = [
  notebookNotesProjection,
  notebookVersionsProjection,
  notebookLinksProjection,
];
