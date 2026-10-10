import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import type { ParsedDefinitions, Snapshot } from './types';

const manifestPath = 'nixie.yaml';
const personaPath = 'persona.md';

// Reads what the seed applies from a snapshot: the format version from nixie.yaml and the persona
// from persona.md. Slice 1 applies nothing else, so every other file only has to parse, and the
// seed lists it as unapplied. A file that fails to decode or parse fails the whole snapshot.
export function parseDefinitions(snapshot: Snapshot): ParsedDefinitions {
  const texts = decodeFiles(snapshot.files);
  const formatVersion = parseManifest(texts.get(manifestPath));
  const persona = parsePersona(texts.get(personaPath));
  const unapplied = [...texts.keys()]
    .filter((path) => path !== manifestPath && path !== personaPath)
    .toSorted();

  requireParsable(unapplied.map((path) => [path, texts.get(path) ?? '']));
  return { formatVersion, persona, unapplied };
}

function decodeFiles(files: Snapshot['files']): ReadonlyMap<string, string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const decoded = [...files].map(([path, bytes]) => {
    try {
      return { path, text: decoder.decode(bytes) };
    } catch {
      return { path, text: null };
    }
  });
  const problems = decoded
    .filter((file) => file.text === null)
    .map((file) => ({ path: file.path, reason: 'the file is not UTF-8 text' }));

  if (problems.length > 0) {
    throw new DefinitionsParseError(problems);
  }
  return new Map(decoded.map((file) => [file.path, file.text ?? '']));
}

// The definitions format this release writes. It reads this format and the one before, because an
// image upgrade and a definitions change land in either order.
const formatVersion = 1;
const readableFormats = [formatVersion - 1, formatVersion].filter((version) => version >= 1);

function parseManifest(text: string | undefined): number {
  if (text === undefined) {
    throw new DefinitionsParseError([
      { path: manifestPath, reason: 'the definitions have no manifest' },
    ]);
  }
  const format = getFormat(parseYAML(manifestPath, text));

  if (typeof format !== 'number' || !Number.isInteger(format)) {
    throw new DefinitionsParseError([
      { path: manifestPath, reason: 'format must be a whole number' },
    ]);
  }
  if (!readableFormats.includes(format)) {
    const readable = readableFormats.join(' or ');
    const reason = `format ${format} is not one this release reads, which is ${readable}`;

    throw new DefinitionsParseError([{ path: manifestPath, reason }]);
  }
  return format;
}

function getFormat(manifest: unknown): unknown {
  return manifest !== null && typeof manifest === 'object' && 'format' in manifest
    ? manifest.format
    : undefined;
}

function parsePersona(text: string | undefined): string {
  if (text === undefined) {
    throw new DefinitionsParseError([
      { path: personaPath, reason: 'the definitions have no persona' },
    ]);
  }
  if (text.trim().length === 0) {
    throw new DefinitionsParseError([{ path: personaPath, reason: 'the persona is empty' }]);
  }
  return text;
}

type TextFile = readonly [path: string, text: string];

function requireParsable(files: readonly TextFile[]): void {
  const problems = files.flatMap(([path, text]): ParseProblem[] => {
    try {
      if (path.endsWith('.json')) {
        JSON.parse(text);
      } else if (path.endsWith('.yaml') || path.endsWith('.yml')) {
        Bun.YAML.parse(text);
      }
      return [];
    } catch (error) {
      return [{ path, reason: formatError(error) }];
    }
  });

  if (problems.length > 0) {
    throw new DefinitionsParseError(problems);
  }
}

function parseYAML(path: string, text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    throw new DefinitionsParseError([{ path, reason: formatError(error) }]);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
