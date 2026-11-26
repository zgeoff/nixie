import type { ToolDefinition } from '@heynixie/tools';
import { makeResolveGoogleInput } from '../make-resolve-google-input';
import type { GoogleDeps } from '../types';
import { driveDeclarations } from './drive-declarations';
import { driveToolNames } from './drive-tool-names';

// drive.create: one new file in the root of My Drive, shared with no one, queued. `google_doc`
// imports the text as Markdown into a Google Doc, and `text` makes a plain text file.
export function buildDriveCreateTool(deps: GoogleDeps): ToolDefinition {
  return {
    name: driveToolNames.create,
    description:
      'Creates a file in the root of the My Drive of a connected Google account, shared with no ' +
      'one. With as google_doc the text is Markdown that becomes a Google Doc, and with as text ' +
      'it becomes a plain text file. The call is queued under your rules, and returns the ' +
      "action's ID. Once it runs, its outcome holds the file.",
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 255 },
        text: { type: 'string', maxLength: 1_000_000 },
        as: { type: 'string', enum: ['google_doc', 'text'] },
        connection: { type: 'string' },
      },
      required: ['name', 'text', 'as'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { file: { type: 'string' }, link: { type: ['string', 'null'] } },
      required: ['file', 'link'],
      additionalProperties: false,
    },
    declaration: driveDeclarations.create,
    execution: 'queued',
    resolveInput: makeResolveGoogleInput(deps.access, []),
    run: () =>
      Promise.resolve({ status: 'error', message: `${driveToolNames.create} runs only queued` }),
  };
}
