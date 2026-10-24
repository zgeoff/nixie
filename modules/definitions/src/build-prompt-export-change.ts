import type { PromptID, PromptPartFile } from '@heynixie/prompts';
import { collectPromptsWithoutSafety } from '@heynixie/prompts';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { buildPromptManifest } from './build-prompt-manifest';
import { defaultSizeLimits } from './default-size-limits';
import { definitionsFormats } from './definitions-formats';
import { manifestPath } from './manifest-path';
import { toPromptExportBranch } from './to-prompt-export-branch';
import type { DefinitionsChange, SkillExportText } from './types';

export type PromptExportText = Pick<SkillExportText, 'agentName' | 'ownerName'>;

export interface PromptExportInput {
  readonly approvalID: string;
  readonly proposalID: string;
  readonly promptID: PromptID;
  readonly entry: Readonly<Record<string, string>>;
  readonly files: readonly PromptPartFile[];
  readonly reason: string;
  readonly text: PromptExportText;

  readonly manifest: string;
}

export function buildPromptExportChange(promptExport: PromptExportInput): DefinitionsChange {
  const promptID = promptExport.promptID;
  const moves = collectSharedPaths(promptExport.manifest, promptID, promptExport.files);
  const toExportedPath = (path: string) => moves.get(path)?.to ?? path;

  const entry = Object.fromEntries(
    Object.entries(promptExport.entry).map(([key, value]) => [
      key,
      key === '_template' ? value : toExportedPath(value),
    ]),
  );

  const manifest = buildPromptManifest(promptExport.manifest, promptID, entry);

  if (new TextEncoder().encode(manifest.text).byteLength > defaultSizeLimits.maxFileBytes) {
    throw new Error(
      `the ${promptID} override takes ${manifestPath} past the ${defaultSizeLimits.maxFileBytes}-byte limit of a definitions file`,
    );
  }

  const agent = promptExport.text.agentName ?? 'nixie';
  const owner = promptExport.text.ownerName ?? 'the owner';

  const written = promptExport.files.map((file): [string, string] => [
    toExportedPath(file.path),
    file.text,
  ]);

  const removed = collectUnreadPaths(promptExport.manifest, promptID, [
    ...written.map(([path]) => path),
    ...Object.values(entry),
  ]);

  const files = new Map<string, string | null>([
    ...removed.map((path): [string, null] => [path, null]),
    ...written,
    [manifestPath, manifest.text],
  ]);

  const notes = [
    `${agent} proposed this override of the \`${promptID}\` prompt, and ${owner} approved it: approval \`${promptExport.approvalID}\`, proposal \`${promptExport.proposalID}\`.`,
    `The reason the proposal gives:\n\n${promptExport.reason
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}`,
    'The override applies after this pull request merges and `live` is promoted.',
  ];

  for (const path of removed) {
    notes.push(
      `The \`${promptID}\` entry it replaces read \`${path}\`, and no prompt reads it after the change, so the change removes it.`,
    );
  }

  for (const [path, move] of moves) {
    const readers = move.readers.map((reader) => `the \`${reader}\` prompt`).join(' and ');

    notes.push(
      `The proposal names \`${path}\`, which ${readers} reads too, so the change writes the part to \`${move.to}\`.`,
    );
  }

  if (manifest.previousFormat < definitionsFormats.prompts) {
    notes.push(
      `nixie.yaml held format ${String(manifest.previousFormat)}, and the seed applies the prompts map only from format ${String(definitionsFormats.prompts)}, so the change sets \`format: ${String(definitionsFormats.prompts)}\`.`,
    );
  }

  const parts = Object.fromEntries(
    Object.entries(promptExport.entry).flatMap(([key, path]) => {
      const file = promptExport.files.find((candidate) => candidate.path === path);

      return key === '_template' || file === undefined ? [] : [[key, file.text]];
    }),
  );

  const [withoutSafety] = collectPromptsWithoutSafety({
    [promptID]: { parts, template: promptExport.entry['_template'] ?? null },
  });

  if (withoutSafety !== undefined) {
    const safetyNote = match(withoutSafety.safety)
      .with(
        'replaced',
        () =>
          `The override replaces the built-in \`safety\` part of the \`${promptID}\` prompt, which holds its rules against text that tries to steer the model.`,
      )
      .with(
        'omitted',
        () =>
          `The override's template never reads \`{{ parts.safety }}\`, so the \`${promptID}\` prompt runs without its built-in safety rules.`,
      )
      .exhaustive();

    notes.push(safetyNote);
  }

  const title = `Override the ${promptID} prompt with the version ${agent} proposed`;

  return {
    branch: toPromptExportBranch(promptID),
    title,
    message: title,
    body: `${notes.join('\n\n')}\n`,
    files,
  };
}

interface SharedPath {
  readonly to: string;

  readonly readers: readonly string[];
}

const promptsFolder = 'prompts/';

// An approval covers one prompt, so a part file that another prompt's entry reads moves to the
// prompt's own folder instead of changing the text of that other prompt.
function collectSharedPaths(
  manifest: string,
  promptID: PromptID,
  files: readonly PromptPartFile[],
): ReadonlyMap<string, SharedPath> {
  const readers = collectOtherReaders(manifest, promptID);

  const proposed = new Set(files.map((file) => file.path));

  return new Map(
    files.flatMap((file) => {
      const fileReaders = readers.get(file.path);

      if (fileReaders === undefined) {
        return [];
      }

      const to = `${promptsFolder}${promptID}/${file.path.slice(promptsFolder.length)}`;

      if (readers.has(to) || proposed.has(to)) {
        throw new Error(
          `the ${promptID} override writes ${file.path}, which another prompt reads, and the path it would move to, ${to}, is taken`,
        );
      }

      return [[file.path, { to, readers: fileReaders }]];
    }),
  );
}

function collectOtherReaders(
  manifest: string,
  promptID: PromptID,
): ReadonlyMap<string, readonly string[]> {
  const prompts = parsePromptsMap(manifest);

  const readers = new Map<string, string[]>();

  for (const [reader, entry] of Object.entries(prompts)) {
    if (reader === promptID) {
      continue;
    }

    for (const [key, value] of Object.entries(entry)) {
      if (key !== '_template' && typeof value === 'string') {
        readers.set(value, [...(readers.get(value) ?? []), reader]);
      }
    }
  }

  return readers;
}

const promptEntrySchema = z.record(z.string(), z.unknown());
const promptsMapSchema = z.object({ prompts: z.record(z.string(), promptEntrySchema).nullish() });

function parsePromptsMap(
  manifest: string,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const parsed = promptsMapSchema.safeParse(Bun.YAML.parse(manifest));

  return parsed.success ? (parsed.data.prompts ?? {}) : {};
}

// A part file that no entry reads stays in the snapshot, and the seed still parses it, so the
// change removes the files that only the replaced entry read.
function collectUnreadPaths(
  manifest: string,
  promptID: PromptID,
  kept: readonly string[],
): readonly string[] {
  const replaced = parsePromptsMap(manifest)[promptID] ?? {};
  const readers = collectOtherReaders(manifest, promptID);

  return Object.entries(replaced).flatMap(([key, value]) =>
    key === '_template' || typeof value !== 'string' || readers.has(value) || kept.includes(value)
      ? []
      : [value],
  );
}
