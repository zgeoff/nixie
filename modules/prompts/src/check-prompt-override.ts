import { collectAcceptedPaths } from './collect-accepted-paths';
import { collectTemplatePaths } from './collect-template-paths';
import type { PromptID, PromptOverride } from './types';

export interface PromptOverrideProblem {
  readonly part: string | null;
  readonly reason: string;
}

export function checkPromptOverride(
  id: PromptID,
  override: PromptOverride,
): readonly PromptOverrideProblem[] {
  const partProblems = Object.entries(override.parts).flatMap(([part, text]) => {
    const accepted = collectAcceptedPaths(id, part);

    return collectUnknownPaths(text, accepted).map((path) => ({
      part,
      reason: `the ${part} part of the ${id} prompt reads {{ ${path} }}, which it does not accept; it accepts ${formatAccepted(accepted)}`,
    }));
  });

  const accepted = collectAcceptedPaths(id, null);

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
