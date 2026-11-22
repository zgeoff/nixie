import type { CheckedTables } from '@heynixie/db';

// One image that a tool stored. Its bytes sit in the attachments of the tool_result record that the
// row names.
export interface ImageRow {
  readonly image_id: string;
  readonly uuid: string;
  readonly sequence: number;
  readonly position: number;
  readonly parent_id: string | null;
  readonly source: 'draw' | 'file' | 'photo';
  readonly source_seq: number | null;
  readonly is_pinned: number;
  readonly profile: string | null;
  readonly model: string | null;
  readonly media_type: string;
  readonly size: string;
  readonly byte_count: number;
  readonly created_at: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type ImageTables = CheckedTables<Readonly<{ images: ImageRow }>>;
