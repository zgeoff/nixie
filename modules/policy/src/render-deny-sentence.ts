import { renderRule } from './render-rule';
import type { RuleEntry } from './types';

export function renderDenySentence(entry: RuleEntry): string {
  return `Not allowed by rule \`${entry.id}\` (r${String(entry.revision)}): ${renderRule(entry.rule)}`;
}
