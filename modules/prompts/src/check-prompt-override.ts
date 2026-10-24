import invariant from 'tiny-invariant';
import { collectTemplatePaths } from './collect-template-paths';
import { promptRegistry } from './prompt-registry';
import type { PromptID, PromptOverride } from './types';

export interface PromptOverrideProblem {
  readonly part: string | null;
  readonly reason: string;
}

export function checkPromptOverride(
  id: PromptID,
  override: PromptOverride,
): readonly PromptOverrideProblem[] {
  const entry = promptRegistry[id];
  const partNames = Object.keys(entry.parts);

  const partProblems = Object.entries(override.parts).flatMap(([part, text]) => {
    const index = partNames.indexOf(part);

    invariant(index !== -1, `the ${id} prompt has no part ${part}`);

    const accepted = [...entry.paths, ...partNames.slice(0, index).map((name) => `parts.${name}`)];

    return collectUnknownPaths(text, accepted).map((path) => ({
      part,
      reason: `the ${part} part of the ${id} prompt reads {{ ${path} }}, which it does not accept; it accepts ${formatAccepted(accepted)}`,
    }));
  });

  const accepted = [...entry.paths, ...partNames.map((name) => `parts.${name}`)];

  const templateProblems =
    override.template === null
      ? []
      : collectUnknownPaths(override.template, accepted).map((path) => ({
          part: null,
          reason: `the template of the ${id} prompt reads {{ ${path} }}, which it does not accept; it accepts ${formatAccepted(accepted)}`,
        }));

  return [...partProblems, ...templateProblems];
}

function collectUnknownPaths(text: string, accepted: readonly string[]): readonly string[] {
  return [...new Set(collectTemplatePaths(text))].filter((path) => !accepted.includes(path));
}

function formatAccepted(accepted: readonly string[]): string {
  return accepted.length === 0 ? 'no path' : accepted.join(', ');
}
