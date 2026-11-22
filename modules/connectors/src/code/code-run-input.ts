import { z } from 'zod';

export const codeRunLanguages = ['python', 'javascript', 'typescript', 'bash'] as const;
const pathPattern = /^[\w./-]{1,200}$/u;

type CodeRunFileInput =
  | { readonly path: string; readonly file: string }
  | { readonly path: string; readonly note: string }
  | { readonly path: string; readonly image: string }
  | { readonly path: string; readonly page: string };

export interface CodeRunInput {
  readonly language: (typeof codeRunLanguages)[number];
  readonly program: string;
  readonly files: readonly CodeRunFileInput[];
  readonly skills: readonly string[];
}

const pathSchema = z.string().regex(pathPattern);

const fileInputSchema = z.union([
  z.strictObject({ path: pathSchema, file: z.string().min(1) }),
  z.strictObject({ path: pathSchema, note: z.string().min(1) }),
  z.strictObject({ path: pathSchema, image: z.string().min(1) }),
  z.strictObject({ path: pathSchema, page: z.string().min(1) }),
]);

const codeRunInputSchema = z.strictObject({
  language: z.enum(codeRunLanguages),
  program: z.string().min(1).max(100_000),
  files: z.array(fileInputSchema).max(50).optional(),
  skills: z.array(z.string().min(1)).max(10).optional(),
});

export type CodeRunInputParse =
  | { readonly kind: 'ok'; readonly input: CodeRunInput }
  | { readonly kind: 'refused'; readonly message: string };

// The input after the tool schema has passed it, checked against the path rules and the
// distinctness rules that the schema cannot state.
export function parseCodeRunInput(raw: unknown): CodeRunInputParse {
  const parsed = codeRunInputSchema.safeParse(raw);

  if (!parsed.success) {
    return { kind: 'refused', message: 'The code.run input is not valid.' };
  }

  const files = parsed.data.files ?? [];
  const skills = parsed.data.skills ?? [];
  const pathProblem = findPathProblem(files.map((file) => file.path));

  if (pathProblem !== null) {
    return { kind: 'refused', message: pathProblem };
  }

  if (new Set(skills).size !== skills.length) {
    return { kind: 'refused', message: 'A skill is listed twice.' };
  }

  return {
    kind: 'ok',
    input: { language: parsed.data.language, program: parsed.data.program, files, skills },
  };
}

function findPathProblem(paths: readonly string[]): string | null {
  for (const path of paths) {
    const segments = path.split('/');

    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      return `The path ${path} has an empty, "." or ".." segment.`;
    }

    if (segments[0] === 'out') {
      return `The path ${path} is under out/, which holds the files the program writes.`;
    }
  }

  if (new Set(paths).size !== paths.length) {
    return 'A path is listed twice.';
  }

  const folder = paths.find((path) => paths.some((other) => other.startsWith(`${path}/`)));

  return folder === undefined ? null : `The path ${folder} is both a file and a folder.`;
}
