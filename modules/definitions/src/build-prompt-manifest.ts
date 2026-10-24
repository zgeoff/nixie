import { isDeepStrictEqual } from 'node:util';
import type { PromptID } from '@heynixie/prompts';
import { definitionsFormats } from './definitions-formats';

export interface PromptManifest {
  readonly text: string;

  readonly previousFormat: number;
}

const formatLine = /^format:[ \t]*(?<format>\d+)[ \t]*(?<comment>#.*)?$/mu;

// nixie.yaml is the user's file, so the change edits only the lines of the format and of the one
// prompt's entry, and keeps every comment and the order of every other key.
export function buildPromptManifest(
  manifest: string,
  promptID: PromptID,
  entry: Readonly<Record<string, string>>,
): PromptManifest {
  const format = formatLine.exec(manifest);
  const previousFormat = Number(format?.groups?.['format'] ?? Number.NaN);

  if (format === null || !Number.isInteger(previousFormat)) {
    throw new Error('nixie.yaml on the base branch has no format line the export can read');
  }

  const formatted =
    previousFormat >= definitionsFormats.prompts
      ? manifest
      : manifest.replace(
          formatLine,
          [`format: ${definitionsFormats.prompts}`, format.groups?.['comment']]
            .filter((part) => part !== undefined)
            .join(' '),
        );

  const text = buildEntryText(formatted, promptID, entry);

  requireEdit(manifest, text, promptID, entry);

  return { text, previousFormat };
}

const promptsLine = /^prompts:[ \t]*(?:#.*)?$/u;

function buildEntryText(
  manifest: string,
  promptID: PromptID,
  entry: Readonly<Record<string, string>>,
): string {
  const lines = manifest.replace(/\n$/u, '').split('\n');
  const start = lines.findIndex((line) => promptsLine.test(line));

  if (start === -1) {
    return [...lines, 'prompts:', ...buildEntryLines(promptID, entry, '  '), ''].join('\n');
  }

  const end = getBlockEnd(lines, start, '');
  const childIndent = findIndent(lines.slice(start + 1, end)) ?? '  ';
  const entryLines = buildEntryLines(promptID, entry, childIndent);

  const entryStart = lines.findIndex(
    (line, index) => index > start && index < end && line.startsWith(`${childIndent}${promptID}:`),
  );

  if (entryStart === -1) {
    const last = getLastContent(lines, start, end);

    return [...lines.slice(0, last + 1), ...entryLines, ...lines.slice(last + 1), ''].join('\n');
  }

  const entryEnd = getBlockEnd(lines, entryStart, childIndent);

  return [...lines.slice(0, entryStart), ...entryLines, ...lines.slice(entryEnd), ''].join('\n');
}

function buildEntryLines(
  promptID: PromptID,
  entry: Readonly<Record<string, string>>,
  indent: string,
): readonly string[] {
  const valueIndent = `${indent}  `;
  const lines = [`${indent}${promptID}:`];

  for (const [key, value] of Object.entries(entry)) {
    // A YAML literal block turns each CRLF into LF and cannot hold edge whitespace as written.
    if (!value.includes('\n') || /^\s|\s$|\r/u.test(value)) {
      lines.push(`${valueIndent}${key}: ${JSON.stringify(value)}`);
      continue;
    }

    lines.push(`${valueIndent}${key}: |-`);

    for (const line of value.split('\n')) {
      const indented = line === '' ? '' : `${valueIndent}  ${line}`;

      lines.push(indented);
    }
  }

  return lines;
}

function getBlockEnd(lines: readonly string[], start: number, indent: string): number {
  const end = lines.findIndex((line, index) => {
    if (index <= start || line.trim() === '' || line.trimStart().startsWith('#')) {
      return false;
    }

    const lineIndent = /^[ \t]*/u.exec(line)?.[0] ?? '';

    return lineIndent.length <= indent.length;
  });

  return end === -1 ? lines.length : end;
}

function findIndent(lines: readonly string[]): string | null {
  const first = lines.find((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));

  return first === undefined ? null : (/^[ \t]*/u.exec(first)?.[0] ?? null);
}

function getLastContent(lines: readonly string[], start: number, end: number): number {
  const index = lines.findLastIndex(
    (line, candidate) => candidate > start && candidate < end && line.trim() !== '',
  );

  return index === -1 ? start : index;
}

function requireEdit(
  manifest: string,
  edited: string,
  promptID: PromptID,
  entry: Readonly<Record<string, string>>,
): void {
  const before = toMapping(Bun.YAML.parse(manifest));
  const after = toMapping(Bun.YAML.parse(edited));
  const prompts = toMapping(after['prompts']);

  const isKept = Object.keys({ ...before, ...after })
    .filter((key) => key !== 'format' && key !== 'prompts')
    .every((key) => isDeepStrictEqual(before[key], after[key]));

  const beforePrompts = toMapping(before['prompts']);

  const isOthersKept = Object.keys({ ...beforePrompts, ...prompts })
    .filter((key) => key !== promptID)
    .every((key) => isDeepStrictEqual(beforePrompts[key], prompts[key]));

  if (!isKept || !isOthersKept || !isDeepStrictEqual(prompts[promptID], { ...entry })) {
    throw new Error(
      `nixie.yaml on the base branch has a layout the export cannot edit for the ${promptID} prompt`,
    );
  }
}

function toMapping(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('nixie.yaml on the base branch holds a value the export cannot edit');
  }

  return Object.fromEntries(Object.entries(value));
}
