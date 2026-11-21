import type { CommandArgument, Redirection, Statement, Word, WordPart } from 'unbash';
import { parse } from 'unbash';
import { isPatternMatch } from './is-pattern-match';

// Whether a shell command line is plain commands of literal words joined by `;`, `&&`, `||` or `|`,
// and each command's words match the pattern. A trailing ` *` in the pattern also takes the command
// with no words after the rest, so `git status *` allows `git status`.
export function isCommandMatch(pattern: string, command: string): boolean {
  const commands = collectPlainCommands(command);

  return (
    commands !== null &&
    commands.length > 0 &&
    commands.every((words) => isWordsMatch(pattern, words))
  );
}

// The looser read for a rule that denies or asks: any plain command or any piece of the line that
// matches counts, because a line the strict read refuses must still meet a rule that stops it.
export function isCommandMentioned(pattern: string, command: string): boolean {
  const commands = collectPlainCommands(command);

  if (commands !== null && commands.some((words) => isWordsMatch(pattern, words))) {
    return true;
  }

  return command
    .split(/[;&|\n()`]+/u)
    .map((piece) => piece.trim().replaceAll(/\s+/gu, ' '))
    .some((piece) => isWordsMatch(pattern, [piece]));
}

// The words of each simple command, or null when the line holds anything but plain commands.
function collectPlainCommands(command: string): readonly (readonly string[])[] | null {
  if (command.includes('\n') || command.includes('\r')) {
    return null;
  }

  const script = parse(command);

  if (script.errors !== undefined && script.errors.length > 0) {
    return null;
  }

  const found: string[][] = [];

  for (const statement of script.commands) {
    if (!isPlainStatement(statement, found)) {
      return null;
    }
  }

  return found;
}

function isPlainStatement(statement: Statement, found: string[][]): boolean {
  if (statement.background === true) {
    return false;
  }

  const node = statement.command;

  if (node.type === 'AndOr') {
    return node.commands.every((inner) => isPlainNode(inner, found));
  }

  return isPlainNode(node, found);
}

function isPlainNode(node: Statement['command'], found: string[][]): boolean {
  if (node.type === 'Pipeline') {
    return (
      node.prefixes.length === 0 &&
      node.operators.every((operator) => operator === '|') &&
      node.commands.every((inner) => isPlainNode(inner, found))
    );
  }

  if (node.type !== 'Command' || node.name === undefined) {
    return false;
  }

  if (node.prefix.length > 0 || node.redirects.length > 0) {
    return false;
  }

  const words = [node.name, ...node.suffix].map((argument) => toLiteralText(argument));

  if (words.some((word) => word === null)) {
    return false;
  }

  found.push(words.filter((word) => word !== null));

  return true;
}

function toLiteralText(argument: CommandArgument | Redirection | Word): string | null {
  if (argument.type !== 'Word') {
    return null;
  }

  const parts = argument.parts ?? [];

  return parts.every((part) => isLiteralPart(part)) ? argument.value : null;
}

function isLiteralPart(part: WordPart): boolean {
  if (part.type === 'Literal' || part.type === 'SingleQuoted') {
    return true;
  }

  return part.type === 'DoubleQuoted' && part.parts.every((child) => child.type === 'Literal');
}

function isWordsMatch(pattern: string, words: readonly string[]): boolean {
  const text = words.join(' ');

  if (isPatternMatch(pattern, text)) {
    return true;
  }

  return pattern.endsWith(' *') && isPatternMatch(pattern.slice(0, -2), text);
}

// The pattern an always-allow rule offers for a command: its first words and a wildcard, such as
// `git status *`. A line with more than one command, or anything but literal words, gets none.
export function buildCommandPattern(command: string): string | null {
  const commands = collectPlainCommands(command);
  const [only] = commands?.length === 1 ? commands : [];

  if (only === undefined || only.length === 0) {
    return null;
  }

  const [, second] = only;
  const count = second === undefined || second.startsWith('-') ? 1 : 2;
  const first = only.slice(0, count);

  return first.some((word) => /[\s*]/u.test(word)) ? null : `${first.join(' ')} *`;
}
