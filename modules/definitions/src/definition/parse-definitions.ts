import { parseVoiceFiles } from '@heynixie/calls';
import type { BudgetDefinition, EffectOverride } from '@heynixie/policy';
import { parseRuleDefinitions } from '../rule/parse-rule-definitions';
import { manifestSchema } from '../skill/manifest-schema';
import { parseConversationSkills } from '../skill/parse-conversation-skills';
import { parseSkills } from '../skill/parse-skills';
import { parseTaskDefinitions } from '../task/parse-task-definitions';
import { TaskSeedRefusedError } from '../task/task-seed-refused-error';
import type { TaskSeedContext } from '../task/types';
import type { DefinitionBudget, ParsedDefinitions, Snapshot } from '../types';
import { buildBudgetHash } from '../utils/build-budget-hash';
import { definitionsFormats } from '../utils/definitions-formats';
import type { ParseProblem } from '../utils/definitions-parse-error';
import { DefinitionsParseError } from '../utils/definitions-parse-error';
import { formatManifestIssue } from '../utils/format-manifest-issue';
import { manifestPath } from '../utils/manifest-path';
import { manifestPromptsSchema } from '../utils/manifest-prompts-schema';
import type { ManifestPrompts } from '../utils/parse-prompt-overrides';
import { parsePromptOverrides } from '../utils/parse-prompt-overrides';
import { parseBudgetDefinitions } from './parse-budget-definitions';
import { parseEffectDefinitions } from './parse-effect-definitions';

const personaPath = 'persona.md';

// A null context leaves the task definitions unread, for a check that looks at other files.
export function parseDefinitions(
  snapshot: Snapshot,
  tasks: TaskSeedContext | null,
): ParsedDefinitions {
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

  const budgets =
    formatVersion >= definitionsFormats.budgets
      ? parseBudgetDefinitions(texts, overrides.partFiles)
      : { budgets: [], paths: new Set<string>() };

  const rules =
    formatVersion >= definitionsFormats.rules
      ? parseRuleDefinitions(
          texts,
          overrides.partFiles,
          new Map(budgets.budgets.map((entry) => [entry.budget.id, entry.budget])),
        )
      : { rules: [], paths: new Set<string>(), warnings: [] };

  const effects =
    formatVersion >= definitionsFormats.effects
      ? parseEffectDefinitions(texts, overrides.partFiles)
      : { effects: new Map<string, EffectOverride>(), paths: new Set<string>() };

  const readsVoice = formatVersion >= definitionsFormats.voice;

  const voice = readsVoice
    ? parseVoiceFiles(
        new Map(
          [...texts].filter(
            ([path]) => path.startsWith('voice/') && !overrides.partFiles.has(path),
          ),
        ),
      )
    : { voice: null, problems: [], paths: new Set<string>() };

  const taskTexts = new Map(
    [...texts].filter(([path]) => path.startsWith('tasks/') && !overrides.partFiles.has(path)),
  );

  const taskDefinitions =
    tasks !== null && formatVersion >= definitionsFormats.tasks
      ? parseTaskDefinitions(taskTexts, tasks)
      : { definitions: [], warnings: [], faults: [], paths: new Set<string>() };

  if (taskDefinitions.faults.length > 0) {
    throw new TaskSeedRefusedError(taskDefinitions.faults);
  }

  const unapplied = [...texts.keys()]
    .filter((path) => path !== manifestPath && path !== personaPath)
    .filter((path) => !hasSkills || !path.startsWith('skills/'))
    .filter((path) => !overrides.partFiles.has(path))
    .filter((path) => !budgets.paths.has(path))
    .filter((path) => !rules.paths.has(path))
    .filter((path) => !effects.paths.has(path))
    .filter((path) => !taskDefinitions.paths.has(path))
    .filter((path) => !voice.paths.has(path))
    .toSorted();

  // A file under tasks/ that no definition applies is listed and never read. A file under voice/
  // that the voice settings leave out is listed, and a fault in it never refuses the seed.
  const readsTasks = formatVersion >= definitionsFormats.tasks;

  requireParsable(
    unapplied
      .filter((path) => !readsTasks || !path.startsWith('tasks/'))
      .filter((path) => !readsVoice || !path.startsWith('voice/'))
      .map((path) => [path, texts.get(path) ?? '']),
  );

  return {
    formatVersion,
    persona,
    skills,
    conversationSkills,
    prompts: overrides.prompts,
    rules: rules.rules,
    budgets: budgets.budgets.map((entry) => toDefinitionBudget(entry.budget)),
    ruleWarnings: rules.warnings,
    effects: effects.effects,
    tasks: taskDefinitions.definitions,
    taskWarnings: taskDefinitions.warnings,
    voice: voice.voice,
    voiceProblems: voice.problems,
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

function toDefinitionBudget(budget: BudgetDefinition): DefinitionBudget {
  return {
    id: budget.id,
    counts: budget.counts,
    limitMicros: budget.limitMicros,
    period: budget.period,
    hash: buildBudgetHash(budget),
  };
}
