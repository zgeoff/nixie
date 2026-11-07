import type { RuleForm } from '@heynixie/policy';
import { renderRule } from '@heynixie/policy';
import { match } from 'ts-pattern';
import type { DefinitionsChange, RuntimeRule } from './types';

export const ruleExportBranch = 'nixie/rules';

export interface RuleExportInput {
  readonly changes: readonly RuntimeRule[];
  readonly files: ReadonlyMap<string, string>;
}

const newRulesPath = 'rules/nixie.yaml';

// The export edits the user's YAML in place, rule by rule, so the comments and the order of every
// rule it leaves alone stay as the user wrote them.
export function buildRuleExportChange(input: RuleExportInput): DefinitionsChange {
  const files = new Map<string, string | null>();

  for (const change of input.changes) {
    const path = findRulePath(input.files, files, change.ruleID);
    const block = change.rule === null ? null : renderRuleBlock(change.rule.rule);

    if (path === null) {
      if (block !== null) {
        const text = files.get(newRulesPath) ?? input.files.get(newRulesPath) ?? '';

        files.set(newRulesPath, appendBlock(text, block));
      }

      continue;
    }

    const text = files.get(path) ?? input.files.get(path) ?? '';
    const edited = replaceBlock(text, change.ruleID, block);
    const kept = edited.trim() === '' ? null : `${edited.trimEnd()}\n`;

    files.set(path, kept);
  }

  const title = 'Update the rules nixie changed';

  return {
    branch: ruleExportBranch,
    title,
    message: title,
    body: renderBody(input.changes),
    files,
  };
}

function findRulePath(
  base: ReadonlyMap<string, string>,
  edited: ReadonlyMap<string, string | null>,
  ruleID: string,
): string | null {
  for (const [path, text] of base) {
    const current = edited.has(path) ? edited.get(path) : text;

    if (current !== null && current !== undefined && findBlock(current, ruleID) !== null) {
      return path;
    }
  }

  return null;
}

interface BlockRange {
  readonly start: number;
  readonly end: number;
}

const topLevelKeyPattern = /^(?<quote>["']?)(?<key>[a-z0-9]+(?:-[a-z0-9]+)*)\k<quote>[ \t]*:/u;

// A blank line or a comment at column 0 can sit inside a block, so the block runs to the next line
// of content at column 0, less the blank lines and comments just above it, which head the next rule.
function findBlock(text: string, ruleID: string): BlockRange | null {
  const lines = text.split('\n');

  const start = lines.findIndex(
    (line) => topLevelKeyPattern.exec(line)?.groups?.['key'] === ruleID,
  );

  if (start === -1) {
    return null;
  }

  let end = start + 1;

  while (end < lines.length && !isTopLevelLine(lines[end] ?? '')) {
    end += 1;
  }

  while (end > start + 1 && isGapLine(lines[end - 1] ?? '')) {
    end -= 1;
  }

  return { start, end };
}

function isTopLevelLine(line: string): boolean {
  return /^\S/u.test(line) && !line.startsWith('#');
}

function isGapLine(line: string): boolean {
  return line.trim() === '' || line.startsWith('#');
}

// JSON is a subset of YAML's flow style, so each value serialises with no YAML writer.
function renderRuleBlock(rule: RuleForm): string {
  const fields = Object.keys(rule)
    .filter((field) => field !== 'id')
    .toSorted((left, right) => toFieldRank(left) - toFieldRank(right));

  const lines = fields.map((field) => `  ${field}: ${JSON.stringify(rule[field])}`);

  return [`${rule.id}:`, ...lines].join('\n');
}

const ruleFieldOrder = [
  'outcome',
  'tools',
  'effects',
  'contexts',
  'jobs',
  'checks',
  'destinations',
  'sources',
  'expires',
  'mandate',
  'cel',
  'note',
];

function toFieldRank(field: string): number {
  const rank = ruleFieldOrder.indexOf(field);

  return rank === -1 ? ruleFieldOrder.length : rank;
}

function appendBlock(text: string, block: string): string {
  const trimmed = text.trimEnd();

  return trimmed === '' ? `${block}\n` : `${trimmed}\n${block}\n`;
}

function replaceBlock(text: string, ruleID: string, block: string | null): string {
  const range = findBlock(text, ruleID);

  if (range === null) {
    return text;
  }

  const lines = text.split('\n');
  const replacement = block === null ? [] : block.split('\n');

  return [...lines.slice(0, range.start), ...replacement, ...lines.slice(range.end)].join('\n');
}

function renderBody(changes: readonly RuntimeRule[]): string {
  const lines = changes.map((change) => {
    const sentence = change.rule === null ? 'Remove this rule.' : renderRule(change.rule.rule);

    const changer = match(change.changedBy)
      .with('owner', () => 'you')
      .with('nixie', () => 'nixie')
      .exhaustive();

    return `- \`${change.ruleID}\`: ${sentence} Changed by ${changer}: ${change.reason}`;
  });

  return [
    'nixie changed these rules while it ran. Each change is already in force, and merging this pull request makes your definitions hold it.',
    '',
    ...lines,
  ].join('\n');
}
