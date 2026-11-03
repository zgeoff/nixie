import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const entrySchema = z
  .looseObject({
    type: z.string(),
    subtype: z.string().optional(),
    uuid: z.string().optional(),
    isCompactSummary: z.boolean().optional(),
  })
  .readonly();

export type TranscriptEntry = z.infer<typeof entrySchema>;

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

// The CLI keeps each session under a folder named for its working directory.
async function readTranscriptPath(configDir: string, sessionID: string): Promise<string | null> {
  const projects = join(configDir, 'projects');

  const folders = await readdir(projects).catch(() => []);

  const paths = folders.map((folder) => join(projects, folder, `${sessionID}.jsonl`));

  const found = await Promise.all(paths.map((path) => Bun.file(path).exists()));

  return paths.find((_, index) => found[index] === true) ?? null;
}
