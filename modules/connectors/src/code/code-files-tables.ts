import type { CheckedTables } from '@heynixie/db';

// One file a code run wrote, kept beside the result record that holds its bytes as an attachment.
interface CodeFileRow {
  readonly file_id: string;
  readonly thread: string;

  // the tool_result record that holds the file
  readonly sequence: number;

  // the attachment's position on that record
  readonly position: number;
  readonly bytes: number;
  readonly media_type: string;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type CodeFilesTables = CheckedTables<Readonly<{ code_files: CodeFileRow }>>;
