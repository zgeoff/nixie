import { definitionsFormats } from './definitions-formats';
import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import { formatManifestIssue } from './format-manifest-issue';
import { manifestPath } from './manifest-path';
import { manifestPromptsSchema } from './manifest-prompts-schema';
import { manifestSchema } from './manifest-schema';
import { parseConversationSkills } from './parse-conversation-skills';
import type { ManifestPrompts } from './parse-prompt-overrides';
import { parsePromptOverrides } from './parse-prompt-overrides';
import { parseSkills } from './parse-skills';
import type { ParsedDefinitions, Snapshot } from './types';

const personaPath = 'persona.md';

export function parseDefinitions(snapshot: Snapshot): ParsedDefinitions {
  const texts = decodeFiles(snapshot.files);
  const manifest = parseManifest(texts.get(manifestPath));
  const formatVersion = manifest.format;
  const persona = parsePersona(texts.get(personaPath));
  const hasSkills = formatVersion >= definitionsFormats.skills;
  const skills = hasSkills ? parseSkills(snapshot, texts) : [];

  const conversationSkills = hasSkills
    ? parseConversationSkills(texts.get(manifestPath) ?? '', skills)
    : [];

  const overrides = parsePromptOverrides(manifest.prompts, texts);

  const unapplied = [...texts.keys()]
    .filter((path) => path !== manifestPath && path !== personaPath)
    .filter((path) => !hasSkills || !path.startsWith('skills/'))
    .filter((path) => !overrides.partFiles.has(path))
    .toSorted();

  requireParsable(unapplied.map((path) => [path, texts.get(path) ?? '']));

  return {
    formatVersion,
    persona,
    skills,
    conversationSkills,
    prompts: overrides.prompts,
    unapplied,
  };
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

interface Manifest {
  readonly format: number;
  readonly prompts: ManifestPrompts | undefined;
}

function parseManifest(text: string | undefined): Manifest {
  if (text === undefined) {
    throw new DefinitionsParseError([
      { path: manifestPath, reason: 'the definitions have no manifest' },
    ]);
  }

  const manifest = parseYAML(manifestPath, text);
  const result = manifestSchema.safeParse(manifest);

  if (result.success) {
    const hasPrompts = result.data.format >= definitionsFormats.prompts;

    return {
      format: result.data.format,
      prompts: hasPrompts
        ? manifestPromptsSchema.optional().parse(findManifestField(manifest, 'prompts'))
        : undefined,
    };
  }

  const format = findManifestField(manifest, 'format');

  if (typeof format !== 'number' || !Number.isInteger(format)) {
    throw new DefinitionsParseError([
      { path: manifestPath, reason: 'format must be a whole number' },
    ]);
  }

  if (!definitionsFormats.readable.includes(format)) {
    const readable = definitionsFormats.readable.join(' or ');
    const reason = `format ${format} is not one this release reads, which is ${readable}`;

    throw new DefinitionsParseError([{ path: manifestPath, reason }]);
  }

  const reasons = new Set(result.error.issues.flatMap((issue) => formatManifestIssue(issue)));

  throw new DefinitionsParseError([...reasons].map((reason) => ({ path: manifestPath, reason })));
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

function findManifestField(manifest: unknown, field: string): unknown {
  return manifest !== null && typeof manifest === 'object' && field in manifest
    ? Object.getOwnPropertyDescriptor(manifest, field)?.value
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
