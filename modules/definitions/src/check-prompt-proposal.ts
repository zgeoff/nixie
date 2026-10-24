import { normalize } from 'node:path/posix';
import { z } from 'zod';
import { defaultSizeLimits } from './default-size-limits';
import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import { formatManifestIssue } from './format-manifest-issue';
import { isDefinitionsPath } from './is-definitions-path';
import { manifestPath } from './manifest-path';
import { manifestPromptsSchema } from './manifest-prompts-schema';
import { parsePromptOverrides } from './parse-prompt-overrides';

export interface PromptPartFile {
  readonly path: string;
  readonly text: string;
}

export interface PromptProposalInput {
  readonly id: string;
  readonly entry: Readonly<Record<string, string>>;
  readonly files: readonly PromptPartFile[];
}

const proposalManifestSchema = z.strictObject({ prompts: manifestPromptsSchema });

export function checkPromptProposal(proposal: PromptProposalInput): readonly ParseProblem[] {
  const manifest = proposalManifestSchema.safeParse({
    prompts: { [proposal.id]: proposal.entry },
  });

  if (!manifest.success) {
    const reasons = new Set(manifest.error.issues.flatMap((issue) => formatManifestIssue(issue)));

    return [...reasons].map((reason) => ({ path: manifestPath, reason }));
  }

  const template = proposal.entry['_template'] ?? '';

  // The template sits inline in nixie.yaml, which the seed reads under the same file size limit.
  if (new TextEncoder().encode(template).byteLength > defaultSizeLimits.maxFileBytes) {
    return [
      {
        path: manifestPath,
        reason: `prompts.${proposal.id}._template is past the ${defaultSizeLimits.maxFileBytes}-byte limit of ${manifestPath}`,
      },
    ];
  }

  const fileProblems = collectFileProblems(proposal);

  if (fileProblems.length > 0) {
    return fileProblems;
  }

  const texts = new Map(proposal.files.map((file) => [file.path, file.text]));

  try {
    const parsed = parsePromptOverrides(manifest.data.prompts, texts);

    return Object.keys(parsed.prompts).length === 0
      ? [{ path: manifestPath, reason: `prompts.${proposal.id} overrides no part and no template` }]
      : [];
  } catch (error) {
    if (error instanceof DefinitionsParseError) {
      return error.problems;
    }

    throw error;
  }
}

const partFolder = 'prompts/';

function collectFileProblems(proposal: PromptProposalInput): readonly ParseProblem[] {
  const read = new Set(
    Object.entries(proposal.entry).flatMap(([key, value]) => (key === '_template' ? [] : [value])),
  );

  const seen = new Set<string>();

  return proposal.files.flatMap((file): ParseProblem[] => {
    const path = file.path;

    if (seen.has(path)) {
      return [{ path, reason: 'the proposal holds the file twice' }];
    }

    seen.add(path);

    if (!path.startsWith(partFolder) || normalize(path) !== path || !isDefinitionsPath(path)) {
      return [
        {
          path,
          reason: `a part file sits under ${partFolder} and ends in .md, .json, .yaml or .yml`,
        },
      ];
    }

    if (new TextEncoder().encode(file.text).byteLength > defaultSizeLimits.maxFileBytes) {
      return [
        { path, reason: `the file is past the ${defaultSizeLimits.maxFileBytes}-byte limit` },
      ];
    }

    return read.has(path)
      ? []
      : [{ path, reason: `no part of prompts.${proposal.id} reads the file` }];
  });
}
