import type { PrepareRefusal, Prepared, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildFailureRefusal, forgottenOutcome } from '../call/build-google-failure';
import { makeResolveGoogleInput } from '../call/make-resolve-google-input';
import { buildCardAttachment } from '../gmail/gmail-card';
import { parseItemID } from '../gmail/parse-item-id';
import { readCallContext } from '../gmail/read-call-context';
import type { GoogleDeps } from '../types';
import { driveArgumentsSchema } from './drive-arguments-schema';
import { driveDeclarations } from './drive-declarations';
import { driveToolNames } from './drive-tool-names';
import { pickDriveChangeRefusal } from './pick-drive-change-refusal';
import { readDriveFile } from './read-drive-file';

// drive.change: replaces the whole content of a file, and may rename it, queued. It refuses a file
// shared with anyone or in a shared drive, because a change there reaches each person who can read
// it. `prepare` reads the file for the card, and the attempt reads it again.
export function buildDriveChangeTool(deps: GoogleDeps): ToolDefinition {
  return {
    name: driveToolNames.change,
    description:
      'Replaces the whole content of a Drive file that you made or the owner picked, and renames ' +
      'it when name is not null. text is Markdown for a Google Doc. It refuses a file that is ' +
      'shared with anyone or in a shared drive. The call is queued under your rules, and ' +
      "returns the action's ID.",
    input: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        name: { type: ['string', 'null'], minLength: 1, maxLength: 255 },
        text: { type: 'string', maxLength: 1_000_000 },
        connection: { type: 'string' },
      },
      required: ['file', 'text'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { file: { type: 'string' }, link: { type: ['string', 'null'] } },
      required: ['file', 'link'],
      additionalProperties: false,
    },
    declaration: driveDeclarations.change,
    execution: 'queued',
    resolveInput: makeResolveGoogleInput(deps.access, ['file']),
    prepare: async (input): Promise<Prepared | PrepareRefusal> => {
      const parsed = driveArgumentsSchema.change.safeParse(input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const context = await readCallContext(deps.access, input);

      const item = parseItemID(parsed.data.file);

      if (context === null || item === null) {
        return forgottenOutcome;
      }

      const read = await readDriveFile(deps.hosts, context, item.id);

      if (read.kind !== 'file') {
        return read.kind === 'missing'
          ? { status: 'error', message: `UNKNOWN_FILE: no file has the ID ${parsed.data.file}` }
          : buildFailureRefusal(read.failure);
      }

      const refusal = pickDriveChangeRefusal(read.file);

      if (refusal !== null) {
        return { status: 'error', message: refusal.message };
      }

      return {
        destinations: [],
        attachments: [
          buildCardAttachment({ name: read.file.name, rename: parsed.data.name ?? '' }),
        ],
      };
    },
    run: () =>
      Promise.resolve({ status: 'error', message: `${driveToolNames.change} runs only queued` }),
  };
}
