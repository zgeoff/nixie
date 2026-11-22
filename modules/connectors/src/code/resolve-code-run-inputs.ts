import type { Log } from '@heynixie/log';
import type { FileSpec } from '@heynixie/sandbox';
import type { ToolRun } from '@heynixie/tools';
import { readWebFetchPage } from '../web/read-web-fetch-page';
import type { CodeRunInput } from './code-run-input';
import { codeRunLimits } from './code-run-limits';
import { formatCodeRunSize } from './format-code-run-size';
import { readCodeFile } from './read-code-file';

export interface CodeSkill {
  readonly name: string;

  // the content hash of the skill version the calling task pinned
  readonly hash: string;
  readonly files: ReadonlyMap<string, string>;
}

export type SkillLookup =
  | { readonly kind: 'ok'; readonly skills: readonly CodeSkill[] }
  | { readonly kind: 'missing'; readonly name: string };

// The notebook's reader of a note's current body. Connectors owns the shape, and the server passes
// the notebook module's implementation.
export interface NoteBodies {
  // null for an unknown or forgotten note
  readonly readBody: (shortID: string) => Promise<string | null>;
}

export interface CodeRunInputDeps {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly notes: NoteBodies;
  readonly readSkills: (run: ToolRun, names: readonly string[]) => Promise<SkillLookup>;
}

export interface ResolvedInputs {
  // each input file at its path in the work folder
  readonly files: readonly FileSpec[];
  readonly skills: readonly CodeSkill[];

  // each skill file at its path under /skills
  readonly skillFiles: readonly FileSpec[];
}

export type InputResolution =
  | { readonly kind: 'ok'; readonly inputs: ResolvedInputs }
  | { readonly kind: 'refused'; readonly message: string };

export const workDirectory = '/work';
export const skillsDirectory = '/skills';

// Resolves every input of the call, and refuses in the order the design lists: a file ID, a note
// ID, a page ID, a skill, then the total size.
export async function resolveCodeRunInputs(
  deps: CodeRunInputDeps,
  run: ToolRun,
  input: CodeRunInput,
): Promise<InputResolution> {
  const files: FileSpec[] = [];

  for (const entry of input.files) {
    if ('file' in entry) {
      const read = await readCodeFile(deps.log, { thread: run.thread, fileID: entry.file });

      if (read.kind === 'missing') {
        return { kind: 'refused', message: `No file ${entry.file} belongs to this thread.` };
      }

      if (read.kind === 'forgotten') {
        return { kind: 'refused', message: `The file ${entry.file} was forgotten.` };
      }

      files.push({ path: `${workDirectory}/${entry.path}`, content: read.bytes });
    }
  }

  for (const entry of input.files) {
    if ('note' in entry) {
      if (!run.tools.includes('notebook.read')) {
        return {
          kind: 'refused',
          message: `You cannot use the note ${entry.note} as a file, because you do not hold notebook.read.`,
        };
      }

      const body = await deps.notes.readBody(entry.note);

      if (body === null) {
        return { kind: 'refused', message: `No note ${entry.note} exists.` };
      }

      files.push({
        path: `${workDirectory}/${entry.path}`,
        content: new TextEncoder().encode(body),
      });
    }
  }

  for (const entry of input.files) {
    if ('page' in entry) {
      const page =
        run.session === undefined
          ? null
          : await readWebFetchPage(deps.log, { sessionKey: run.session.key, pageID: entry.page });

      if (page === null) {
        return { kind: 'refused', message: `No page ${entry.page} is stored in this session.` };
      }

      const text = new TextEncoder().encode(page.parts.join(''));

      files.push({ path: `${workDirectory}/${entry.path}`, content: text });
    }
  }

  const lookup = await deps.readSkills(run, input.skills);

  if (lookup.kind === 'missing') {
    return { kind: 'refused', message: `No skill ${lookup.name} is on your skill list.` };
  }

  const skillFiles = lookup.skills.flatMap((skill) =>
    [...skill.files].map(([path, text]) => ({
      path: `${skillsDirectory}/${skill.name}/${path}`,
      content: new TextEncoder().encode(text),
    })),
  );

  const bytes =
    Buffer.byteLength(input.program) +
    [...files, ...skillFiles].reduce((sum, file) => sum + file.content.byteLength, 0);

  if (bytes > codeRunLimits.inputBytes) {
    return {
      kind: 'refused',
      message: `The inputs come to ${formatCodeRunSize(bytes)}, past the limit of 64 MiB.`,
    };
  }

  return { kind: 'ok', inputs: { files, skills: lookup.skills, skillFiles } };
}
