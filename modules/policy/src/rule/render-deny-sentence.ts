import type { RuleEntry } from '../types';
import { renderRule } from './render-rule';

export function renderDenySentence(entry: RuleEntry): string {
  return `Not allowed by rule \`${entry.id}\` (r${String(entry.revision)}): ${renderRule(entry.rule)}`;
}
