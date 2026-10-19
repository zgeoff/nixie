import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// the fields of a transcript entry that a probe reads; the CLI writes many more, which pass through
const entrySchema = z
  .looseObject({
    type: z.string(),
    subtype: z.string().optional(),
    uuid: z.string().optional(),
    isCompactSummary: z.boolean().optional(),
  })
  .readonly();

export type TranscriptEntry = z.infer<typeof entrySchema>;

// Loads a session's transcript as the CLI wrote it under the config directory: every entry,
// compacted or not, which a resume never shows whole.
export async function loadSessionTranscript(
  configDir: string,
  sessionID: string,
): Promise<readonly TranscriptEntry[]> {
  const path = await readTranscriptPath(configDir, sessionID);

  if (path === null) {
    throw new Error(`no transcript for session ${sessionID} in ${configDir}`);
  }

  const text = await Bun.file(path).text();

  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => entrySchema.parse(JSON.parse(line)));
}

// the CLI keeps each session under a folder named for its working directory
async function readTranscriptPath(configDir: string, sessionID: string): Promise<string | null> {
  const projects = join(configDir, 'projects');

  const folders = await readdir(projects).catch(() => []);

  const paths = folders.map((folder) => join(projects, folder, `${sessionID}.jsonl`));

  const found = await Promise.all(paths.map((path) => Bun.file(path).exists()));

  return paths.find((_, index) => found[index] === true) ?? null;
}
