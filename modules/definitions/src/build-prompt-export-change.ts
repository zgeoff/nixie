import type { PromptID, PromptPartFile } from '@heynixie/prompts';
import { collectPromptsWithoutSafety } from '@heynixie/prompts';
import { match } from 'ts-pattern';
import { buildPromptManifest } from './build-prompt-manifest';
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
  const manifest = buildPromptManifest(promptExport.manifest, promptID, promptExport.entry);
  const agent = promptExport.text.agentName ?? 'nixie';
  const owner = promptExport.text.ownerName ?? 'the owner';

  const files = new Map<string, string | null>([
    ...promptExport.files.map((file): [string, string] => [file.path, file.text]),
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
