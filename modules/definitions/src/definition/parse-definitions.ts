import type { BudgetDefinition, EffectOverride, PlaceFileEntry } from '@heynixie/policy';
import { parsePlaceFile } from '@heynixie/policy';
import { parseRuleDefinitions } from '../rule/parse-rule-definitions';
import { definitionSections } from '../section/definition-sections';
import type { DefinitionSection } from '../section/definition-sections';
import { manifestSchema } from '../skill/manifest-schema';
import { parseConversationSkills } from '../skill/parse-conversation-skills';
import { parseSkills } from '../skill/parse-skills';
import { parseTaskDefinitions } from '../task/parse-task-definitions';
import { TaskSeedRefusedError } from '../task/task-seed-refused-error';
import type { TaskSeedContext } from '../task/types';
import type { DefinitionBudget, ParsedDefinitions, SectionFileProblem, Snapshot } from '../types';
import { buildBudgetHash } from '../utils/build-budget-hash';
import { definitionsFormats } from '../utils/definitions-formats';
import type { ParseProblem } from '../utils/definitions-parse-error';
import { DefinitionsParseError } from '../utils/definitions-parse-error';
import { formatManifestIssue } from '../utils/format-manifest-issue';
import { manifestPath } from '../utils/manifest-path';
import { manifestPromptsSchema, retiredPromptIDs } from '../utils/manifest-prompts-schema';
import type { ManifestPrompts } from '../utils/parse-prompt-overrides';
import { parsePromptOverrides } from '../utils/parse-prompt-overrides';
import { parseBudgetDefinitions } from './parse-budget-definitions';
import { parseEffectDefinitions } from './parse-effect-definitions';
import { parseMcpDefinitions } from './parse-mcp-definitions';

const personaPath = 'persona.md';
const placesPath = 'places.yaml';

// A null context leaves the task definitions unread, for a check that looks at other files.
export function parseDefinitions(
  snapshot: Snapshot,
  tasks: TaskSeedContext | null,
): ParsedDefinitions {
  const sections = definitionSections.list();
  const decoded = decodeFiles(snapshot.files, sections);
  const texts = decoded.texts;
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

  const mcp =
    formatVersion >= definitionsFormats.mcp
      ? parseMcpDefinitions(texts, overrides.partFiles)
      : { overrides: {}, paths: new Set<string>() };

  const placesText = formatVersion >= definitionsFormats.places ? texts.get(placesPath) : undefined;
  const places = parsePlaces(placesText);
  const readSections = sections.filter((section) => formatVersion >= section.minFormat);

  const parsedSections = readSections.map((section) => ({
    section,
    parsed: section.parse(
      new Map(
        [...texts].filter(
          ([path]) => path.startsWith(`${section.folder}/`) && !overrides.partFiles.has(path),
        ),
      ),
    ),
  }));

  const sectionProblems: SectionFileProblem[] = parsedSections.flatMap((entry) =>
    entry.parsed.problems.map((problem) => toSectionProblem(entry.section.problemEvent, problem)),
  );

  const unreadableProblems: SectionFileProblem[] = sections.flatMap((section) =>
    decoded.unreadableSectionPaths
      .filter((path) => path.startsWith(`${section.folder}/`))
      .map((path) => toSectionProblem(section.problemEvent, toNotTextProblem(path))),
  );

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
    .filter((path) => !mcp.paths.has(path))
    .filter((path) => path !== placesPath || formatVersion < definitionsFormats.places)
    .filter((path) => !taskDefinitions.paths.has(path))
    .filter((path) => !parsedSections.some((entry) => entry.parsed.paths.has(path)))
    .toSorted();

  // A file under tasks/ that no definition applies is listed and never read. A file under the folder
  // of a section that the section leaves out is listed, and a fault in it never refuses the seed.
  const readsTasks = formatVersion >= definitionsFormats.tasks;

  requireParsable(
    unapplied
      .filter((path) => !readsTasks || !path.startsWith('tasks/'))
      .filter((path) => !readSections.some((section) => path.startsWith(`${section.folder}/`)))
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
    retiredPromptKeys: manifest.retiredPromptKeys,
    effects: effects.effects,
    places,
    mcp: mcp.overrides,
    tasks: taskDefinitions.definitions,
    taskWarnings: taskDefinitions.warnings,
    sections: Object.fromEntries(
      parsedSections.flatMap((entry) =>
        entry.parsed.value === null ? [] : [[entry.section.key, entry.parsed.value]],
      ),
    ),
    sectionProblems: [...sectionProblems, ...unreadableProblems],
    unapplied,
  };
}

interface DecodedFiles {
  readonly texts: ReadonlyMap<string, string>;

  // the files under a section's folder that are not UTF-8 text, which the section reports in place
  // of a refusal, whatever the format
  readonly unreadableSectionPaths: readonly string[];
}

function decodeFiles(
  files: Snapshot['files'],
  sections: readonly DefinitionSection[],
): DecodedFiles {
  const decoder = new TextDecoder('utf-8', { fatal: true });

  const decoded = [...files].map(([path, bytes]) => {
    try {
      return { path, text: decoder.decode(bytes) };
    } catch {
      return { path, text: null };
    }
  });

  const unreadable = decoded.filter((file) => file.text === null);

  const problems = unreadable
    .filter((file) => !sections.some((section) => file.path.startsWith(`${section.folder}/`)))
    .map((file) => toNotTextProblem(file.path));

  if (problems.length > 0) {
    throw new DefinitionsParseError(problems);
  }

  return {
    texts: new Map(decoded.flatMap((file) => (file.text === null ? [] : [[file.path, file.text]]))),
    unreadableSectionPaths: unreadable.map((file) => file.path),
  };
}

function toNotTextProblem(path: string): ParseProblem {
  return { path, reason: 'the file is not UTF-8 text' };
}

interface Manifest {
  readonly format: number;
  readonly prompts: ManifestPrompts | undefined;

  // the dotted path of each retired prompt key the manifest holds, which the parse drops
  readonly retiredPromptKeys: readonly string[];
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

    const prompts = hasPrompts
      ? manifestPromptsSchema.optional().parse(findManifestField(manifest, 'prompts'))
      : undefined;

    return {
      format: result.data.format,
      prompts,
      retiredPromptKeys: getRetiredPromptKeys(findManifestField(manifest, 'prompts')),
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

// Reads the raw prompts field, so a retired key is named under every readable format, including
// format 2, which ignores the rest of the prompts map.
function getRetiredPromptKeys(prompts: unknown): readonly string[] {
  if (prompts === null || typeof prompts !== 'object' || Array.isArray(prompts)) {
    return [];
  }

  return retiredPromptIDs.filter((id) => id in prompts).map((id) => `prompts.${id}`);
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

function parsePlaces(text: string | undefined): readonly PlaceFileEntry[] {
  if (text === undefined) {
    return [];
  }

  const parsed = parsePlaceFile(text);

  if (parsed.status === 'refused') {
    throw new DefinitionsParseError(
      parsed.problems.map((reason) => ({ path: placesPath, reason })),
    );
  }

  return parsed.places;
}

interface SectionProblemInput {
  readonly path: string;
  readonly reason: string;
}

function toSectionProblem(event: string, problem: SectionProblemInput): SectionFileProblem {
  return { event, path: problem.path, reason: problem.reason };
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
